"""
标的注册中心 - 从 D1 或本地 SQLite 动态读取 tracked_symbols
替代 config.py 中的硬编码 STOCK_SYMBOLS / INDEX_SYMBOLS / ALL_SYMBOLS
"""
import json
import sqlite3
from typing import Any

from config import (
    DB_PATH,
    ENABLE_REMOTE_WRITE,
    INGEST_API_BASE_URL,
    INGEST_API_TOKEN,
)

# 本地 fallback：当数据库还没有 tracked_symbols 表时使用
_FALLBACK_SYMBOLS = [
    # 大盘
    {"symbol": "GSPC",  "yahoo_symbol": "^GSPC",     "display_name": "标普500",    "symbol_type": "index",
     "aliases": ["^GSPC", "S&P 500", "SP500", "标普500", "标普", "SPX"]},
    {"symbol": "NDX",   "yahoo_symbol": "^NDX",      "display_name": "纳斯达克100", "symbol_type": "index",
     "aliases": ["^NDX", "Nasdaq 100", "纳指", "纳斯达克100", "纳斯达克"]},
    {"symbol": "DJI",   "yahoo_symbol": "^DJI",      "display_name": "道琼斯",     "symbol_type": "index",
     "aliases": ["^DJI", "Dow Jones", "DJIA", "道指", "道琼斯"]},
    {"symbol": "STOXX50E","yahoo_symbol": "^STOXX50E","display_name": "欧洲斯托克50", "symbol_type": "index",
     "aliases": ["^STOXX50E", "STOXX50E", "Euro Stoxx 50", "欧洲斯托克50", "欧股50"]},
    {"symbol": "VIX",   "yahoo_symbol": "^VIX",      "display_name": "恐慌指数",   "symbol_type": "index",
     "aliases": ["^VIX", "VIX", "Volatility Index", "恐慌指数", "波动率指数"]},
    {"symbol": "HSI",   "yahoo_symbol": "^HSI",      "display_name": "恒生指数",   "symbol_type": "index",
     "aliases": ["^HSI", "HSI", "Hang Seng", "恒指", "恒生指数"]},
    {"symbol": "SSE",   "yahoo_symbol": "000001.SS", "display_name": "上证指数",   "symbol_type": "index",
     "aliases": ["000001.SS", "SSE Composite", "上证指数", "沪指", "上证"]},
    {"symbol": "DXY",   "yahoo_symbol": "DX-Y.NYB",  "display_name": "美元指数",   "symbol_type": "index",
     "aliases": ["DX-Y.NYB", "DXY", "Dollar Index", "美元指数", "美元"]},
    {"symbol": "GOLD",  "yahoo_symbol": "GC=F",      "display_name": "黄金",       "symbol_type": "index",
     "aliases": ["GC=F", "Gold", "黄金", "金价", "COMEX黄金", "黄金现货/美元", "现货黄金"]},
    {"symbol": "CL",    "yahoo_symbol": "CL=F",      "display_name": "原油",       "symbol_type": "index",
     "aliases": ["CL=F", "Crude Oil", "WTI", "原油", "油价"]},
    {"symbol": "USDJPY","yahoo_symbol": "JPY=X",     "display_name": "美元/日元",  "symbol_type": "index",
     "aliases": ["JPY=X", "USDJPY", "USD/JPY", "美元/日元", "美元兑日元"]},
    {"symbol": "USDCNY","yahoo_symbol": "CNY=X",     "display_name": "美元/人民币","symbol_type": "index",
     "aliases": ["CNY=X", "USDCNY", "USD/CNY", "美元/人民币", "美元兑人民币", "离岸人民币"]},
    {"symbol": "SILVER","yahoo_symbol": "SI=F",      "display_name": "白银",       "symbol_type": "index",
     "aliases": ["SI=F", "Silver", "白银", "银价", "COMEX白银", "白银/美元", "现货白银"]},
    {"symbol": "COPPER","yahoo_symbol": "HG=F",      "display_name": "铜期货",     "symbol_type": "index",
     "aliases": ["HG=F", "COPPER", "Copper", "铜", "铜期货", "COMEX铜"]},
    {"symbol": "SOYBEAN","yahoo_symbol": "ZS=F",     "display_name": "大豆期货",   "symbol_type": "index",
     "aliases": ["ZS=F", "SOYBEAN", "Soybean", "大豆期货", "大豆"]},
    {"symbol": "BRENT", "yahoo_symbol": "BZ=F",      "display_name": "Brent原油",  "symbol_type": "index",
     "aliases": ["BZ=F", "BRENT", "Brent", "布伦特原油", "Brent原油"]},
    {"symbol": "BTCUSD","yahoo_symbol": "BTC-USD",   "display_name": "比特币/美元","symbol_type": "index",
     "aliases": ["BTC-USD", "BTCUSD", "比特币/美元", "比特币", "BTC"]},
    {"symbol": "KOSPI","yahoo_symbol": "^KS11",      "display_name": "韩国综合股价指数","symbol_type": "index",
     "aliases": ["^KS11", "KOSPI", "韩国综合股价指数", "韩国综合指数", "韩综指"]},
    {"symbol": "HSTECH","yahoo_symbol": "3067.HK",   "display_name": "恒生科技ETF","symbol_type": "index",
     "aliases": ["3067.HK", "iShares Hang Seng TECH ETF", "Hang Seng TECH", "恒生科技指数", "恒科指", "恒生科技ETF"]},
    {"symbol": "QQQ",   "yahoo_symbol": "QQQ",       "display_name": "纳指100ETF", "symbol_type": "index",
     "aliases": ["QQQ", "Invesco QQQ", "纳指ETF", "纳斯达克100ETF"]},
    {"symbol": "SPY",   "yahoo_symbol": "SPY",       "display_name": "标普500ETF", "symbol_type": "index",
     "aliases": ["SPY", "SPDR S&P 500 ETF", "标普500ETF"]},
    # 板块
    {"symbol": "XLK",  "yahoo_symbol": "XLK",  "display_name": "科技板块",   "symbol_type": "sector",
     "aliases": ["XLK", "Technology Select Sector", "科技板块", "科技ETF"]},
    {"symbol": "SOXX", "yahoo_symbol": "SOXX", "display_name": "半导体板块", "symbol_type": "sector",
     "aliases": ["SOXX", "iShares Semiconductor", "半导体", "芯片板块"]},
    {"symbol": "EWY",  "yahoo_symbol": "EWY",  "display_name": "韩国ETF",    "symbol_type": "sector",
     "aliases": ["EWY", "iShares MSCI South Korea ETF", "韩国ETF", "韩国市场ETF"]},
    {"symbol": "XLE",  "yahoo_symbol": "XLE",  "display_name": "能源板块",   "symbol_type": "sector",
     "aliases": ["XLE", "Energy Select Sector", "能源板块", "能源ETF"]},
    {"symbol": "XLF",  "yahoo_symbol": "XLF",  "display_name": "金融板块",   "symbol_type": "sector",
     "aliases": ["XLF", "Financial Select Sector", "金融板块", "金融ETF"]},
    {"symbol": "XLY",  "yahoo_symbol": "XLY",  "display_name": "可选消费",   "symbol_type": "sector",
     "aliases": ["XLY", "Consumer Discretionary", "可选消费", "消费板块"]},
    {"symbol": "XLC",  "yahoo_symbol": "XLC",  "display_name": "通信服务板块", "symbol_type": "sector",
     "aliases": ["XLC", "Communication Services Select Sector SPDR ETF", "通信服务板块", "通信服务ETF"]},
    {"symbol": "XLI",  "yahoo_symbol": "XLI",  "display_name": "工业板块",   "symbol_type": "sector",
     "aliases": ["XLI", "Industrial Select Sector SPDR ETF", "工业板块", "工业ETF"]},
    {"symbol": "XLP",  "yahoo_symbol": "XLP",  "display_name": "必需消费板块", "symbol_type": "sector",
     "aliases": ["XLP", "Consumer Staples Select Sector SPDR ETF", "必需消费", "消费必需品ETF"]},
    {"symbol": "XLB",  "yahoo_symbol": "XLB",  "display_name": "材料板块",   "symbol_type": "sector",
     "aliases": ["XLB", "Materials Select Sector SPDR ETF", "材料板块", "材料ETF"]},
    {"symbol": "XLU",  "yahoo_symbol": "XLU",  "display_name": "公用事业板块", "symbol_type": "sector",
     "aliases": ["XLU", "Utilities Select Sector SPDR ETF", "公用事业", "公用事业ETF"]},
    {"symbol": "XLV",  "yahoo_symbol": "XLV",  "display_name": "医疗保健板块", "symbol_type": "sector",
     "aliases": ["XLV", "Health Care Select Sector SPDR ETF", "医疗保健", "医疗ETF"]},
    {"symbol": "IYR",  "yahoo_symbol": "IYR",  "display_name": "美国REIT板块", "symbol_type": "sector",
     "aliases": ["IYR", "iShares U.S. Real Estate ETF", "美国REIT", "REIT ETF"]},
    {"symbol": "VIG",  "yahoo_symbol": "VIG",  "display_name": "股息成长板块", "symbol_type": "sector",
     "aliases": ["VIG", "Vanguard Dividend Appreciation ETF", "股息成长", "红利成长ETF"]},
    {"symbol": "AGG",  "yahoo_symbol": "AGG",  "display_name": "美国综合债ETF", "symbol_type": "sector",
     "aliases": ["AGG", "iShares Core U.S. Aggregate Bond ETF", "美国综合债", "综合债ETF"]},
    # 个股
    {"symbol": "MU",    "yahoo_symbol": "MU",    "display_name": "美光科技", "symbol_type": "stock",
     "aliases": ["MU", "Micron", "Micron Technology", "美光", "美光科技"]},
    {"symbol": "LITE",  "yahoo_symbol": "LITE",  "display_name": "Lumentum", "symbol_type": "stock",
     "aliases": ["LITE", "Lumentum", "Lumentum Holdings"]},
    {"symbol": "MSFT",  "yahoo_symbol": "MSFT",  "display_name": "微软",     "symbol_type": "stock",
     "aliases": ["MSFT", "Microsoft", "微软", "Microsoft Corporation"]},
    {"symbol": "GOOGL", "yahoo_symbol": "GOOGL", "display_name": "谷歌",     "symbol_type": "stock",
     "aliases": ["GOOGL", "Google", "Alphabet", "谷歌", "Alphabet Inc"]},
]

_cache: list[dict] | None = None


def _parse_aliases(raw: Any) -> list[str]:
    if isinstance(raw, list):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, list) else []
        except (json.JSONDecodeError, ValueError):
            return [s.strip() for s in raw.split(",") if s.strip()]
    return []


def _load_from_local_db() -> list[dict] | None:
    """从本地 SQLite 读取 tracked_symbols，返回 None 表示表不存在"""
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cur = conn.execute(
            "SELECT symbol, yahoo_symbol, display_name, symbol_type, aliases, sort_order "
            "FROM tracked_symbols WHERE is_active = 1 ORDER BY symbol_type, sort_order"
        )
        rows = cur.fetchall()
        conn.close()
        result = []
        for row in rows:
            d = dict(row)
            d["aliases"] = _parse_aliases(d.get("aliases", "[]"))
            result.append(d)
        return result
    except sqlite3.OperationalError:
        # 表还不存在
        return None
    except Exception:
        return None


def _load_from_remote() -> list[dict] | None:
    """从 Worker API 读取 tracked_symbols"""
    if not INGEST_API_BASE_URL:
        return None
    try:
        import requests
        resp = requests.get(
            f"{INGEST_API_BASE_URL}/api/symbols",
            headers={"Authorization": f"Bearer {INGEST_API_TOKEN}"},
            timeout=10,
        )
        resp.raise_for_status()
        items = resp.json().get("items", [])
        for item in items:
            item["aliases"] = _parse_aliases(item.get("aliases", []))
        return items
    except Exception:
        return None


def get_tracked_symbols(force_refresh: bool = False) -> list[dict]:
    """返回所有活跃标的列表。优先 D1，fallback 本地 SQLite，再 fallback 内置列表。"""
    global _cache
    if _cache is not None and not force_refresh:
        return _cache

    symbols = None
    if ENABLE_REMOTE_WRITE:
        symbols = _load_from_remote()
    if symbols is None:
        symbols = _load_from_local_db()
    if symbols is None:
        symbols = _FALLBACK_SYMBOLS

    _cache = symbols
    return symbols


def invalidate_cache() -> None:
    global _cache
    _cache = None


def get_symbols_by_type(symbol_type: str) -> list[dict]:
    return [s for s in get_tracked_symbols() if s["symbol_type"] == symbol_type]


def get_yahoo_symbol(record: dict) -> str:
    """返回 Yahoo Finance 采集代码；为空则 fallback 到 symbol。"""
    return (record.get("yahoo_symbol") or record["symbol"]).strip()


def build_aliases_lookup() -> dict[str, list[dict]]:
    """构建 alias.lower() → [标的记录, ...] 的反向索引，供新闻匹配使用。"""
    lookup: dict[str, list[dict]] = {}
    for record in get_tracked_symbols():
        for alias in record.get("aliases", []):
            key = alias.lower()
            lookup.setdefault(key, []).append(record)
    return lookup


def get_symbol_type_map() -> dict[str, str]:
    """返回 symbol → symbol_type 的映射。"""
    return {s["symbol"]: s["symbol_type"] for s in get_tracked_symbols()}


def get_stock_symbols() -> list[str]:
    """仅返回个股 yahoo_symbol 列表（供价格采集使用）。"""
    return [get_yahoo_symbol(s) for s in get_symbols_by_type("stock")]


def get_index_symbols() -> list[str]:
    """返回大盘/板块所有 yahoo_symbol 列表（供价格采集使用）。"""
    return [get_yahoo_symbol(s) for s in get_tracked_symbols() if s["symbol_type"] in ("index", "sector")]


def get_all_yahoo_symbols() -> list[str]:
    """返回全部活跃标的的 yahoo_symbol 列表。"""
    return [get_yahoo_symbol(s) for s in get_tracked_symbols()]


def symbol_to_system_code(yahoo_symbol: str) -> str:
    """Yahoo 代码 → 系统 symbol（写 stock_raw 时使用）。"""
    for s in get_tracked_symbols():
        if get_yahoo_symbol(s) == yahoo_symbol:
            return s["symbol"]
    return yahoo_symbol
