"""
数据库工具模块 - 支持 SQLite 本地开发和 Cloudflare D1
"""
import os
import json
import hashlib
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
            data.get('type', 'market'),
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
    """按日期保存或更新复盘记录"""
    try:
        conn = get_db_connection(db_path)
        cursor = conn.cursor()

        cursor.execute('''
            INSERT INTO daily_review_archive
            (
                archive_date, review_status, reviewer_news_notes, market_sentiment,
                sector_rotation, asset_plan, trading_summary,
                reviewed_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(archive_date) DO UPDATE SET
                review_status = excluded.review_status,
                reviewer_news_notes = excluded.reviewer_news_notes,
                market_sentiment = excluded.market_sentiment,
                sector_rotation = excluded.sector_rotation,
                asset_plan = excluded.asset_plan,
                trading_summary = excluded.trading_summary,
                reviewed_at = excluded.reviewed_at,
                updated_at = excluded.updated_at
        ''', (
            data.get('archive_date'),
            data.get('review_status', 'draft'),
            data.get('reviewer_news_notes') or data.get('news_brief'),
            data.get('market_sentiment'),
            data.get('sector_rotation'),
            data.get('asset_plan'),
            data.get('trading_summary'),
            data.get('reviewed_at'),
            data.get('updated_at', now_cst()),
        ))

        conn.commit()
        conn.close()

        return True

    except Exception as e:
        logger.error(f"保存复盘记录失败: {str(e)}")
        return False


def initialize_archive_record(archive_date: str, db_path: str = None) -> bool:
    """初始化复盘记录。

    只保留日期和 initialized 状态；如果该日期已经 reviewed，则不覆盖。
    """
    try:
        conn = get_db_connection(db_path)
        cursor = conn.cursor()
        now = now_cst()

        cursor.execute(
            'SELECT review_status FROM daily_review_archive WHERE archive_date = ?',
            (archive_date,),
        )
        row = cursor.fetchone()
        existing_status = row['review_status'] if row else None
        # 已完成复盘的记录不允许被 initialized 状态覆盖，提前返回保护数据
        if existing_status == 'reviewed':
            conn.close()
            return True

        # SQL 层面再做一次 CASE 保护，防止并发写入时 Python 层检查失效
        cursor.execute('''
            INSERT INTO daily_review_archive
            (
                archive_date, review_status, reviewer_news_notes, market_sentiment,
                sector_rotation, asset_plan, trading_summary, reviewed_at, updated_at
            )
            VALUES (?, 'initialized', '', '', '', '', '', NULL, ?)
            ON CONFLICT(archive_date) DO UPDATE SET
                review_status = CASE
                    WHEN daily_review_archive.review_status = 'reviewed' THEN daily_review_archive.review_status
                    ELSE 'initialized'
                END,
                reviewer_news_notes = CASE
                    WHEN daily_review_archive.review_status = 'reviewed' THEN daily_review_archive.reviewer_news_notes
                    ELSE ''
                END,
                market_sentiment = CASE
                    WHEN daily_review_archive.review_status = 'reviewed' THEN daily_review_archive.market_sentiment
                    ELSE ''
                END,
                sector_rotation = CASE
                    WHEN daily_review_archive.review_status = 'reviewed' THEN daily_review_archive.sector_rotation
                    ELSE ''
                END,
                asset_plan = CASE
                    WHEN daily_review_archive.review_status = 'reviewed' THEN daily_review_archive.asset_plan
                    ELSE ''
                END,
                trading_summary = CASE
                    WHEN daily_review_archive.review_status = 'reviewed' THEN daily_review_archive.trading_summary
                    ELSE ''
                END,
                reviewed_at = CASE
                    WHEN daily_review_archive.review_status = 'reviewed' THEN daily_review_archive.reviewed_at
                    ELSE NULL
                END,
                updated_at = excluded.updated_at
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
