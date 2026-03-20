"""Live news-source implementation backed by real third-party interfaces.

This module owns only raw input collection. It does not perform rule
screening, LLM enhancement, or persistence.

数据源：
- AkShare: 财联社(cls) / 同花顺(10jqka) / 新浪(sina) / 富途(futu) — 中文财经快讯
- Finnhub: general_news + company_news — 英文全球财经新闻
"""

from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import akshare as ak
import finnhub

from config import FINNHUB_API_KEY
from logger_utils import get_logger
from runtime.context import ExecutionContext
from symbol_registry import get_tracked_symbols


logger = get_logger("news_live")
BEIJING_TZ = ZoneInfo("Asia/Shanghai")
UTC_TZ = ZoneInfo("UTC")


def _fmt_beijing(dt: datetime | None) -> str:
    """将带时区的 datetime 转为北京时间字符串 YYYY-MM-DD HH:MM:SS。"""
    if dt is None:
        return ""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=BEIJING_TZ)
    return dt.astimezone(BEIJING_TZ).strftime("%Y-%m-%d %H:%M:%S")


def _unix_to_beijing(ts: int | float) -> str:
    """UTC Unix 时间戳转北京时间字符串。"""
    return _fmt_beijing(datetime.fromtimestamp(ts, tz=UTC_TZ))


# ─── AkShare 源 ────────────────────────────────────────────────────────────────

def fetch_akshare_cls() -> list[dict]:
    """财联社全球快讯 — stock_info_global_cls()"""
    try:
        logger.info("[AkShare] 正在抓取财联社...")
        df = ak.stock_info_global_cls()
        news_list = []
        for _, row in df.iterrows():
            # CLS 时间字段：发布日期(date) + 发布时间(time) 分开存，需拼接
            date_str = str(row.get("发布日期", "")).strip()
            time_str = str(row.get("发布时间", "")).strip()
            if date_str and time_str:
                pub_time_str = f"{date_str} {time_str}"
            elif date_str:
                pub_time_str = date_str
            else:
                pub_time_str = ""
            # 规范化为 YYYY-MM-DD HH:MM:SS（已是北京时间）
            try:
                dt = datetime.strptime(pub_time_str, "%Y-%m-%d %H:%M:%S")
                pub_time_str = dt.strftime("%Y-%m-%d %H:%M:%S")
            except Exception:
                pass

            news_list.append({
                "time": pub_time_str,
                "title": str(row.get("标题", "") or "").strip(),
                "content": str(row.get("内容", "") or row.get("标题", "") or "").strip(),
                "url": str(row.get("链接", "") or "").strip(),
                "source": "akshare",
                "sub_source": "cls",
                "language": "zh",
            })
        logger.info("[AkShare] 财联社: %s 条", len(news_list))
        return news_list
    except Exception as exc:
        logger.error("[AkShare] 财联社失败: %s", exc)
        return []


def fetch_akshare_ths() -> list[dict]:
    """同花顺全球快讯 — stock_info_global_ths()"""
    try:
        logger.info("[AkShare] 正在抓取同花顺...")
        df = ak.stock_info_global_ths()
        news_list = []
        for _, row in df.iterrows():
            pub_time_str = str(row.get("发布时间", "") or "").strip()
            news_list.append({
                "time": pub_time_str,
                "title": str(row.get("标题", "") or "").strip(),
                "content": str(row.get("内容", "") or row.get("标题", "") or "").strip(),
                "url": str(row.get("链接", "") or "").strip(),
                "source": "akshare",
                "sub_source": "10jqka",
                "language": "zh",
            })
        logger.info("[AkShare] 同花顺: %s 条", len(news_list))
        return news_list
    except Exception as exc:
        logger.error("[AkShare] 同花顺失败: %s", exc)
        return []


def fetch_akshare_sina() -> list[dict]:
    """新浪全球快讯 — stock_info_global_sina()"""
    try:
        logger.info("[AkShare] 正在抓取新浪...")
        df = ak.stock_info_global_sina()
        news_list = []
        for _, row in df.iterrows():
            pub_time_str = str(row.get("时间", "") or "").strip()
            news_list.append({
                "time": pub_time_str,
                "title": str(row.get("标题", "") or "").strip(),
                "content": str(row.get("内容", "") or row.get("标题", "") or "").strip(),
                "url": str(row.get("链接", "") or "").strip(),
                "source": "akshare",
                "sub_source": "sina",
                "language": "zh",
            })
        logger.info("[AkShare] 新浪: %s 条", len(news_list))
        return news_list
    except Exception as exc:
        logger.error("[AkShare] 新浪失败: %s", exc)
        return []


def fetch_akshare_futu() -> list[dict]:
    """富途全球快讯 — stock_info_global_futu()"""
    try:
        logger.info("[AkShare] 正在抓取富途...")
        df = ak.stock_info_global_futu()
        news_list = []
        for _, row in df.iterrows():
            pub_time_str = str(row.get("发布时间", "") or "").strip()
            news_list.append({
                "time": pub_time_str,
                "title": str(row.get("标题", "") or "").strip(),
                "content": str(row.get("内容", "") or row.get("标题", "") or "").strip(),
                "url": str(row.get("链接", "") or "").strip(),
                "source": "akshare",
                "sub_source": "futu",
                "language": "zh",
            })
        logger.info("[AkShare] 富途: %s 条", len(news_list))
        return news_list
    except Exception as exc:
        logger.error("[AkShare] 富途失败: %s", exc)
        return []


# ─── Finnhub 源 ────────────────────────────────────────────────────────────────

def _get_finnhub_client() -> finnhub.Client | None:
    """创建 Finnhub Client，API Key 为空时返回 None 并记录警告。"""
    if not FINNHUB_API_KEY:
        logger.warning("[Finnhub] FINNHUB_API_KEY 未配置，跳过 Finnhub 采集")
        return None
    return finnhub.Client(api_key=FINNHUB_API_KEY)


def fetch_finnhub_general() -> list[dict]:
    """Finnhub 大盘新闻 — general_news('general')，约 100 条最近 24 小时。"""
    client = _get_finnhub_client()
    if client is None:
        return []
    try:
        logger.info("[Finnhub] 正在抓取大盘新闻...")
        items = client.general_news("general")
        news_list = []
        for item in items:
            ts = item.get("datetime", 0)
            news_list.append({
                "time": _unix_to_beijing(ts) if ts else "",
                "title": str(item.get("headline", "") or "").strip(),
                "content": str(item.get("summary", "") or item.get("headline", "") or "").strip(),
                "url": str(item.get("url", "") or "").strip(),
                "source": "finnhub",
                "sub_source": "general",
                "language": "en",
            })
        logger.info("[Finnhub] 大盘新闻: %s 条", len(news_list))
        return news_list
    except Exception as exc:
        logger.error("[Finnhub] 大盘新闻失败: %s", exc)
        return []


def _get_finnhub_symbols() -> list[str]:
    """从 tracked_symbols 获取美股 stock + sector 标的，过滤 A 股/港股。"""
    all_symbols = get_tracked_symbols()
    result = []
    for s in all_symbols:
        if s.get("symbol_type") not in ("stock", "sector"):
            continue
        yahoo = s.get("yahoo_symbol", "")
        if yahoo.endswith(".SS") or yahoo.endswith(".SZ") or yahoo.endswith(".HK"):
            continue
        result.append(yahoo)
    return result


def fetch_finnhub_company(context: ExecutionContext) -> list[dict]:
    """Finnhub 个股/ETF 公司新闻 — 逐个 symbol 串行查询，限频 0.5s 间隔。"""
    client = _get_finnhub_client()
    if client is None:
        return []

    symbols = _get_finnhub_symbols()
    if not symbols:
        logger.warning("[Finnhub] 无可用的美股标的，跳过 company_news")
        return []

    now = context.clock.now_in_tz("Asia/Shanghai")
    date_to = now.strftime("%Y-%m-%d")
    date_from = (now - timedelta(days=3)).strftime("%Y-%m-%d")

    logger.info("[Finnhub] 开始查询 %s 个标的的公司新闻 (%s ~ %s)", len(symbols), date_from, date_to)
    all_news: list[dict] = []

    for symbol in symbols:
        try:
            items = client.company_news(symbol, _from=date_from, to=date_to)
            count = 0
            for item in items[:10]:
                ts = item.get("datetime", 0)
                all_news.append({
                    "time": _unix_to_beijing(ts) if ts else "",
                    "title": str(item.get("headline", "") or "").strip(),
                    "content": str(item.get("summary", "") or item.get("headline", "") or "").strip(),
                    "url": str(item.get("url", "") or "").strip(),
                    "source": "finnhub",
                    "sub_source": "company",
                    "language": "en",
                })
                count += 1
            logger.debug("[Finnhub] %s: %s 条", symbol, count)
        except Exception as exc:
            logger.error("[Finnhub] %s 查询失败: %s", symbol, exc)
        time.sleep(0.5)

    logger.info("[Finnhub] 公司新闻合计: %s 条", len(all_news))
    return all_news


# ─── 编排 ──────────────────────────────────────────────────────────────────────

def fetch_all_news_live(context: ExecutionContext) -> list[dict]:
    """AkShare 4 源 + Finnhub general 并发，Finnhub company 串行（限频）。"""
    all_news: list[dict] = []

    # 并发：AkShare 4 源 + Finnhub general
    concurrent_tasks = {
        "akshare_cls": fetch_akshare_cls,
        "akshare_ths": fetch_akshare_ths,
        "akshare_sina": fetch_akshare_sina,
        "akshare_futu": fetch_akshare_futu,
        "finnhub_general": fetch_finnhub_general,
    }
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = {executor.submit(fn): name for name, fn in concurrent_tasks.items()}
        for future in as_completed(futures):
            name = futures[future]
            try:
                all_news.extend(future.result())
            except Exception as exc:
                logger.error("%s 采集失败: %s", name, exc)

    # 串行：Finnhub company（限频，每次 0.5s 间隔）
    try:
        all_news.extend(fetch_finnhub_company(context))
    except Exception as exc:
        logger.error("finnhub_company 采集失败: %s", exc)

    return all_news
