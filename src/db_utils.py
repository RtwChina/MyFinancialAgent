"""
数据库工具模块 - 支持 SQLite 本地开发和 Cloudflare D1
"""
import os
import json
import hashlib
import re
import sqlite3
from datetime import datetime
from typing import Optional, List, Dict, Any
from zoneinfo import ZoneInfo

_CST = ZoneInfo("Asia/Shanghai")


def now_cst() -> str:
    """返回当前北京时间字符串（UTC+8，格式 YYYY-MM-DD HH:MM:SS）。"""
    return datetime.now(tz=_CST).strftime("%Y-%m-%d %H:%M:%S")

from config import OUTPUT_DIR
from logger_utils import get_logger

logger = get_logger("db_utils")

# 数据库文件路径 (本地开发用)
LOCAL_DB_PATH = os.path.join(OUTPUT_DIR, "financial_data.db")

ACTION_PLAN_ACTIONS = ("准备开仓", "持仓观察", "已清仓复盘")
ACTION_PLAN_POSITIONS = ("0%", "0-5%", "5%-10%", "10%-15%", "15%-20%", "20%-25%", "25%-30%", ">30%")
DEFAULT_ACTION_PLAN_ACTION = "持仓观察"
DEFAULT_ACTION_PLAN_POSITION = "0-5%"
ZERO_POSITION_ACTIONS = {"准备开仓", "已清仓复盘"}
DEFAULT_ACCOUNT_BY_MARKET = {"美股": 1, "大A": 2}


def normalize_action_plan_action(value: Any) -> str:
    """归一化结构化操作计划动作枚举。"""
    text = str(value or "").strip()
    return text if text in ACTION_PLAN_ACTIONS else DEFAULT_ACTION_PLAN_ACTION


def normalize_action_plan_position(value: Any) -> str:
    """归一化结构化操作计划仓位枚举。"""
    text = str(value or "").strip()
    return text if text in ACTION_PLAN_POSITIONS else DEFAULT_ACTION_PLAN_POSITION


def default_action_plan_position_for_action(action_type: Any) -> str:
    return "0%" if normalize_action_plan_action(action_type) in ZERO_POSITION_ACTIONS else DEFAULT_ACTION_PLAN_POSITION


def normalize_action_plan_item(item: Dict[str, Any], sort_order: int = 0) -> Optional[Dict[str, Any]]:
    """清洗单条操作计划；缺少 symbol 时返回 None。"""
    symbol = str(item.get("symbol") or "").strip().upper()
    if not symbol:
        return None
    support_levels = str(item.get("support_levels") or item.get("supportLevels") or "").strip()
    resistance_levels = str(item.get("resistance_levels") or item.get("resistanceLevels") or "").strip()
    key_levels = str(item.get("key_levels") or item.get("keyLevels") or "").strip()
    return {
        "account_id": int(item.get("account_id") or item.get("accountId") or DEFAULT_ACCOUNT_BY_MARKET.get(item.get("market_type") or item.get("marketType") or "美股", 4)),
        "symbol": symbol,
        "action_type": normalize_action_plan_action(item.get("action_type") or item.get("actionType")),
        "entry_plan": str(item.get("entry_plan") or item.get("entryPlan") or "").strip(),
        "take_profit_plan": str(item.get("take_profit_plan") or item.get("takeProfitPlan") or "").strip(),
        "stop_loss_plan": str(item.get("stop_loss_plan") or item.get("stopLossPlan") or "").strip(),
        "support_levels": support_levels,
        "resistance_levels": resistance_levels,
        "key_levels": key_levels or format_support_resistance_levels(support_levels, resistance_levels),
        "current_position": normalize_action_plan_position(
            item.get("current_position") or item.get("currentPosition") or default_action_plan_position_for_action(item.get("action_type") or item.get("actionType"))
        ),
        "thinking": str(item.get("thinking") or "").strip(),
        "market_type": str(item.get("market_type") or item.get("marketType") or "美股").strip() or "美股",
        "sort_order": int(item.get("sort_order") if item.get("sort_order") is not None else item.get("sortOrder") or sort_order),
    }


def format_support_resistance_levels(support_levels: str, resistance_levels: str) -> str:
    """将支撑位和压力位合并为兼容旧 key_levels 的文本。"""
    sections: List[str] = []
    if support_levels:
        sections.append(f"支撑位：\n{support_levels}")
    if resistance_levels:
        sections.append(f"压力位：\n{resistance_levels}")
    return "\n\n".join(sections)


def get_db_connection(db_path: str = None) -> sqlite3.Connection:
    """获取数据库连接"""
    if db_path is None:
        db_path = LOCAL_DB_PATH

    # 确保目录存在
    os.makedirs(os.path.dirname(db_path), exist_ok=True)

    conn = sqlite3.connect(db_path)
    # row_factory 让 fetchall 返回可按列名访问的 Row 对象，而非普通元组
    conn.row_factory = sqlite3.Row
    return conn


def init_database(db_path: str = None):
    """初始化数据库表结构"""
    conn = get_db_connection(db_path)
    cursor = conn.cursor()

    # 读取 schema.sql
    schema_path = os.path.join(os.path.dirname(__file__), '..', 'tests', 'schema.sql')
    with open(schema_path, 'r', encoding='utf-8') as f:
        schema_sql = f.read()

    # 执行建表语句
    cursor.executescript(schema_sql)
    conn.commit()
    conn.close()

    logger.info(f"数据库初始化完成: {db_path or LOCAL_DB_PATH}")


def rebuild_database(db_path: str = None):
    """删除本地 SQLite 并按最新 schema 重建"""
    target_path = db_path or LOCAL_DB_PATH
    if os.path.exists(target_path):
        os.remove(target_path)
        logger.info("已删除旧数据库: %s", target_path)
    init_database(target_path)


def generate_news_hash(title: str, content: str, pub_date: str = None) -> str:
    """生成新闻唯一标识hash"""
    # 只取 content 前 100 字符，既能区分不同内容又避免因正文过长导致 hash 误差
    key = f"{title or ''}{content[:100] if content else ''}{pub_date or ''}"
    return hashlib.md5(key.encode('utf-8')).hexdigest()


# ========== 价格数据操作 ==========

def insert_price_data(data: Dict[str, Any], db_path: str = None) -> bool:
    """
    插入价格数据，使用 INSERT OR IGNORE 实现去重

    Args:
        data: 价格数据字典
        db_path: 数据库路径

    Returns:
        bool: 是否成功插入（True=新数据，False=重复数据）
    """
    try:
        conn = get_db_connection(db_path)
        cursor = conn.cursor()

        cursor.execute('''
            INSERT OR IGNORE INTO stock_raw
            (k_date, stock_name, symbol, yahoo_symbol, current_price, change_percent, volume, captured_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            data.get('k_date'),
            data.get('stock_name'),
            data.get('symbol'),
            data.get('yahoo_symbol'),
            data.get('current_price'),
            data.get('change_percent'),
            data.get('volume'),
            data.get('captured_at'),
            now_cst(),
        ))

        inserted = cursor.rowcount > 0
        conn.commit()
        conn.close()

        return inserted

    except Exception as e:
        logger.error(f"插入价格数据失败: {str(e)}")
        return False


def batch_insert_prices(prices: List[Dict[str, Any]], db_path: str = None) -> int:
    """批量插入价格数据，返回成功插入的数量"""
    inserted_count = 0
    for price in prices:
        if insert_price_data(price, db_path):
            inserted_count += 1
    return inserted_count


def get_price_by_date(k_date: str, db_path: str = None) -> List[Dict]:
    """查询指定日期的价格数据"""
    conn = get_db_connection(db_path)
    cursor = conn.cursor()

    cursor.execute(
        'SELECT * FROM stock_raw WHERE k_date = ? ORDER BY symbol',
        (k_date,)
    )

    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]


def get_recent_empty_price_records(date_from: str, db_path: str = None) -> List[Dict[str, Any]]:
    """查询指定起始日期以来，已存在 k_date 但 current_price 为空的价格记录。"""
    conn = get_db_connection(db_path)
    cursor = conn.cursor()
    cursor.execute(
        '''
        SELECT symbol, yahoo_symbol, stock_name, k_date
        FROM stock_raw
        WHERE k_date IS NOT NULL
          AND current_price IS NULL
          AND k_date >= ?
        ORDER BY k_date DESC, symbol
        ''',
        (date_from,),
    )
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def repair_price_data(data: Dict[str, Any], db_path: str = None) -> bool:
    """按 (symbol, k_date) 更新已有空价格记录，不插入新行。"""
    try:
        conn = get_db_connection(db_path)
        cursor = conn.cursor()
        cursor.execute(
            '''
            UPDATE stock_raw
            SET yahoo_symbol = COALESCE(?, yahoo_symbol),
                stock_name = COALESCE(?, stock_name),
                current_price = ?,
                change_percent = ?,
                volume = ?,
                captured_at = ?
            WHERE symbol = ?
              AND k_date = ?
              AND current_price IS NULL
            ''',
            (
                data.get('yahoo_symbol'),
                data.get('stock_name'),
                data.get('current_price'),
                data.get('change_percent'),
                data.get('volume'),
                data.get('captured_at'),
                data.get('symbol'),
                data.get('k_date'),
            ),
        )
        updated = cursor.rowcount > 0
        conn.commit()
        conn.close()
        return updated
    except Exception as e:
        logger.error("修复价格数据失败: %s", str(e))
        return False


# ========== 新闻数据操作 ==========

def upsert_news_data(data: Dict[str, Any], db_path: str = None) -> str:
    """
    插入新闻数据，使用 news_hash 去重

    Args:
        data: 新闻数据字典
        db_path: 数据库路径

    Returns:
        bool: 是否成功插入（True=新数据，False=重复数据或无效数据）
    """
    try:
        # 兼容两种字段名：爬虫写入用 'time'，内部流转用 'pub_date'
        pub_date = data.get('time') or data.get('pub_date')
        # 过滤无效数据：没有 pub_date 的新闻不插入
        if not pub_date:
            logger.debug(f"跳过无发布时间的新闻: {data.get('title', '')[:50] or data.get('content', '')[:50]}")
            return False

        conn = get_db_connection(db_path)
        cursor = conn.cursor()

        news_hash = generate_news_hash(
            data.get('title'),
            data.get('content'),
            pub_date
        )
        cursor.execute(
            'SELECT id FROM news_raw_data WHERE news_hash = ?',
            (news_hash,)
        )
        existing = cursor.fetchone()
        related_symbols = data.get('related_symbols')
        # 若调用方传入列表，序列化为 JSON 字符串存储（SQLite 无原生数组类型）
        if isinstance(related_symbols, (list, tuple)):
            related_symbols = json.dumps(list(related_symbols), ensure_ascii=False)

        cursor.execute('''
            INSERT INTO news_raw_data
            (
                pub_date, title, content, url, source, type,
                rule_passed, rule_reason, processing_status, ai_summary, market_impact,
                importance_stars, related_symbols, is_relevant_to_review, news_hash, captured_at,
                created_at, language, sub_source
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(news_hash) DO UPDATE SET
                pub_date = excluded.pub_date,
                title = excluded.title,
                content = excluded.content,
                url = excluded.url,
                source = excluded.source,
                type = excluded.type,
                rule_passed = excluded.rule_passed,
                rule_reason = excluded.rule_reason,
                processing_status = excluded.processing_status,
                ai_summary = excluded.ai_summary,
                market_impact = excluded.market_impact,
                importance_stars = excluded.importance_stars,
                related_symbols = excluded.related_symbols,
                is_relevant_to_review = excluded.is_relevant_to_review,
                captured_at = excluded.captured_at,
                language = excluded.language,
                sub_source = excluded.sub_source
        ''', (
            pub_date,
            data.get('title'),
            data.get('content'),
            data.get('url'),
            data.get('source'),
            data.get('type', 'index'),
            1 if data.get('rule_passed') else 0,
            data.get('rule_reason'),
            data.get('processing_status', 'rule_screened'),
            data.get('ai_summary'),
            data.get('market_impact'),
            data.get('importance_stars', 0),
            related_symbols,
            1 if data.get('is_relevant_to_review', True) else 0,
            news_hash,
            now_cst(),
            now_cst(),
            data.get('language', 'zh'),
            data.get('sub_source', ''),
        ))

        conn.commit()
        conn.close()
        # 根据写入前是否已存在记录，区分 inserted / updated 两种状态
        return "inserted" if not existing else "updated"

    except Exception as e:
        logger.error(f"插入新闻数据失败: {str(e)}")
        return "ignored"


def insert_news_data(data: Dict[str, Any], db_path: str = None) -> bool:
    """兼容旧调用，保留布尔返回"""
    return upsert_news_data(data, db_path) == "inserted"


def upsert_news_batch(news_list: List[Dict[str, Any]], db_path: str = None) -> Dict[str, int]:
    """批量写入新闻数据，返回新增/更新统计"""
    stats = {"inserted": 0, "updated": 0, "ignored": 0}
    for news in news_list:
        result = upsert_news_data(news, db_path)
        stats[result] = stats.get(result, 0) + 1
    return stats


def batch_insert_news(news_list: List[Dict[str, Any]], db_path: str = None) -> int:
    """兼容旧调用，返回新增+更新数量"""
    stats = upsert_news_batch(news_list, db_path)
    return stats["inserted"] + stats["updated"]


def get_news_by_date_range(start_time: datetime, end_time: datetime, db_path: str = None) -> List[Dict]:
    """查询指定时间范围内的新闻"""
    conn = get_db_connection(db_path)
    cursor = conn.cursor()

    cursor.execute('''
        SELECT * FROM news_raw_data
        WHERE pub_date >= ? AND pub_date <= ?
        ORDER BY pub_date DESC
    ''', (
        start_time.strftime('%Y-%m-%d %H:%M:%S'),
        end_time.strftime('%Y-%m-%d %H:%M:%S'),
    ))

    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]


# ========== 复盘数据操作 ==========

def save_archive(data: Dict[str, Any], db_path: str = None) -> bool:
    """按日期保存或更新复盘记录；未传 market_review 时保留已存市场文档，不写冻结的旧笔记列与价位表。"""
    try:
        conn = get_db_connection(db_path)
        cursor = conn.cursor()
        has_market_review = 'market_review' in data
        market_review_json = json.dumps(data['market_review'], ensure_ascii=False) if has_market_review else None

        cursor.execute('''
            INSERT INTO daily_review_archive
            (
                archive_date, review_status, reviewer_news_notes, market_review_json,
                trading_summary, reviewed_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(archive_date) DO UPDATE SET
                review_status = excluded.review_status,
                reviewer_news_notes = excluded.reviewer_news_notes,
                market_review_json = CASE WHEN ? THEN excluded.market_review_json
                    ELSE daily_review_archive.market_review_json END,
                trading_summary = excluded.trading_summary,
                reviewed_at = excluded.reviewed_at,
                updated_at = excluded.updated_at
        ''', (
            data.get('archive_date'),
            data.get('review_status', 'draft'),
            data.get('reviewer_news_notes') or data.get('news_brief'),
            market_review_json,
            data.get('trading_summary'),
            data.get('reviewed_at'),
            data.get('updated_at', now_cst()),
            has_market_review,
        ))

        conn.commit()
        conn.close()

        return True

    except Exception as e:
        logger.error(f"保存复盘记录失败: {str(e)}")
        return False


def initialize_archive_record(archive_date: str, db_path: str = None) -> bool:
    """初始化复盘记录。

    已 reviewed 的日期不覆盖；其余日期清空笔记、新市场文档与冻结旧笔记列，保留日期价位与计划。
    """
    try:
        conn = get_db_connection(db_path)
        cursor = conn.cursor()
        now = now_cst()

        # WHERE 守卫让并发写入 reviewed 后也不会被 initialized 覆盖。
        cursor.execute('''
            INSERT INTO daily_review_archive
            (
                archive_date, review_status, reviewer_news_notes, market_review_json,
                market_sentiment_blocks_json, sector_rotation_blocks_json,
                trading_summary, reviewed_at, updated_at
            )
            VALUES (?, 'initialized', '', NULL, NULL, NULL, '', NULL, ?)
            ON CONFLICT(archive_date) DO UPDATE SET
                review_status = 'initialized',
                reviewer_news_notes = '',
                market_review_json = NULL,
                market_sentiment_blocks_json = NULL,
                sector_rotation_blocks_json = NULL,
                trading_summary = '',
                reviewed_at = NULL,
                updated_at = excluded.updated_at
            WHERE daily_review_archive.review_status IS NOT 'reviewed'
        ''', (
            archive_date,
            now,
        ))

        conn.commit()
        conn.close()
        return True
    except Exception as e:
        logger.error(f"初始化复盘记录失败: {str(e)}")
        return False


def get_archive_by_date(archive_date: str, db_path: str = None) -> Optional[Dict]:
    """查询指定日期的复盘记录"""
    conn = get_db_connection(db_path)
    cursor = conn.cursor()

    cursor.execute(
        'SELECT * FROM daily_review_archive WHERE archive_date = ?',
        (archive_date,)
    )

    row = cursor.fetchone()
    conn.close()

    return dict(row) if row else None


def _select_review_action_plan_rows(conn: sqlite3.Connection, archive_date: str) -> List[Dict[str, Any]]:
    return [dict(row) for row in conn.execute(
        '''
        SELECT p.*, a.name AS account_name, a.currency AS account_currency,
            a.sort_order AS account_sort_order, a.enabled AS account_enabled,
            l.symbol AS _level_symbol, l.support_levels AS _shared_support,
            l.resistance_levels AS _shared_resistance
        FROM daily_review_action_plans p
        LEFT JOIN investment_accounts a ON a.id = p.account_id
        LEFT JOIN daily_review_symbol_levels l
            ON l.archive_date = p.archive_date AND l.symbol = p.symbol
        WHERE p.archive_date = ?
        ORDER BY COALESCE(a.sort_order, 999), p.account_id, p.sort_order, p.symbol, p.id
        ''', (archive_date,),
    )]


def _review_initial_symbol_levels(
    conn: sqlite3.Connection, archive_date: str, plans: List[Dict[str, Any]],
) -> Dict[str, Dict[str, str]]:
    """解析目标日旧笔记与计划的初始价位。"""
    levels: Dict[str, Dict[str, str]] = {}
    fields = ("support_levels", "resistance_levels")

    def select(symbol: str, field: str, value: Any) -> None:
        current = levels.setdefault(symbol, dict.fromkeys(fields, ""))
        if not current[field] and isinstance(value, str) and value.strip():
            current[field] = value  # 空白只用于判空，不修剪原多行文本。

    archive = conn.execute(
        '''SELECT market_review_json, market_sentiment_blocks_json, sector_rotation_blocks_json
           FROM daily_review_archive WHERE archive_date = ?''', (archive_date,),
    ).fetchone()
    # 新文档非 NULL（包括 blocks=[]）后，冻结的旧两列不再参与选择。
    if archive and archive["market_review_json"] is None:
        catalog = [dict(row) for row in conn.execute(
            "SELECT symbol, display_name, aliases FROM tracked_symbols ORDER BY id"
        )]

        def array(value: Any) -> list:
            if isinstance(value, str):
                try:
                    value = json.loads(value)
                except (ValueError, TypeError):
                    return []
            return value if isinstance(value, list) else []

        def aliases(value: Any) -> list:
            if isinstance(value, str):
                try:
                    value = json.loads(value)
                except (ValueError, TypeError):
                    value = re.split(r"[,，]", value)
            return [alias for alias in value if isinstance(alias, str)] if isinstance(value, list) else []

        def text(value: Any) -> str:
            return value if isinstance(value, str) else "" if value is None else str(value)

        # 与 market-review-model.js resolveLegacyBlockItem 保持一致：唯一系统代码（区分大小写）
        # → 与整个标题相同的名称/别名 → 大盘组的非 ETF 标普标题；其余不猜。
        def linked_symbol(title: str, group: str) -> Optional[str]:
            codes = {item["symbol"] for item in catalog if isinstance(item["symbol"], str) and item["symbol"]
                     and re.search(r"(^|[^A-Za-z0-9])" + re.escape(item["symbol"]) + r"([^A-Za-z0-9]|$)", title)}
            if codes:
                return next(iter(codes)) if len(codes) == 1 else None
            needle = title.strip().lower()
            if not needle:
                return None
            names = {item["symbol"] for item in catalog
                     if any(name.strip().lower() == needle for name in [text(item["display_name"]), *aliases(item["aliases"])])}
            if names:
                return next(iter(names)) if len(names) == 1 else None
            if (group == "market" and re.search(r"标普\s*500|S\s*&\s*P\s*500|SP\s*500", title, re.IGNORECASE)
                    and not re.search(r"ETF", title, re.IGNORECASE) and any(item["symbol"] == "GSPC" for item in catalog)):
                return "GSPC"
            return None

        titles = {
            "support_levels": {"支撑位", "支撑", "支持", "支持位", "支撑位(support)"},
            "resistance_levels": {"压力位", "压力", "阻力位", "阻力", "压力位(resistance)", "阻力位(resistance)"},
        }
        for group, column in (("market", "market_sentiment_blocks_json"), ("rotation", "sector_rotation_blocks_json")):
            for block in array(archive[column]):
                if not isinstance(block, dict):
                    continue
                symbol = linked_symbol(text(block.get("title")), group)
                if not symbol:
                    continue
                children = block.get("children")
                seen = set()
                for child in children if isinstance(children, list) else []:
                    if not isinstance(child, dict):
                        continue
                    title = re.sub(r"\s+", "", text(child.get("title")).replace("（", "(").replace("）", ")")).lower()
                    field = next((field for field in fields if title in titles[field]), None)
                    if field and field not in seen:
                        seen.add(field)  # 重复预设的后项属于旧自定义原文，不参与价位。
                        select(symbol, field, text(child.get("body")))

    for plan in plans:  # 已按账户 sort_order 排序；两个字段各自取首份非空。
        for field in fields:
            select(plan["symbol"], field, plan.get(field))
    return levels


def _read_review_action_plans(conn: sqlite3.Connection, archive_date: str) -> List[Dict[str, Any]]:
    rows = _select_review_action_plan_rows(conn, archive_date)
    initial = _review_initial_symbol_levels(conn, archive_date, rows)
    for row in rows:
        exists = row.pop("_level_symbol") is not None
        support = row.pop("_shared_support")
        resistance = row.pop("_shared_resistance")
        if exists:  # 行存在即两个字段权威，不能用空字符串退回旧值。
            row["support_levels"], row["resistance_levels"] = support, resistance
        else:
            row.update(initial[row["symbol"]])
    return rows


def list_review_action_plans(archive_date: str, db_path: str = None) -> List[Dict[str, Any]]:
    """读取本日共用价位投影，不物化旧材料、不跨日沿用。"""
    conn = get_db_connection(db_path)
    try:
        return _read_review_action_plans(conn, archive_date)
    finally:
        conn.close()


_REVIEW_LEVEL_PATCHES_UNSET = object()


def _normalize_review_level_patches(symbol_levels: Any) -> List[Dict[str, str]]:
    if symbol_levels is _REVIEW_LEVEL_PATCHES_UNSET:
        return []
    if not isinstance(symbol_levels, list):
        raise ValueError("symbol_levels 必须是补丁数组")
    patches = []
    seen = set()
    for item in symbol_levels:
        if not isinstance(item, dict) or not isinstance(item.get("symbol"), str) or not item["symbol"].strip():
            raise ValueError("价位补丁必须包含非空字符串 symbol")
        symbol = item["symbol"].strip().upper()
        if symbol in seen:
            raise ValueError("同一 symbol 不能出现多个价位补丁")
        seen.add(symbol)
        patch = {"symbol": symbol}
        for snake, camel in (("support_levels", "supportLevels"), ("resistance_levels", "resistanceLevels")):
            if snake in item and camel in item:
                raise ValueError(f"价位补丁不能同时提交 {snake} 和 {camel}")
            key = snake if snake in item else camel
            if key in item:
                if not isinstance(item[key], str):
                    raise ValueError(f"{key} 必须为字符串；空字符串表示清空")
                patch[snake] = item[key]
        if len(patch) == 1:
            raise ValueError("价位补丁至少需要一个显式价位字段")
        patches.append(patch)
    return patches


def replace_review_action_plans(
    archive_date: str,
    action_plans: List[Dict[str, Any]],
    db_path: str = None,
    symbol_levels: Any = _REVIEW_LEVEL_PATCHES_UNSET,
) -> List[Dict[str, Any]]:
    """原子替换日计划及显式补丁；省略/[]不改价位，NULL无效，不更新市场结构。"""
    patches = _normalize_review_level_patches(symbol_levels)  # 所有补丁在写入前校验。
    normalized: List[Dict[str, Any]] = []
    seen_keys: set[tuple[int, str]] = set()
    for index, item in enumerate(action_plans or []):
        plan = normalize_action_plan_item(item, index)
        key = (int(plan["account_id"]), plan["symbol"]) if plan else (0, "")
        if not plan or key in seen_keys:
            continue
        seen_keys.add(key)
        # normalizer 的旧 key_levels 生成逻辑不用于此新写路径。
        supplied_key = item.get("key_levels") if "key_levels" in item else item.get("keyLevels")
        plan["key_levels"] = supplied_key if isinstance(supplied_key, str) else ""
        normalized.append(plan)

    conn = get_db_connection(db_path)
    try:
        conn.execute("BEGIN IMMEDIATE")  # 首次初值必须来自同一事务中的写前材料。
        now = now_cst()
        if patches:
            before = _select_review_action_plan_rows(conn, archive_date)
            initial = _review_initial_symbol_levels(conn, archive_date, before)
            allowed_symbols = {row["symbol"] for row in conn.execute(
                "SELECT symbol FROM tracked_symbols WHERE is_active = 1"
            )}
            # 历史身份只取目标日已存材料，不信任本次请求的新计划或展示代码。
            allowed_symbols.update(row["symbol"] for row in before)
            for row in conn.execute(
                "SELECT symbol, support_levels, resistance_levels FROM daily_review_symbol_levels WHERE archive_date = ?",
                (archive_date,),
            ):
                allowed_symbols.add(row["symbol"])
                initial[row["symbol"]] = {field: row[field] for field in ("support_levels", "resistance_levels")}
            archive = conn.execute(
                "SELECT market_review_json FROM daily_review_archive WHERE archive_date = ?", (archive_date,),
            ).fetchone()
            if archive and archive["market_review_json"] is not None:
                document = json.loads(archive["market_review_json"])
                if not isinstance(document, dict) or not isinstance(document.get("blocks"), list):
                    raise ValueError("已存市场文档必须包含 blocks 数组")
                allowed_symbols.update(
                    block["symbol"] for block in document["blocks"]
                    if isinstance(block, dict) and block.get("type") == "symbol"
                    and isinstance(block.get("symbol"), str)
                )
            for patch in patches:
                if patch["symbol"] not in allowed_symbols:
                    raise ValueError(f"价位标的不可用：{patch['symbol']}")
            for patch in patches:
                values = dict(initial.get(patch["symbol"], {"support_levels": "", "resistance_levels": ""}))
                values.update({field: patch[field] for field in ("support_levels", "resistance_levels") if field in patch})
                conn.execute(
                    '''INSERT INTO daily_review_symbol_levels
                       (archive_date, symbol, support_levels, resistance_levels, created_at, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?)
                       ON CONFLICT(archive_date, symbol) DO UPDATE SET
                           support_levels = excluded.support_levels,
                           resistance_levels = excluded.resistance_levels,
                           updated_at = excluded.updated_at''',
                    (archive_date, patch["symbol"], values["support_levels"], values["resistance_levels"], now, now),
                )

        for index, plan in enumerate(normalized):
            conn.execute(
                '''
                INSERT INTO daily_review_action_plans (
                    archive_date, account_id, symbol, action_type, entry_plan, take_profit_plan,
                    stop_loss_plan, key_levels, support_levels, resistance_levels,
                    current_position, thinking, market_type, sort_order, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(archive_date, account_id, symbol) DO UPDATE SET
                    action_type = excluded.action_type,
                    entry_plan = excluded.entry_plan,
                    take_profit_plan = excluded.take_profit_plan,
                    stop_loss_plan = excluded.stop_loss_plan,
                    current_position = excluded.current_position,
                    thinking = excluded.thinking,
                    market_type = excluded.market_type,
                    sort_order = excluded.sort_order,
                    updated_at = excluded.updated_at
                ''',
                (archive_date, plan["account_id"], plan["symbol"], plan["action_type"],
                 plan["entry_plan"], plan["take_profit_plan"], plan["stop_loss_plan"], plan["key_levels"],
                 plan["current_position"], plan["thinking"], plan["market_type"],
                 int(plan.get("sort_order", index)), now, now),
            )

        if normalized:
            conditions = " OR ".join("(account_id = ? AND symbol = ?)" for _ in normalized)
            values = [value for plan in normalized for value in (plan["account_id"], plan["symbol"])]
            conn.execute(
                f'''DELETE FROM daily_review_action_plans
                    WHERE archive_date = ? AND NOT ({conditions})''', (archive_date, *values),
            )
        else:
            conn.execute("DELETE FROM daily_review_action_plans WHERE archive_date = ?", (archive_date,))

        saved = {(row["account_id"], row["symbol"]): row for row in _read_review_action_plans(conn, archive_date)}
        for plan in normalized:
            row = saved[(plan["account_id"], plan["symbol"])]
            for field in ("support_levels", "resistance_levels", "key_levels"):
                plan[field] = row[field]
        conn.commit()
        return normalized
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def count_review_action_plans(archive_date: str, db_path: str = None) -> int:
    """统计指定复盘日的结构化操作计划数量。"""
    conn = get_db_connection(db_path)
    cursor = conn.cursor()
    cursor.execute(
        'SELECT COUNT(*) AS cnt FROM daily_review_action_plans WHERE archive_date = ?',
        (archive_date,),
    )
    row = cursor.fetchone()
    conn.close()
    return int(row["cnt"] if row else 0)


# ========== 新闻分析结果操作 ==========

def save_daily_news_ai_analysis(data: Dict[str, Any], db_path: str = None) -> bool:
    """保存新闻分析结果（LLM 筛选的重大新闻）"""
    try:
        conn = get_db_connection(db_path)
        cursor = conn.cursor()

        cursor.execute('''
            INSERT INTO daily_news_ai_analysis
            (analysis_date, daily_major_events, sector_impact_map, linkage_logic_chain, source_news_ids, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(analysis_date) DO UPDATE SET
                daily_major_events = excluded.daily_major_events,
                sector_impact_map = excluded.sector_impact_map,
                linkage_logic_chain = excluded.linkage_logic_chain,
                source_news_ids = excluded.source_news_ids,
                updated_at = excluded.updated_at
        ''', (
            data.get('analysis_date'),
            data.get('daily_major_events'),
            data.get('sector_impact_map'),
            data.get('linkage_logic_chain'),
            data.get('source_news_ids'),
            now_cst(),
        ))

        conn.commit()
        conn.close()

        logger.info(f"新闻分析结果已保存: {data.get('analysis_date')}")
        return True

    except Exception as e:
        logger.error(f"保存新闻分析结果失败: {str(e)}")
        return False


def get_daily_news_ai_analysis_by_date(analysis_date: str, db_path: str = None) -> Optional[Dict]:
    """查询指定日期的新闻分析结果"""
    conn = get_db_connection(db_path)
    cursor = conn.cursor()

    try:
        cursor.execute(
            '''
            SELECT *
            FROM daily_news_ai_analysis
            WHERE analysis_date = ?
            LIMIT 1
            ''',
            (analysis_date,)
        )
        row = cursor.fetchone()
        conn.close()
        return dict(row) if row else None
    except:
        conn.close()
        return None


# ========== 标的管理操作 ==========

def get_tracked_symbols_local(db_path: str = None) -> List[Dict]:
    """查询本地 tracked_symbols 表中所有活跃标的"""
    try:
        conn = get_db_connection(db_path)
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM tracked_symbols WHERE is_active = 1 ORDER BY symbol_type, sort_order"
        )
        rows = cursor.fetchall()
        conn.close()
        result = []
        for row in rows:
            d = dict(row)
            # aliases 在数据库中存储为 JSON 字符串，读出后反序列化为列表；
            # 若解析失败则降级为逗号分隔方式兼容旧格式数据
            if isinstance(d.get("aliases"), str):
                try:
                    d["aliases"] = json.loads(d["aliases"])
                except (json.JSONDecodeError, ValueError):
                    d["aliases"] = [s.strip() for s in d["aliases"].split(",") if s.strip()]
            result.append(d)
        return result
    except Exception as e:
        logger.error("查询 tracked_symbols 失败: %s", e)
        return []


def upsert_tracked_symbol(data: Dict[str, Any], db_path: str = None) -> bool:
    """插入或更新一条 tracked_symbols 记录"""
    try:
        conn = get_db_connection(db_path)
        cursor = conn.cursor()
        aliases = data.get("aliases", [])
        # 写入前将列表序列化为 JSON 字符串，与 get_tracked_symbols_local 读取逻辑对称
        if isinstance(aliases, list):
            aliases = json.dumps(aliases, ensure_ascii=False)
        cursor.execute(
            """
            INSERT INTO tracked_symbols
                (symbol, yahoo_symbol, display_name, symbol_type, aliases, is_active, sort_order, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(symbol) DO UPDATE SET
                yahoo_symbol = excluded.yahoo_symbol,
                display_name = excluded.display_name,
                symbol_type  = excluded.symbol_type,
                aliases      = excluded.aliases,
                is_active    = excluded.is_active,
                sort_order   = excluded.sort_order,
                updated_at   = excluded.updated_at
            """,
            (
                data.get("symbol"),
                data.get("yahoo_symbol") or data.get("symbol"),
                data.get("display_name"),
                data.get("symbol_type", "stock"),
                aliases,
                1 if data.get("is_active", True) else 0,
                data.get("sort_order", 99),
                now_cst(),
                now_cst(),
            ),
        )
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        logger.error("写入 tracked_symbols 失败: %s", e)
        return False


def get_existing_hashes(date_from: str, date_to: str, db_path: str = None) -> set:
    """从本地 SQLite 查询指定时间范围内已存在的 news_hash 集合，用于本地环境 pipeline 入口预过滤。
    Args:
        date_from: 起始时间，格式 'YYYY-MM-DD HH:MM:SS'（北京时间，含）
        date_to:   结束时间，格式 'YYYY-MM-DD HH:MM:SS'（北京时间，不含）
    """
    try:
        conn = get_db_connection(db_path)
        cursor = conn.cursor()
        cursor.execute(
            "SELECT news_hash FROM news_raw_data WHERE pub_date >= ? AND pub_date < ?",
            (date_from, date_to),
        )
        hashes = {row["news_hash"] for row in cursor.fetchall()}
        conn.close()
        return hashes
    except Exception as exc:
        logger.warning("[预过滤] 查询本地 hash 失败，降级为不过滤: %s", exc)
        return set()


def delete_tracked_symbol(symbol: str, db_path: str = None) -> bool:
    """软删除标的（is_active=0）"""
    try:
        conn = get_db_connection(db_path)
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE tracked_symbols SET is_active = 0, updated_at = datetime('now') WHERE symbol = ?",
            (symbol,),
        )
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        logger.error("删除 tracked_symbols 失败: %s", e)
        return False
