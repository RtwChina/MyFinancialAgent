"""
数据库工具模块 - 支持 SQLite 本地开发和 Cloudflare D1
"""
import os
import hashlib
import sqlite3
from datetime import datetime
from typing import Optional, List, Dict, Any

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
    conn.row_factory = sqlite3.Row
    return conn


def init_database(db_path: str = None):
    """初始化数据库表结构"""
    conn = get_db_connection(db_path)
    cursor = conn.cursor()

    # 读取 schema.sql
    schema_path = os.path.join(os.path.dirname(__file__), 'schema.sql')
    with open(schema_path, 'r', encoding='utf-8') as f:
        schema_sql = f.read()

    # 执行建表语句
    cursor.executescript(schema_sql)
    conn.commit()
    conn.close()

    logger.info(f"数据库初始化完成: {db_path or LOCAL_DB_PATH}")


def generate_news_hash(title: str, content: str, pub_date: str = None) -> str:
    """生成新闻唯一标识hash"""
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
            (k_date, stock_code, stock_name, symbol, current_price, change_percent, volume, captured_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            data.get('k_date'),
            data.get('stock_code'),
            data.get('stock_name'),
            data.get('symbol'),
            data.get('current_price'),
            data.get('change_percent'),
            data.get('volume'),
            data.get('captured_at'),
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

def insert_news_data(data: Dict[str, Any], db_path: str = None) -> bool:
    """
    插入新闻数据，使用 news_hash 去重

    Args:
        data: 新闻数据字典
        db_path: 数据库路径

    Returns:
        bool: 是否成功插入（True=新数据，False=重复数据或无效数据）
    """
    try:
        # 过滤无效数据：没有 pub_date 的新闻不插入
        pub_date = data.get('time') or data.get('pub_date')
        if not pub_date:
            logger.debug(f"跳过无发布时间的新闻: {data.get('title', '')[:50] or data.get('content', '')[:50]}")
            return False

        conn = get_db_connection(db_path)
        cursor = conn.cursor()

        # 生成 hash
        news_hash = generate_news_hash(
            data.get('title'),
            data.get('content'),
            pub_date
        )

        cursor.execute('''
            INSERT OR IGNORE INTO stock_news_raw
            (pub_date, title, summary, content, url, source, type, ai_summary, news_hash, captured_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            pub_date,
            data.get('title'),
            data.get('summary'),
            data.get('content'),
            data.get('url'),
            data.get('source'),
            data.get('type', '0'),  # 默认重大新闻
            data.get('ai_summary'),
            news_hash,
            datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        ))

        inserted = cursor.rowcount > 0
        conn.commit()
        conn.close()

        return inserted

    except Exception as e:
        logger.error(f"插入新闻数据失败: {str(e)}")
        return False


def batch_insert_news(news_list: List[Dict[str, Any]], db_path: str = None) -> int:
    """批量插入新闻数据，返回成功插入的数量"""
    inserted_count = 0
    for news in news_list:
        if insert_news_data(news, db_path):
            inserted_count += 1
    return inserted_count


def get_news_by_date_range(start_time: datetime, end_time: datetime, db_path: str = None) -> List[Dict]:
    """查询指定时间范围内的新闻"""
    conn = get_db_connection(db_path)
    cursor = conn.cursor()

    cursor.execute('''
        SELECT * FROM stock_news_raw
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
    """保存复盘记录"""
    try:
        conn = get_db_connection(db_path)
        cursor = conn.cursor()

        cursor.execute('''
            INSERT INTO stock_archive
            (archive_date, hist_price_level, news_summary, market_sentiment, sector_rotation, asset_plan, trading_summary)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (
            data.get('archive_date'),
            data.get('hist_price_level'),
            data.get('news_summary'),
            data.get('market_sentiment'),
            data.get('sector_rotation'),
            data.get('asset_plan'),
            data.get('trading_summary'),
        ))

        conn.commit()
        conn.close()

        return True

    except Exception as e:
        logger.error(f"保存复盘记录失败: {str(e)}")
        return False


def get_archive_by_date(archive_date: str, db_path: str = None) -> Optional[Dict]:
    """查询指定日期的复盘记录"""
    conn = get_db_connection(db_path)
    cursor = conn.cursor()

    cursor.execute(
        'SELECT * FROM stock_archive WHERE archive_date = ?',
        (archive_date,)
    )

    row = cursor.fetchone()
    conn.close()

    return dict(row) if row else None


# ========== 新闻分析结果操作 ==========

def save_news_analysis(data: Dict[str, Any], db_path: str = None) -> bool:
    """保存新闻分析结果（LLM 筛选的重大新闻）"""
    try:
        conn = get_db_connection(db_path)
        cursor = conn.cursor()

        # 确保表存在
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS news_analysis (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                analysis_date TEXT NOT NULL,
                global_news TEXT,
                market_news TEXT,
                market_analysis TEXT,
                raw_summary TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        cursor.execute('''
            INSERT INTO news_analysis
            (analysis_date, global_news, market_news, market_analysis, raw_summary)
            VALUES (?, ?, ?, ?, ?)
        ''', (
            data.get('analysis_date'),
            data.get('global_news'),
            data.get('market_news'),
            data.get('market_analysis'),
            data.get('raw_summary'),
        ))

        conn.commit()
        conn.close()

        logger.info(f"新闻分析结果已保存: {data.get('analysis_date')}")
        return True

    except Exception as e:
        logger.error(f"保存新闻分析结果失败: {str(e)}")
        return False


def get_news_analysis_by_date(analysis_date: str, db_path: str = None) -> Optional[Dict]:
    """查询指定日期的新闻分析结果"""
    conn = get_db_connection(db_path)
    cursor = conn.cursor()

    try:
        cursor.execute(
            'SELECT * FROM news_analysis WHERE analysis_date = ? ORDER BY id DESC LIMIT 1',
            (analysis_date,)
        )
        row = cursor.fetchone()
        conn.close()
        return dict(row) if row else None
    except:
        conn.close()
        return None