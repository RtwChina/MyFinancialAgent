"""
新闻采集脚本 v3.0
整合: 新浪财经、财联社、金十数据、Yahoo财经美股首页
优化: LLM超时处理、重试机制、降级策略、数据库存储
注意: 新闻数据持续积累不做删除，复盘时根据时间范围查询
"""
import json
import re
import os
import time
from datetime import datetime
from zoneinfo import ZoneInfo
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Dict, List, Tuple
import pandas as pd
import pandas_market_calendars as mcal
import pytz
import requests

from config import (
    LLM_API_KEY, LLM_BASE_URL, LLM_BATCH_MODEL_ID, LLM_MODEL_ID, LLM_RULES_MODEL_ID, LLM_SUMMARY_MODEL_ID,
    ENABLE_REMOTE_WRITE, INGEST_API_BASE_URL,
)
from symbol_registry import build_aliases_lookup, get_symbol_type_map, get_tracked_symbols
from cloudflare_ingest import (
    CloudflareIngestError,
    fetch_news as fetch_remote_news,
    initialize_review as initialize_remote_review,
    is_remote_write_configured,
    send_news,
    send_daily_news_ai_analysis,
    send_pipeline_trace,
    send_filter_logs,
)
from data_sources.news_router import fetch_all_news as fetch_source_news
from logger_utils import get_logger
from db_utils import (
    generate_news_hash,
    get_daily_news_ai_analysis_by_date,
    get_news_by_date_range,
    initialize_archive_record,
    init_database,
    LOCAL_DB_PATH,
    save_daily_news_ai_analysis,
    upsert_news_batch,
)
from llm_client import LLMClient
from runtime.context import ExecutionContext, build_execution_context

logger = get_logger("collect_news_v3")

# ========== 可配置参数 ==========
LLM_TIMEOUT = int(os.getenv("LLM_TIMEOUT", "300"))  # LLM 超时时间(秒)
LLM_RULES_TIMEOUT = int(os.getenv("LLM_RULES_TIMEOUT", str(LLM_TIMEOUT)))
LLM_BATCH_TIMEOUT = int(os.getenv("LLM_BATCH_TIMEOUT", str(LLM_TIMEOUT)))
LLM_SUMMARY_TIMEOUT = int(os.getenv("LLM_SUMMARY_TIMEOUT", str(LLM_TIMEOUT)))
LLM_MAX_WORKERS = int(os.getenv("LLM_MAX_WORKERS", "5"))  # 并发数（Session 连接池复用，支持高并发）
LLM_BATCH_SIZE = max(1, int(os.getenv("LLM_BATCH_SIZE", "8")))
LLM_RULES_SAMPLE_SIZE = max(8, int(os.getenv("LLM_RULES_SAMPLE_SIZE", "12")))
RULE_ACTIVE_STRATEGY = os.getenv("RULE_ACTIVE_STRATEGY", "A").upper()  # A/B/C 评分策略
SKIP_LLM = os.getenv("SKIP_LLM", "false").lower() == "true"  # 跳过 LLM 分析开关
# 运行时实际生效的跳过标志（预留给测试或降级逻辑修改）
EFFECTIVE_SKIP_LLM = SKIP_LLM

llm_client = LLMClient(
    api_key=LLM_API_KEY,
    base_url=LLM_BASE_URL,
    default_model=LLM_MODEL_ID,
    timeout=LLM_TIMEOUT,
    max_retries=0,
    logger=logger,
)


# 标的信息从 symbol_registry 动态加载（消除硬编码）
# 在模块级别缓存，避免每次新闻处理都重复查询数据库
def _load_symbol_sets():
    tracked = get_tracked_symbols()
    stock_set = {s["symbol"] for s in tracked if s["symbol_type"] == "stock"}
    index_set = {s["symbol"] for s in tracked if s["symbol_type"] == "index"}
    sector_set = {s["symbol"] for s in tracked if s["symbol_type"] == "sector"}
    return stock_set, index_set, sector_set

STOCK_TRACKED_SYMBOLS, INDEX_TRACKED_SYMBOLS, SECTOR_TRACKED_SYMBOLS = _load_symbol_sets()
# 向后兼容别名（仅供本模块内部过渡使用）
EQUITY_TRACKED_SYMBOLS = STOCK_TRACKED_SYMBOLS
MARKET_REFERENCE_SYMBOLS = INDEX_TRACKED_SYMBOLS | SECTOR_TRACKED_SYMBOLS

# 降级词表：当 API 不可达时使用，内容与 migration 011 seed 数据一致
FALLBACK_KEYWORDS: Dict[str, List[str]] = {
    "macro": [
        # 中文
        "美联储", "利率", "降息", "加息", "通胀", "非农", "就业",
        "关税", "制裁", "贸易", "财政刺激", "流动性", "衰退", "债务上限",
        "战争", "冲突", "霍尔木兹", "中东", "俄乌", "伊朗", "以色列", "原油", "油价",
        "地缘", "地缘政治", "央行", "货币政策", "国债", "美债", "收益率",
        # 英文
        "fed", "federal reserve", "interest rate", "rate cut", "rate hike",
        "inflation", "cpi", "ppi", "nonfarm", "employment", "unemployment",
        "tariff", "sanctions", "trade war", "fiscal", "liquidity", "recession", "debt ceiling",
        "war", "conflict", "middle east", "iran", "israel", "crude oil", "oil price",
        "geopolitical", "treasury", "yield", "monetary policy", "central bank",
    ],
    "market": [
        # 中文
        "标普", "纳指", "道指", "财报", "盈利", "业绩", "回购", "分红",
        "并购", "收购", "监管", "芯片", "半导体", "人工智能", "英伟达", "微软", "谷歌",
        "数据中心", "云计算", "光模块", "算力", "存储", "HBM",
        # 英文
        "s&p", "nasdaq", "dow", "earnings", "revenue", "buyback", "dividend",
        "ipo", "merger", "acquisition", "regulation", "chip", "semiconductor",
        "ai", "artificial intelligence", "nvidia", "microsoft", "google", "apple",
        "data center", "cloud", "hbm", "memory", "optical", "capex",
    ],
    "noise": [
        # 中文
        "分析师", "评级", "目标价", "看涨", "看跌", "买入评级", "卖出评级",
        "技术面", "盘前异动", "盘后异动", "短线", "传闻",
        # 英文
        "analyst", "rating", "price target", "bullish", "bearish",
        "buy rating", "sell rating", "technical analysis", "premarket", "afterhours", "rumor",
    ],
    "symbol_context": [
        # 中文
        "财报", "指引", "监管", "诉讼", "产品", "合作", "订单", "收购", "回购", "盈利",
        # 英文
        "earnings", "guidance", "regulation", "lawsuit", "product", "partnership",
        "order", "acquisition", "buyback", "revenue",
    ],
}


def _fetch_keywords_from_api() -> Dict[str, List[str]] | None:
    """从 Workers API 拉取激活状态的关键词，按 keyword_type 分组。

    超时 5 秒；失败返回 None（调用方降级到 FALLBACK_KEYWORDS）。
    """
    if not INGEST_API_BASE_URL:
        return None
    try:
        resp = requests.get(
            f"{INGEST_API_BASE_URL}/api/screening-keywords",
            params={"active": "1"},
            timeout=5,
        )
        resp.raise_for_status()
        records = resp.json()
        if not isinstance(records, list):
            return None
        grouped: Dict[str, List[str]] = {}
        for rec in records:
            kw_type = rec.get("keyword_type")
            keyword = rec.get("keyword")
            if kw_type and keyword:
                grouped.setdefault(kw_type, []).append(keyword)
        return grouped if grouped else None
    except Exception as exc:
        logger.debug("[初筛] 关键词 API 拉取失败: %s，将降级到 FALLBACK_KEYWORDS", exc)
        return None


def merge_and_deduplicate(all_news: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """按标题、内容和时间做跨源去重"""
    seen = set()
    unique_list = []

    for news in all_news:
        title = (news.get('title') or '').strip()
        content = (news.get('content') or '').strip()
        pub_date = (news.get('time') or news.get('pub_date') or '').strip()
        # 取标题前60字、内容前120字、精确到分钟的时间组合成去重 key，避免同一条新闻重复入库
        key = f"{title[:60]}|{content[:120]}|{pub_date[:19]}"
        if key in seen:
            continue
        seen.add(key)
        unique_list.append(news)

    unique_list.sort(key=lambda x: x.get('time', ''), reverse=True)
    return unique_list


def _normalize_text(value: str) -> str:
    return re.sub(r'\s+', ' ', (value or '').strip())


def derive_related_symbols(text: str) -> List[str]:
    """从新闻正文中匹配别名表，推导出涉及的跟踪标的列表（保持发现顺序，去重）"""
    normalized = text.lower()
    lookup = build_aliases_lookup()
    matched_symbols: List[str] = []
    seen: set[str] = set()
    for alias, records in lookup.items():
        if alias in normalized:
            for rec in records:
                sym = rec["symbol"]
                if sym not in seen:
                    seen.add(sym)
                    matched_symbols.append(sym)
    return matched_symbols


def _score_keyword_hits(text: str, keywords: List[str]) -> List[str]:
    return sorted({keyword for keyword in keywords if keyword.lower() in text})


def _score_keyword_hits_split(title: str, content: str, keywords: List[str]) -> Tuple[List[str], int, int]:
    """分别统计标题和正文的关键词命中，返回 (命中关键词列表, title_count, body_count)"""
    title_lower = title.lower()
    content_lower = content.lower()
    hits = set()
    title_count = 0
    body_count = 0
    for kw in keywords:
        kw_lower = kw.lower()
        in_title = kw_lower in title_lower
        in_body = kw_lower in content_lower
        if in_title or in_body:
            hits.add(kw)
            if in_title:
                title_count += 1
            if in_body:
                body_count += 1
    return sorted(hits), title_count, body_count


def bm25_saturate(count: int, weight: float, k1: float = 1.2) -> float:
    """BM25 饱和函数：抑制重复关键词的边际贡献"""
    if count <= 0:
        return 0.0
    return weight * (count * (k1 + 1)) / (count + k1)


def _compute_three_strategy_scores(
    title: str,
    content: str,
    profile: Dict[str, Any],
) -> Dict[str, Any]:
    """并行计算三种关键词评分策略的分数，返回命中详情和三种分数。"""
    text = f"{title}\n{content}".lower()
    related_symbols = derive_related_symbols(f"{title}\n{content}")

    # 整体命中（用于策略 A/B + 决策逻辑）
    macro_hits = _score_keyword_hits(text, profile["macro_keywords"])
    market_hits = _score_keyword_hits(text, profile["market_keywords"])
    noise_hits = _score_keyword_hits(text, profile["noise_keywords"])
    symbol_context_hits = _score_keyword_hits(text, profile["symbol_context_keywords"])

    # 分拆命中（用于策略 C）
    _, macro_title, macro_body = _score_keyword_hits_split(title, content, profile["macro_keywords"])
    _, market_title, market_body = _score_keyword_hits_split(title, content, profile["market_keywords"])
    _, noise_title, noise_body = _score_keyword_hits_split(title, content, profile["noise_keywords"])
    _, sym_ctx_title, sym_ctx_body = _score_keyword_hits_split(title, content, profile["symbol_context_keywords"])

    focus_hits = []
    focus_score_a = 0.0
    focus_score_b = 0.0
    focus_count_c = 0
    for topic in profile.get("focus_topics", []):
        matched = _score_keyword_hits(text, topic.get("keywords", []))
        if matched:
            focus_hits.append(f"{topic['label']}({', '.join(matched[:2])})")
            w = float(topic.get("weight", 2))
            focus_score_a += w
            focus_score_b += bm25_saturate(len(matched), w)
            # 策略 C: 分拆标题/正文
            _, ft, fb = _score_keyword_hits_split(title, content, topic.get("keywords", []))
            effective = ft * 2 + fb if title else fb
            focus_count_c += effective

    # --- 策略 A: 线性加权（现有方案）---
    score_a = (
        len(macro_hits) * 2.5
        + len(market_hits) * 1.7
        + len(related_symbols) * 3.5
        + len(symbol_context_hits) * 1.2
        + focus_score_a
    )
    score_a -= len(noise_hits) * 2.5

    # --- 策略 B: BM25 饱和 ---
    score_b = (
        bm25_saturate(len(macro_hits), 2.5)
        + bm25_saturate(len(market_hits), 1.7)
        + bm25_saturate(len(related_symbols), 3.5)
        + bm25_saturate(len(symbol_context_hits), 1.2)
        + focus_score_b
    )
    score_b -= bm25_saturate(len(noise_hits), 2.5)

    # --- 策略 C: BM25 饱和 + 标题加权 ---
    # 标题命中 ×2 + 正文命中；title 为空时 title_count=0，退化为策略 B
    macro_eff_c = macro_title * 2 + macro_body if title else macro_body
    market_eff_c = market_title * 2 + market_body if title else market_body
    noise_eff_c = noise_title * 2 + noise_body if title else noise_body
    sym_ctx_eff_c = sym_ctx_title * 2 + sym_ctx_body if title else sym_ctx_body

    score_c = (
        bm25_saturate(macro_eff_c, 2.5)
        + bm25_saturate(market_eff_c, 1.7)
        + bm25_saturate(len(related_symbols), 3.5)  # symbol 不区分标题/正文
        + bm25_saturate(sym_ctx_eff_c, 1.2)
        + bm25_saturate(focus_count_c, 2.0)
    )
    score_c -= bm25_saturate(noise_eff_c, 2.5)

    # VIP 降权
    if "vip" in text:
        score_a -= 0.5
        score_b -= 0.5
        score_c -= 0.5

    return {
        "score_a": score_a,
        "score_b": score_b,
        "score_c": score_c,
        "macro_hits": macro_hits,
        "market_hits": market_hits,
        "noise_hits": noise_hits,
        "symbol_context_hits": symbol_context_hits,
        "focus_hits": focus_hits,
        "related_symbols": related_symbols,
    }


def _score_to_stars(score: float) -> int:
    """将规则打分线性映射到 0-5 星重要性等级"""
    if score >= 10:
        return 5
    if score >= 8:
        return 4
    if score >= 6:
        return 3
    if score >= 4:
        return 2
    if score >= 2:
        return 1
    return 0


def _default_screening_profile() -> Dict[str, Any]:
    return {
        "macro_keywords": FALLBACK_KEYWORDS["macro"],
        "market_keywords": FALLBACK_KEYWORDS["market"],
        "noise_keywords": FALLBACK_KEYWORDS["noise"],
        "symbol_context_keywords": FALLBACK_KEYWORDS["symbol_context"],
        "focus_topics": [],
        "include_rules": [
            "保留显著影响全球经济、美股大盘、能源、利率和关键科技板块的新闻",
            "保留直接影响跟踪标的及其产业链的新闻",
        ],
        "exclude_rules": [
            "丢弃分析师评级、目标价、纯情绪点评、消费民生噪音和无市场含义的碎片新闻",
        ],
        "score_threshold": 4.5,
        "reasoning_summary": "默认静态规则回退",
    }


def _normalize_keyword_list(value: Any, fallback: List[str]) -> List[str]:
    if not isinstance(value, list):
        return fallback
    cleaned = []
    for item in value:
        normalized = _normalize_text(str(item))[:20]
        if normalized and normalized not in cleaned:
            cleaned.append(normalized)
    return cleaned or fallback


def _normalize_focus_topics(value: Any) -> List[Dict[str, Any]]:
    if not isinstance(value, list):
        return []
    topics = []
    for item in value[:8]:
        if not isinstance(item, dict):
            continue
        keywords = _normalize_keyword_list(item.get("keywords"), [])
        if not keywords:
            continue
        topics.append({
            "label": _normalize_text(str(item.get("label") or "动态主题"))[:30],
            "keywords": keywords[:6],
            "weight": max(1, min(5, int(item.get("weight") or 2))),
        })
    return topics


def _merge_keywords(static_list: List[str], dynamic_list: List[str]) -> List[str]:
    """合并静态词表与动态词表，去重并保持顺序（静态优先）"""
    seen = set()
    merged = []
    for word in static_list:
        if word not in seen:
            seen.add(word)
            merged.append(word)
    for word in dynamic_list:
        if word not in seen:
            seen.add(word)
            merged.append(word)
    return merged


def _build_rules_samples(news_list: List[Dict[str, Any]], sample_size: int) -> List[Dict[str, Any]]:
    """优先覆盖多来源与较新的新闻，压缩动态规则 prompt 长度。"""
    buckets: Dict[str, List[Dict[str, Any]]] = {}
    for news in news_list:
        source = news.get("source") or "unknown"
        buckets.setdefault(source, []).append(news)

    for bucket in buckets.values():
        bucket.sort(key=lambda item: item.get("time") or item.get("pub_date") or "", reverse=True)

    selected: List[Dict[str, Any]] = []
    seen_hashes: set[str] = set()
    sources = list(buckets.keys())

    # 轮询各数据源 bucket，每轮每个来源取一条，确保样本覆盖多个来源而不被单一来源独占
    while len(selected) < sample_size and sources:
        next_sources = []
        for source in sources:
            bucket = buckets.get(source, [])
            if not bucket:
                continue
            item = bucket.pop(0)
            sample_key = generate_news_hash(
                item.get("title"),
                item.get("content"),
                item.get("time") or item.get("pub_date"),
            )
            if sample_key in seen_hashes:
                continue
            seen_hashes.add(sample_key)
            selected.append(item)
            if bucket:
                next_sources.append(source)
            if len(selected) >= sample_size:
                break
        sources = next_sources

    return selected[:sample_size]


def _normalize_screening_profile(raw_profile: Dict[str, Any] | None) -> Dict[str, Any]:
    """规范化并合并静态词表与 LLM 动态词表。

    静态词表作为基础层，动态词表作为增量补充。
    """
    # 静态词表作为基础
    static_base = _get_screening_profile()

    if not isinstance(raw_profile, dict):
        # 无动态词表，仅使用静态词表
        return static_base

    # 合并静态词表与动态词表
    dynamic_macro = _normalize_keyword_list(raw_profile.get("macro_keywords"), [])
    dynamic_market = _normalize_keyword_list(raw_profile.get("market_keywords"), [])
    dynamic_noise = _normalize_keyword_list(raw_profile.get("noise_keywords"), [])
    dynamic_symbol = _normalize_keyword_list(raw_profile.get("symbol_context_keywords"), [])

    profile = {
        "macro_keywords": _merge_keywords(static_base["macro_keywords"], dynamic_macro),
        "market_keywords": _merge_keywords(static_base["market_keywords"], dynamic_market),
        "noise_keywords": _merge_keywords(static_base["noise_keywords"], dynamic_noise),
        "symbol_context_keywords": _merge_keywords(static_base["symbol_context_keywords"], dynamic_symbol),
        "focus_topics": _normalize_focus_topics(raw_profile.get("focus_topics")),
        "include_rules": _normalize_keyword_list(raw_profile.get("include_rules"), static_base["include_rules"]),
        "exclude_rules": _normalize_keyword_list(raw_profile.get("exclude_rules"), static_base["exclude_rules"]),
        "score_threshold": float(raw_profile.get("score_threshold", static_base["score_threshold"])),
        "reasoning_summary": _normalize_text(raw_profile.get("reasoning_summary") or ""),
        # 记录动态词增量，供日志使用
        "_dynamic_macro": dynamic_macro,
        "_dynamic_market": dynamic_market,
        "_dynamic_noise": dynamic_noise,
    }
    return profile


def _get_screening_profile() -> Dict[str, Any]:
    """获取初筛词表 profile。先尝试从 API 拉取，失败降级到 FALLBACK_KEYWORDS。"""
    api_keywords = _fetch_keywords_from_api()
    if api_keywords:
        source = "API"
        macro = api_keywords.get("macro", FALLBACK_KEYWORDS["macro"])
        market = api_keywords.get("market", FALLBACK_KEYWORDS["market"])
        noise = api_keywords.get("noise", FALLBACK_KEYWORDS["noise"])
        symbol_context = api_keywords.get("symbol_context", FALLBACK_KEYWORDS["symbol_context"])
    else:
        source = "FALLBACK"
        macro = list(FALLBACK_KEYWORDS["macro"])
        market = list(FALLBACK_KEYWORDS["market"])
        noise = list(FALLBACK_KEYWORDS["noise"])
        symbol_context = list(FALLBACK_KEYWORDS["symbol_context"])
    logger.info(
        "[初筛] 关键词来源=%s: 宏观=%s词, 市场=%s词, 噪音=%s词, 标的上下文=%s词",
        source, len(macro), len(market), len(noise), len(symbol_context),
    )
    return {
        "macro_keywords": macro,
        "market_keywords": market,
        "noise_keywords": noise,
        "symbol_context_keywords": symbol_context,
        "focus_topics": [],
        "include_rules": [
            "保留显著影响全球经济、美股大盘、能源、利率和关键科技板块的新闻",
            "保留直接影响跟踪标的及其产业链的新闻",
        ],
        "exclude_rules": [
            "丢弃分析师评级、目标价、纯情绪点评、消费民生噪音和无市场含义的碎片新闻",
        ],
        "score_threshold": 4.5,
        "reasoning_summary": f"关键词来源: {source}",
    }


def generate_dynamic_screening_profile(news_list: List[Dict[str, Any]], analysis_date: str) -> Dict[str, Any]:
    # 打印静态词表统计
    static_base = _get_screening_profile()
    logger.info(
        "[初筛] 静态词表: 宏观=%s词, 市场=%s词, 噪音=%s词",
        len(static_base["macro_keywords"]),
        len(static_base["market_keywords"]),
        len(static_base["noise_keywords"]),
    )

    if EFFECTIVE_SKIP_LLM:
        logger.warning("[初筛] SKIP_LLM=true，跳过动态规则生成，使用静态词表")
        return static_base

    sample_items = []
    for news in _build_rules_samples(news_list, LLM_RULES_SAMPLE_SIZE):
        sample_items.append({
            "t": news.get("time") or news.get("pub_date"),
            "s": news.get("source"),
            "h": _normalize_text(news.get("title") or "")[:72],
            "c": _normalize_text(news.get("content") or "")[:96],
        })

    messages = [
        {
            "role": "system",
            "content": (
                "你是金融新闻初筛规则生成器。"
                "你要根据当前新闻样本，动态给出本轮应重点关注和应排除的关键词与主题。"
                "新闻样本可能包含中文和英文，keywords 支持中英文短词，根据样本语言产出对应语言的关键词。"
                "只输出 JSON，不要输出解释。"
            ),
        },
        {
            "role": "user",
            "content": (
                "返回一个 JSON 对象，字段必须包含："
                "macro_keywords, market_keywords, noise_keywords, symbol_context_keywords, "
                "focus_topics, include_rules, exclude_rules, score_threshold, reasoning_summary。\n"
                "要求：keywords 支持中英文短词数组，若样本含英文新闻需同时给出英文关键词；"
                "focus_topics 每项含 label/keywords/weight(1-5)；"
                "noise_keywords 优先覆盖与全球经济或股市无关的主题；"
                f"跟踪标的：个股={list(STOCK_TRACKED_SYMBOLS)}，板块={list(SECTOR_TRACKED_SYMBOLS)}，大盘={list(INDEX_TRACKED_SYMBOLS)}；"
                "score_threshold 取 3.5-7.5；只输出 JSON。\n\n"
                f"{json.dumps({'analysis_date': analysis_date, 'samples': sample_items}, ensure_ascii=False)}"
            ),
        },
    ]

    llm_result = llm_client.call_chat(
        messages,
        log_label="动态初筛规则 %s" % analysis_date,
        model=LLM_RULES_MODEL_ID,
        max_tokens=1400,
        timeout=LLM_RULES_TIMEOUT,
    )

    # LLM 调用失败，降级使用静态词表
    if not llm_result.success:
        logger.warning(
            "[初筛] 动态规则生成失败: model=%s, error=%s，降级使用静态词表",
            LLM_RULES_MODEL_ID, llm_result.error,
        )
        return static_base

    try:
        profile = _normalize_screening_profile(_extract_json_payload(llm_result.response_text))
        # 打印动态词增量
        dynamic_macro = profile.pop("_dynamic_macro", [])
        dynamic_market = profile.pop("_dynamic_market", [])
        dynamic_noise = profile.pop("_dynamic_noise", [])
        logger.info(
            "[初筛] 动态词表(LLM生成): 新增宏观=%s词%s, 新增市场=%s词%s, 新增噪音=%s词%s, 动态主题=%s个%s",
            len(dynamic_macro), dynamic_macro[:5] if dynamic_macro else "",
            len(dynamic_market), dynamic_market[:5] if dynamic_market else "",
            len(dynamic_noise), dynamic_noise[:5] if dynamic_noise else "",
            len(profile["focus_topics"]),
            [t["label"] for t in profile["focus_topics"][:3]] if profile["focus_topics"] else "",
        )
        logger.info(
            "[初筛] 合并后: 宏观=%s词, 市场=%s词, 噪音=%s词, threshold=%.1f",
            len(profile["macro_keywords"]),
            len(profile["market_keywords"]),
            len(profile["noise_keywords"]),
            profile["score_threshold"],
        )
        return profile
    except Exception as exc:
        logger.warning(
            "[初筛] 动态规则JSON解析失败: %s，降级使用静态词表。原始响应前500字: %s",
            exc, llm_result.response_text[:500],
        )
        return static_base


def apply_rule_filter(news: Dict[str, Any], profile: Dict[str, Any]) -> Dict[str, Any]:
    """动态初筛，只保留真正影响宏观/大盘/标的的新闻

    返回 dict。rule_passed=1 表示通过，rule_passed=0 表示被过滤（含 rule_reason 说明原因）。
    """
    pub_date = _normalize_text(news.get('time') or news.get('pub_date') or '')
    title = _normalize_text(news.get('title') or '')
    content = _normalize_text(news.get('content') or '')

    def _make_rejected(reason: str) -> Dict[str, Any]:
        fallback_title = title or content[:36] or "未命名新闻"
        item = {
            'pub_date': pub_date or '',
            'title': fallback_title,
            'content': content[:500],
            'url': news.get('url', ''),
            'source': news.get('source', ''),
            'sub_source': news.get('sub_source', ''),
            'language': news.get('language', 'zh'),
            'type': 'index',
            'rule_passed': 0,
            'rule_reason': reason,
            'processing_status': 'rule_filtered',
            'ai_summary': '',
            'market_impact': '',
            'importance_stars': 0,
            'related_symbols': [],
            'is_relevant_to_review': 0,
            'llm_batch_id': '',
        }
        item['news_hash'] = generate_news_hash(item['title'], item['content'], item['pub_date'])
        return item

    if not pub_date or not content:
        rejected = _make_rejected('缺少时间或内容字段')
        rejected['_scoring'] = {}
        return rejected

    # 三种策略并行评分
    scoring = _compute_three_strategy_scores(title, content, profile)
    score_a = scoring["score_a"]
    score_b = scoring["score_b"]
    score_c = scoring["score_c"]
    macro_hits = scoring["macro_hits"]
    market_hits = scoring["market_hits"]
    noise_hits = scoring["noise_hits"]
    symbol_context_hits = scoring["symbol_context_hits"]
    focus_hits = scoring["focus_hits"]
    related_symbols = scoring["related_symbols"]
    text = f"{title}\n{content}".lower()

    # 根据激活策略选择实际用于过滤决策的分数
    strategy_scores = {"A": score_a, "B": score_b, "C": score_c}
    score = strategy_scores.get(RULE_ACTIVE_STRATEGY, score_a)

    threshold = float(profile.get("score_threshold", 4.5))
    keep = False
    rule_type = "index"  # type 字段由 Stage 3 LLM 最终判断，此处统一默认值
    reasons = []

    if related_symbols:
        keep = True
        reasons.append(f"涉及跟踪标的 {', '.join(related_symbols[:3])}")
        if symbol_context_hits:
            reasons.append(f"标的事件命中 {', '.join(symbol_context_hits[:3])}")
    elif focus_hits:
        keep = True
        reasons.append(f"动态主题命中 {'；'.join(focus_hits[:2])}")
    elif len(macro_hits) >= 2 or score >= threshold:
        keep = True
        if macro_hits:
            reasons.append(f"宏观关键词命中 {', '.join(macro_hits[:3])}")
        if market_hits:
            reasons.append(f"市场关键词命中 {', '.join(market_hits[:3])}")
    elif len(market_hits) >= 2 and not noise_hits:
        keep = True
        reasons.append(f"板块/市场事件命中 {', '.join(market_hits[:3])}")

    # 噪音命中且没有跟踪标的、宏观关键词不足时，强制过滤，避免软性噪音通过评分门槛
    noise_override = noise_hits and not related_symbols and len(macro_hits) < 2
    if noise_override:
        keep = False

    logger.debug(
        "[初筛] 评分: score=%.1f, keep=%s, macro=%s, market=%s, noise=%s, symbols=%s, title=%s",
        score, keep, macro_hits, market_hits, noise_hits, related_symbols, title[:40],
    )

    if not keep:
        if noise_override:
            reason = f"噪音词命中({', '.join(noise_hits[:2])})；无跟踪标的且宏观词不足"
        else:
            parts = []
            if noise_hits:
                parts.append(f"噪音词({', '.join(noise_hits[:2])})")
            if not macro_hits and not market_hits and not related_symbols:
                parts.append("无关键词命中")
            parts.append(f"score={score:.1f} threshold={float(profile.get('score_threshold', 4.5)):.1f}")
            reason = '；'.join(parts)
        rejected = _make_rejected(reason)
        rejected['_scoring'] = {
            "strategy_a_score": round(score_a, 2),
            "strategy_b_score": round(score_b, 2),
            "strategy_c_score": round(score_c, 2),
            "active_strategy": RULE_ACTIVE_STRATEGY,
            "rule_threshold": threshold,
            "macro_hits": macro_hits,
            "market_hits": market_hits,
            "noise_hits": noise_hits,
            "symbol_hits": related_symbols,
            "focus_hits": focus_hits,
        }
        return rejected

    fallback_title = title or _normalize_text(content[:36]) or "未命名新闻"
    summary = news.get('summary') or fallback_title or content[:140]
    cleaned = {
        'pub_date': pub_date,
        'time': pub_date,
        'title': fallback_title,
        'summary': _normalize_text(summary)[:200],
        'content': content[:500],
        'url': news.get('url', ''),
        'source': news.get('source', ''),
        'sub_source': news.get('sub_source', ''),
        'language': news.get('language', 'zh'),
        'type': rule_type,
        'rule_passed': 1,
        'rule_reason': '；'.join(reasons[:3]) or "规则保留",
        'processing_status': 'rule_screened',
        'ai_summary': '',
        'market_impact': '',
        'importance_stars': _score_to_stars(score),
        'primary_symbol': related_symbols[0] if related_symbols else None,
        'related_symbols': related_symbols,
        'is_relevant_to_review': 1,
        'llm_batch_id': '',
        'review_archive_date': None,
        'reviewed_at': None,
    }
    cleaned['news_hash'] = generate_news_hash(cleaned['title'], cleaned['content'], cleaned['pub_date'])
    cleaned['_scoring'] = {
        "strategy_a_score": round(score_a, 2),
        "strategy_b_score": round(score_b, 2),
        "strategy_c_score": round(score_c, 2),
        "active_strategy": RULE_ACTIVE_STRATEGY,
        "rule_threshold": threshold,
        "macro_hits": macro_hits,
        "market_hits": market_hits,
        "noise_hits": noise_hits,
        "symbol_hits": related_symbols,
        "focus_hits": focus_hits,
    }
    return cleaned


def score_news_by_rules(news_list: List[Dict[str, Any]], profile: Dict[str, Any]) -> List[Dict[str, Any]]:
    """对全量新闻逐条计算 rule_score（软加分），所有新闻均保留进入 Stage 2。

    返回全量新闻列表，每条附加 _scoring.rule_score 字段。
    不再区分 passed/rejected，Stage 2 Embedding 综合 rule_score 做最终过滤。
    """
    scored = []
    for news in news_list:
        result = apply_rule_filter(news, profile)
        # 计算 rule_score：取当前激活策略的分数，最低为 0
        scoring = result.get("_scoring", {})
        strategy_key = f"strategy_{RULE_ACTIVE_STRATEGY.lower()}_score"
        rule_score = max(0.0, scoring.get(strategy_key, 0.0))
        scoring["rule_score"] = round(rule_score, 2)
        result["_scoring"] = scoring
        # 软加分模式：所有新闻标记为 rule_passed=1
        result["rule_passed"] = 1
        result["processing_status"] = "rule_screened"
        scored.append(result)
    scored.sort(key=lambda item: (item.get("_scoring", {}).get("rule_score", 0), item.get("pub_date", "")), reverse=True)
    logger.info("[Stage 1] 软加分完成: %s条新闻, 全部进入 Stage 2", len(scored))
    return scored


def _extract_json_payload(raw_text: str) -> Any:
    """从 LLM 输出中提取 JSON 载荷

    先尝试剥除 ```json ... ``` 代码块，再定位第一个 { 或 [ 到最后一个 } 或 ]，
    以应对模型在 JSON 前后输出多余文本的情况。
    """
    content = (raw_text or '').strip()
    if not content:
        raise ValueError("empty content")

    # 剥除 markdown 代码块包装（LLM 常见输出格式）
    fenced_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", content)
    if fenced_match:
        content = fenced_match.group(1).strip()

    # 定位 JSON 有效载荷的首尾边界，截掉前后的多余文字
    start = min([pos for pos in [content.find('{'), content.find('[')] if pos != -1], default=-1)
    end = max(content.rfind('}'), content.rfind(']'))
    if start != -1 and end != -1 and end > start:
        content = content[start:end + 1]

    return json.loads(content)


def _chunk_items(items: List[Dict[str, Any]], batch_size: int) -> List[List[Dict[str, Any]]]:
    return [items[index:index + batch_size] for index in range(0, len(items), batch_size)]


def _fallback_batch_result(news_batch: List[Dict[str, Any]], batch_id: str, degraded: bool = False) -> Dict[str, Any]:
    """LLM 调用失败时的降级处理：直接沿用规则初筛结果，全部标记为 keep=True"""
    items = []
    for news in news_batch:
        raw_summary = news.get("summary") or news.get("title") or news.get("content", "")[:80]
        ai_summary = f"(降级) {raw_summary}" if degraded else raw_summary
        items.append({
            "news_hash": news["news_hash"],
            "keep": True,
            "type": news.get("type", "index"),
            "ai_summary": ai_summary,
            "market_impact": news.get("rule_reason", "可能影响市场情绪和相关标的。"),
            "importance_stars": news.get("importance_stars", 2),
            "primary_symbol": news.get("primary_symbol"),
            "related_symbols": news.get("related_symbols", []),
        })

    return {"items": items, "raw_text": json.dumps({"items": items}, ensure_ascii=False), "batch_id": batch_id}


def _call_batch_llm(news_batch: List[Dict[str, Any]], batch_id: str) -> Dict[str, Any]:
    if EFFECTIVE_SKIP_LLM:
        return _fallback_batch_result(news_batch, batch_id)

    batch_prompt = {
        "items": [
            {
                "news_hash": news["news_hash"],
                "time": news.get("pub_date"),
                "source": news.get("source"),
                "rule_type": news.get("type"),
                "rule_reason": news.get("rule_reason"),
                "related_symbols": news.get("related_symbols", []),
                "title": news.get("title"),
                "content": (news.get("content") or "")[:180],
            }
            for news in news_batch
        ]
    }

    batch_count = len(news_batch)
    messages = [
        {
            "role": "system",
            "content": (
                "你是一位拥有20年经验的金融新闻筛选专家。"
                "请只输出 JSON，不要输出额外解释。"
                "你需要对输入新闻逐条判断是否值得保留进入正式新闻库。"
                "所有 ai_summary、market_impact、cot_reasoning 必须使用中文。\n\n"
                "## importance_stars 评分标准与锚定示例\n"
                "评分必须严格参照以下标准和示例：\n\n"
                "**5星（极重要，改变当日主线）**：显著改变宏观主线、大盘方向、流动性/利率预期的重大事件。\n"
                "  示例：「美联储意外降息50基点，远超市场预期的25基点」\n\n"
                "**4星（重要，值得重点复盘）**：对重点板块、核心资产或跟踪标的有明确且较强影响。\n"
                "  示例：「美光科技Q3财报：营收同比增长93%，HBM出货量超预期30%」\n\n"
                "**3星（有信息增量，纳入复盘）**：有明确市场信息增量，但不是当天最核心主线。\n"
                "  示例：「三星电子宣布投资50亿美元扩建HBM产线，预计2027年投产」\n\n"
                "**2星（背景补充）**：影响较弱，仅作背景补充，不建议纳入复盘主视图。\n"
                "  示例：「摩根大通上调美光科技目标价至145美元，维持增持评级」\n\n"
                "**1星（弱相关）**：弱相关、低信息增量，或只有轻微信号价值。\n"
                "  示例：「某半导体公司高管减持5000股，价值约12万美元」\n\n"
                "**0星（噪音）**：噪音、重复、无市场意义，应标记 keep=false。\n"
            ),
        },
        {
            "role": "user",
            "content": (
                "请处理以下新闻批次，并严格返回 JSON 对象，格式如下：\n"
                "{\n"
                '  "items": [\n'
                "    {\n"
                '      "news_hash": "原样返回",\n'
                '      "keep": true,\n'
                '      "type": "index|sector|stock",\n'
                '      "cot_reasoning": "重要理由: ... | 不重要理由: ... | 综合判断: ...",\n'
                '      "ai_summary": "一句中文摘要",\n'
                '      "market_impact": "一句中文说明市场影响",\n'
                '      "importance_stars": 0,\n'
                '      "primary_symbol": "MU 或 null",\n'
                '      "related_symbols": ["MU"]\n'
                "    }\n"
                "  ]\n"
                "}\n"
                "要求：\n"
                "1. 对每条新闻，必须先在 cot_reasoning 中思考：\n"
                "   - 列出2-3个该新闻重要的理由\n"
                "   - 列出2-3个该新闻不重要的理由\n"
                "   - 综合两方面后给出最终判断\n"
                "2. 如果一条新闻信息价值不够高，可以返回 keep=false，importance_stars 必须给 0。\n"
                "3. 保留新闻时，importance_stars 必须是 1-5 的整数。\n"
                "4. related_symbols 必须是数组。\n"
                "5. type 取值规则：index=影响大盘/宏观/央行/大宗商品；sector=影响某板块/行业；stock=直接影响具体个股。\n"
                f"6. **分布约束**：本批共{batch_count}条新闻，你的评分必须遵循以下分布：\n"
                f"   - 5星：最多{max(1, batch_count // 5)}条（不超过20%）\n"
                f"   - 4-5星合计：最多{max(2, int(batch_count * 0.4))}条（不超过40%）\n"
                "   - 如果你觉得大部分都很重要，请重新校准你的标准，参照锚定示例。\n"
                "7. 若新闻仅是分析师评级、目标价、纯情绪点评、无新增事实的二手解读，通常不应高于 2 星。\n"
                "8. 若新闻直接影响美联储路径、利率/通胀预期、地缘风险、核心指数，或核心跟踪标的的财报、指引、订单、监管、资本开支，通常应优先考虑 3-5 星。\n"
                "9. 只返回 JSON。\n\n"
                f"{json.dumps(batch_prompt, ensure_ascii=False)}"
            ),
        },
    ]

    llm_result = llm_client.call_chat(
        messages,
        log_label="新闻批次分析 %s" % batch_id,
        model=LLM_BATCH_MODEL_ID,
        max_tokens=2400,
        timeout=LLM_BATCH_TIMEOUT,
        max_retries=0,  # 重试由 enhance_news_with_llm 统一处理
    )
    if not llm_result.success:
        raise RuntimeError("[批次分析] %s 调用失败: %s" % (batch_id, llm_result.error))

    logger.info("[批次分析] %s LLM原始返回(前200字): %s", batch_id, llm_result.response_text[:200])

    try:
        parsed = _extract_json_payload(llm_result.response_text)
        if not isinstance(parsed, dict) or not isinstance(parsed.get("items"), list):
            raise ValueError("invalid batch payload")
        parsed["raw_text"] = llm_result.response_text
        parsed["batch_id"] = batch_id
        return parsed
    except Exception as exc:
        raise ValueError("[批次分析] %s JSON解析失败: %s" % (batch_id, exc)) from exc


def _normalize_type(value: str | None, fallback: str) -> str:
    """规范化新闻类型字段，兼容旧版枚举值（macro/market/symbol -> index/sector/stock）"""
    # 新值
    if value in {"index", "sector", "stock"}:
        return value
    # 向后兼容旧值
    if value == "macro":
        return "index"
    if value == "market":
        return "sector"
    if value == "symbol":
        return "stock"
    return fallback


def _normalize_importance_stars(value: Any, fallback: int) -> int:
    try:
        normalized = int(value)
    except (TypeError, ValueError):
        normalized = fallback
    return max(0, min(5, normalized))


def _normalize_related_symbols(value: Any, fallback: List[str]) -> List[str]:
    if isinstance(value, list):
        normalized = [item for item in value if isinstance(item, str) and item]
        return normalized or fallback
    return fallback


def canonicalize_related_symbols(
    raw: List[str],
    tracked_set: set,
    aliases_lookup: dict,
) -> List[str]:
    """将 LLM 输出的原始 symbol 列表规范化为系统代码（tracked_symbols.symbol）。

    - 已是系统代码 → 直接保留
    - 是已知别名 → 映射到系统代码
    - 无法识别 → 丢弃（如 002475.SZ 等非跟踪标的）
    """
    result: List[str] = []
    seen: set = set()
    for s in raw:
        if s in tracked_set:
            if s not in seen:
                seen.add(s)
                result.append(s)
        else:
            matches = aliases_lookup.get(s.lower(), [])
            for rec in matches:
                sym = rec["symbol"]
                if sym not in seen:
                    seen.add(sym)
                    result.append(sym)
                break
    return result


def _merge_batch_result(news_batch: List[Dict[str, Any]], llm_result: Dict[str, Any], batch_no: int, analysis_date: str) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], Dict[str, Any]]:
    """将 LLM 批量返回结果与原始新闻合并，LLM 字段优先，缺失时回退规则字段"""
    # 以 news_hash 为键构建 LLM 结果索引，便于 O(1) 查找
    result_by_hash = {
        item.get("news_hash"): item
        for item in llm_result.get("items", [])
        if isinstance(item, dict) and item.get("news_hash")
    }
    batch_id = llm_result.get("batch_id", f"{analysis_date}-batch-{batch_no}")
    processed_items = []
    kept_items = []

    tracked_set = {rec["symbol"] for rec in get_tracked_symbols()}
    aliases_lookup = build_aliases_lookup()

    for news in news_batch:
        item_result = result_by_hash.get(news["news_hash"], {})
        keep = item_result.get("keep", True)

        related_symbols = canonicalize_related_symbols(
            _normalize_related_symbols(item_result.get("related_symbols"), news.get("related_symbols", [])),
            tracked_set,
            aliases_lookup,
        )
        merged = dict(news)
        merged["type"] = _normalize_type(item_result.get("type"), news.get("type", "index"))
        merged["ai_summary"] = _normalize_text(item_result.get("ai_summary") or news.get("summary") or news.get("title"))
        merged["market_impact"] = _normalize_text(item_result.get("market_impact") or news.get("rule_reason"))
        merged["importance_stars"] = _normalize_importance_stars(item_result.get("importance_stars"), news.get("importance_stars", 0))
        merged["llm_original_stars"] = merged["importance_stars"]  # 保留 LLM 原始星级
        merged["cot_reasoning"] = _normalize_text(item_result.get("cot_reasoning", ""))
        merged["primary_symbol"] = item_result.get("primary_symbol") or (related_symbols[0] if related_symbols else news.get("primary_symbol"))
        merged["related_symbols"] = related_symbols
        merged["is_relevant_to_review"] = 1 if keep else 0
        merged["llm_batch_id"] = batch_id
        merged["processing_status"] = "llm_processed" if keep else "llm_discarded"
        processed_items.append(merged)
        if keep:
            kept_items.append(merged)

    # 打星兜底：如果 ≥ 80% 的保留新闻为 5 星，用规则评分重新分配
    star_fallback_triggered = False
    if kept_items:
        five_star_count = sum(1 for item in kept_items if item.get("importance_stars") == 5)
        if five_star_count / len(kept_items) >= 0.8:
            star_fallback_triggered = True
            logger.warning(
                "[打星兜底] %s/%s条为5星(≥80%%)，触发规则评分重新分配",
                five_star_count, len(kept_items),
            )
            for item in kept_items:
                if item.get("importance_stars") == 5:
                    scoring = item.get("_scoring", {})
                    rule_score = scoring.get(f"strategy_{RULE_ACTIVE_STRATEGY.lower()}_score", 0)
                    item["importance_stars"] = _score_to_stars(rule_score)

    batch_record = {
        "analysis_date": analysis_date,
        "analysis_scope": "batch",
        "batch_no": batch_no,
        "daily_major_events": "\n".join(f"- {item['title'] or item['summary']}" for item in kept_items if item.get("type") in {"index", "sector", "macro", "market"}),
        "sector_impact_map": f"保留 {len(kept_items)} 条 / 输入 {len(news_batch)} 条",
        "linkage_logic_chain": "\n".join(f"- {item['title'] or item['summary']}" for item in kept_items if item.get("type") in {"stock", "symbol"}),
        "raw_summary": llm_result.get("raw_text", ""),
        "star_fallback_triggered": star_fallback_triggered,
    }
    return processed_items, kept_items, batch_record


def enhance_news_with_llm(filtered_news: List[Dict[str, Any]], analysis_date: str) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
    import math
    if not filtered_news:
        return [], [], []

    batches = _chunk_items(filtered_news, LLM_BATCH_SIZE)
    processed_news: List[Dict[str, Any]] = []
    enhanced: List[Dict[str, Any]] = []
    batch_records: Dict[int, Dict[str, Any]] = {}
    failed_batches: List[tuple] = []  # (batch_no, batch)

    # --- 主批次并发 ---
    with ThreadPoolExecutor(max_workers=LLM_MAX_WORKERS) as executor:
        futures = {}
        for index, batch in enumerate(batches, start=1):
            batch_id = f"{analysis_date}-batch-{index}"
            futures[executor.submit(_call_batch_llm, batch, batch_id)] = (index, batch)

        for future in as_completed(futures):
            batch_no, batch = futures[future]
            batch_id = f"{analysis_date}-batch-{batch_no}"
            try:
                llm_result = future.result()
                processed_items, kept_items, batch_record = _merge_batch_result(batch, llm_result, batch_no, analysis_date)
                processed_news.extend(processed_items)
                enhanced.extend(kept_items)
                batch_records[batch_no] = batch_record
            except Exception as exc:
                logger.warning("[Stage 3 重试] %s 失败，加入重试队列: %s", batch_id, exc)
                failed_batches.append((batch_no, batch))

    # --- 重试阶段：将失败批次均分为 3 份并发重试 ---
    if failed_batches:
        retry_sub_batches: List[tuple] = []  # (batch_no, sub_idx, sub_batch, retry_batch_id)
        for batch_no, batch in failed_batches:
            chunk_size = max(1, math.ceil(len(batch) / 3))
            sub_batches = _chunk_items(batch, chunk_size)
            for sub_idx, sub_batch in enumerate(sub_batches, start=1):
                retry_batch_id = f"{analysis_date}-batch-{batch_no}-retry-{sub_idx}"
                retry_sub_batches.append((batch_no, sub_idx, sub_batch, retry_batch_id))

        logger.info(
            "[Stage 3 重试] %s 个批次失败，拆分为 %s 个子批次（每批约 %s 条）并发重试",
            len(failed_batches), len(retry_sub_batches),
            max(1, math.ceil(LLM_BATCH_SIZE / 3)),
        )

        with ThreadPoolExecutor(max_workers=len(retry_sub_batches)) as retry_executor:
            retry_futures = {
                retry_executor.submit(_call_batch_llm, sub_batch, retry_batch_id): (batch_no, sub_idx, sub_batch, retry_batch_id)
                for batch_no, sub_idx, sub_batch, retry_batch_id in retry_sub_batches
            }

            for future in as_completed(retry_futures):
                batch_no, sub_idx, sub_batch, retry_batch_id = retry_futures[future]
                try:
                    llm_result = future.result()
                    logger.info("[Stage 3 重试] %s 成功: %s 条", retry_batch_id, len(sub_batch))
                except Exception as exc:
                    logger.warning("[Stage 3 重试] %s 失败，降级处理: %s", retry_batch_id, exc)
                    llm_result = _fallback_batch_result(sub_batch, retry_batch_id, degraded=True)

                # 子批次用小数 key（如 24.1/24.2/24.3）保证排序在主批次之后
                sub_key = batch_no + sub_idx * 0.01
                processed_items, kept_items, batch_record = _merge_batch_result(sub_batch, llm_result, batch_no, analysis_date)
                processed_news.extend(processed_items)
                enhanced.extend(kept_items)
                batch_records[sub_key] = batch_record

        retry_success = sum(1 for _, sub_idx, _, _ in retry_sub_batches if sub_idx > 0)
        logger.info("[Stage 3 重试] 完成: %s 个子批次处理完毕", len(retry_sub_batches))

    enhanced.sort(
        key=lambda item: (
            item.get("importance_stars", 0),
            item.get("pub_date", ""),
        ),
        reverse=True,
    )
    ordered_batch_records = [batch_records[index] for index in sorted(batch_records)]
    return processed_news, enhanced, ordered_batch_records


def _parse_summary_output(summary: str) -> Dict[str, str]:
    """解析日期级综合分析的 LLM 输出。

    优先尝试 JSON 解析；若失败则回退正则匹配 Markdown 章节（兼容模型输出格式不稳定的情况）。
    """
    result = {
        "daily_major_events": [],
        "sector_impact_map": [],
        "linkage_logic_chain": [],
    }
    try:
        parsed = _extract_json_payload(summary)
        if isinstance(parsed, dict):
            for key in result:
                value = parsed.get(key)
                if isinstance(value, list):
                    result[key] = [str(item).strip() for item in value if str(item).strip()]
                elif value:
                    result[key] = [str(value).strip()]
            return result
    except Exception:
        pass

    # JSON 解析失败时，尝试按 Markdown 标题切分提取各章节内容
    patterns = {
        "daily_major_events": r"###\s*今日大事概览\s*\n([\s\S]*?)(?=###\s*大盘与板块影响图谱|###\s*联动逻辑链|$)",
        "sector_impact_map": r"###\s*大盘与板块影响图谱\s*\n([\s\S]*?)(?=###\s*联动逻辑链|$)",
        "linkage_logic_chain": r"###\s*联动逻辑链\s*\n([\s\S]*?)$",
    }
    for key, pattern in patterns.items():
        match = re.search(pattern, summary or "")
        if match:
            lines = [
                line.strip().lstrip("-").strip()
                for line in match.group(1).splitlines()
                if line.strip()
            ]
            result[key] = [line for line in lines if line]
    return result


def _format_summary_markdown(parsed: Dict[str, List[str]]) -> str:
    return (
        "### 今日大事概览\n"
        f"{chr(10).join(f'- {item}' for item in parsed.get('daily_major_events', []) if item) or '- 暂无'}\n\n"
        "### 大盘与板块影响图谱\n"
        f"{chr(10).join(f'- {item}' for item in parsed.get('sector_impact_map', []) if item) or '- 暂无'}\n\n"
        "### 联动逻辑链\n"
        f"{chr(10).join(f'- {item}' for item in parsed.get('linkage_logic_chain', []) if item) or '- 暂无'}"
    )


def _generate_rule_based_summary(news_list: List[Dict[str, Any]]) -> str:
    if not news_list:
        return ""

    parsed = {
        "daily_major_events": [
            f"{item['title'] or item.get('summary') or '重要事件'}：{item.get('market_impact') or item.get('rule_reason') or '对市场情绪有直接影响。'}"
            for item in news_list[:5]
        ],
        "sector_impact_map": [],
        "linkage_logic_chain": [
            f"{item['title'] or item.get('summary') or '事件'} -> {item.get('market_impact') or item.get('rule_reason') or '影响市场预期'}"
            for item in news_list[:3]
        ],
    }
    seen_market_labels: set[str] = set()
    for item in news_list:
        symbols = item.get("related_symbols") or []
        item_type = item.get("type", "index")
        if symbols:
            label = "/".join(symbols[:3])
            if label not in seen_market_labels:
                seen_market_labels.add(label)
                prefix = "[个股]" if item_type == "stock" else "[板块]" if item_type == "sector" else "[大盘]"
                parsed["sector_impact_map"].append(
                    f"{prefix} {label}：偏多。原因是{item.get('market_impact') or item.get('rule_reason') or '相关事件改善了该方向的交易预期。'}"
                )
        elif item_type in {"index", "macro", "market"} and "美股大盘" not in seen_market_labels:
            seen_market_labels.add("美股大盘")
            parsed["sector_impact_map"].append(
                "[大盘] 美股大盘：中性。原因是宏观与市场事件交织，短线方向仍取决于后续定价。"
            )
    return _format_summary_markdown(parsed)


def _build_daily_summary_payload(news_list: List[Dict[str, Any]], analysis_date: str) -> Dict[str, Any]:
    items: List[Dict[str, Any]] = []
    for index, item in enumerate(news_list, start=1):
        items.append({
            "rank": index,
            "news_hash": item.get("news_hash"),
            "pub_date": item.get("pub_date"),
            "type": item.get("type"),
            "importance_stars": item.get("importance_stars"),
            "primary_symbol": item.get("primary_symbol"),
            "related_symbols": item.get("related_symbols", []),
            "title": item.get("title"),
            "content": item.get("content") or "",
            "ai_summary": item.get("ai_summary") or "",
            "market_impact": item.get("market_impact") or "",
            "source": item.get("source") or "",
        })
    return {
        "analysis_date": analysis_date,
        "item_count": len(items),
        "items": items,
    }


def get_latest_closed_trading_day(context: ExecutionContext | None = None) -> str:
    """按 NYSE 日历计算最近一个已收盘交易日"""
    context = context or build_execution_context()
    ny_tz = pytz.timezone('America/New_York')
    now_ny = context.clock.now_in_tz('America/New_York')
    nyse = mcal.get_calendar('NYSE')
    schedule = nyse.schedule(start_date=now_ny.date() - pd.Timedelta(days=10), end_date=now_ny.date())
    # 过滤出收盘时间已过的交易日，取最后一个即为最近收盘日
    closed_sessions = schedule[schedule['market_close'] <= now_ny]

    if closed_sessions.empty:
        return now_ny.strftime('%Y-%m-%d')

    latest_close = closed_sessions.iloc[-1].name
    return latest_close.strftime('%Y-%m-%d')


def get_current_review_trading_day(context: ExecutionContext | None = None) -> str:
    """返回当前应归属的复盘日。

    - 若今天是 NYSE 交易日，则无论盘前/盘中/盘后都归属今天；
    - 若今天不是交易日，则回退到最近一个已收盘交易日。
    """
    context = context or build_execution_context()
    ny_tz = pytz.timezone('America/New_York')
    now_ny = context.clock.now_in_tz('America/New_York')
    nyse = mcal.get_calendar('NYSE')
    schedule = nyse.schedule(
        start_date=now_ny.date() - pd.Timedelta(days=10),
        end_date=now_ny.date() + pd.Timedelta(days=10),
    )

    trading_days = {session.date() for session in schedule.index}
    if now_ny.date() in trading_days:
        return now_ny.strftime('%Y-%m-%d')

    return get_latest_closed_trading_day(context)


def get_active_review_trading_day(context: ExecutionContext | None = None) -> str:
    """按 6 小时新闻节奏计算当前新闻应归属的复盘日"""
    context = context or build_execution_context()
    ny_tz = pytz.timezone('America/New_York')
    now_ny = context.clock.now_in_tz('America/New_York')
    nyse = mcal.get_calendar('NYSE')
    schedule = nyse.schedule(
        start_date=now_ny.date() - pd.Timedelta(days=10),
        end_date=now_ny.date() + pd.Timedelta(days=10),
    )
    upcoming_sessions = schedule[schedule['market_close'] >= now_ny]

    if upcoming_sessions.empty:
        return get_latest_closed_trading_day(context)

    review_date = upcoming_sessions.iloc[0].name
    return review_date.strftime('%Y-%m-%d')


def subtract_trading_days(date_string: str, count: int) -> str:
    """向前回退 count 个交易日（简化实现，仅跳过周末，不排除法定假日）"""
    current = datetime.strptime(date_string, "%Y-%m-%d")
    remaining = count
    while remaining > 0:
        current -= pd.Timedelta(days=1)
        if current.weekday() < 5:
            remaining -= 1
    return current.strftime("%Y-%m-%d")


def _nyse_close_in_beijing(date_str: str) -> str:
    """将 NYSE 收盘时刻（纽约时间 16:00）转换为对应的北京时间字符串。

    夏令时（EDT, UTC-4）时为次日 04:00 北京；
    冬令时（EST, UTC-5）时为次日 05:00 北京。
    ZoneInfo 自动处理夏令时，无需手动维护偏移量。
    """
    ny_tz = ZoneInfo("America/New_York")
    bj_tz = ZoneInfo("Asia/Shanghai")
    close_ny = datetime.strptime(f"{date_str} 16:00:00", "%Y-%m-%d %H:%M:%S").replace(tzinfo=ny_tz)
    return close_ny.astimezone(bj_tz).strftime("%Y-%m-%d %H:%M:%S")


def get_analysis_window(analysis_date: str) -> Tuple[str, str]:
    """返回分析窗口的起止时间（北京时间）：从上一交易日 NYSE 收盘到当日 NYSE 收盘。"""
    start_date = subtract_trading_days(analysis_date, 1)
    return _nyse_close_in_beijing(start_date), _nyse_close_in_beijing(analysis_date)


def build_daily_summary_record(news_list: List[Dict[str, Any]], analysis_date: str) -> Dict[str, Any]:
    if not news_list:
        return {
            "analysis_date": analysis_date,
            "analysis_scope": "daily_summary",
            "batch_no": 0,
            "daily_major_events": "",
            "sector_impact_map": "",
            "linkage_logic_chain": "",
            "source_news_ids": "[]",
            "raw_summary": "",
        }

    logger.info(
        "[日总结] 候选新闻: %s条, news_hash=%s",
        len(news_list),
        [item.get("news_hash", "")[:8] for item in news_list[:20]],
    )

    summary_news = sorted(
        news_list,
        key=lambda item: (
            item.get("importance_stars", 0),
            item.get("pub_date", ""),
        ),
        reverse=True,
    )[:20]

    # 打印 AI 入参摘要
    titles = [item.get("title", "")[:30] for item in summary_news]
    logger.info("[日总结] AI入参: %s条候选, titles=%s", len(summary_news), titles)

    if EFFECTIVE_SKIP_LLM:
        markdown = _generate_rule_based_summary(summary_news)
    else:
        payload = _build_daily_summary_payload(summary_news, analysis_date)
        messages = [
            {
                "role": "system",
                "content": (
                    "你是一位拥有20年实战经验的首席策略分析师与资深股票经纪人。"
                    "你擅长从海量碎片化新闻中提取核心叙事，并推导底层逻辑对二级市场的传导机制。"
                    "你会把输入新闻视为一个整体进行综合研判，而不是逐条复述。"
                    "你必须只输出合法 JSON，不能输出任何 JSON 之外的解释。"
                    "你必须基于输入新闻事实进行分析，不得编造输入中不存在的事实。"
                    "如果多条新闻属于同一主题，必须合并表达，避免重复。"
                ),
            },
            {
                "role": "user",
                "content": (
                    "我会为你提供一组当日最重要的候选新闻。"
                    "请将这些新闻视为一个整体进行综合研判，并返回一个唯一的、可直接存入数据库的 JSON 对象。\n\n"
                    "分析维度如下：\n"
                    "1. daily_major_events：从全部候选新闻中提炼出当天真正改变市场格局、风险偏好或交易主线的核心大事。"
                    "必须做综合归纳，不允许只是复述新闻标题。每一条都应说明今天发生了什么，以及为什么它重要。\n"
                    "2. sector_impact_map: 必须先判断这些事件对中美大盘整体的影响，再分析受到影响的板块和个股。"
                    "每一条必须以 [大盘]、[板块] 或 [个股] 开头，再写标的名和方向。"
                    "例如: [大盘] 美股大盘：偏空。原因是... / [板块] 半导体：偏多。原因是... / [个股] MU：中性。原因是...\n"
                    "3. linkage_logic_chain：这是核心部分。"
                    "请解释这些新闻如何通过一条条市场传导链影响资产价格。"
                    "每条逻辑链都必须体现\"事件 -> 中间变量 -> 市场结果\"的链式关系，"
                    "并体现流动性、利率与美债收益率、风险偏好、估值模型、盈利预期、政策预期、汇率、商品供需、通胀预期、产业链景气度等专业视角。\n\n"
                    "约束如下：\n"
                    "1. 严禁逐条列举新闻，必须是综合全部候选新闻后的整体产出。\n"
                    "2. 所有输出必须为自然中文，适合直接展示给用户阅读。\n"
                    "3. 不允许为了凑条数而重复表达、拆分同一逻辑或制造空泛结论。\n"
                    "4. daily_major_events 根据新闻密度提炼最重要的大事，通常为 2-5 条；如果有效主线不足，可以更少，但不要凑数。\n"
                    "5. sector_impact_map 必须优先覆盖中美大盘整体影响，再补充真正受到影响的重点板块。每条都必须明确方向，方向只能使用：偏多、偏空、中性。\n"
                    "6. 如果某些板块影响不明显，可以不展开，不要凑数。\n"
                    "7. linkage_logic_chain 根据当日主线输出最重要的逻辑链，通常为 2-5 条；宁可少而深，不要多而散。\n\n"
                    "请基于下面按重要性倒排的 20 条候选新闻，输出一个 JSON 对象，格式必须为：\n"
                    "{\n"
                    '  "daily_major_events": ["..."],\n'
                    '  "sector_impact_map": ["..."],\n'
                    '  "linkage_logic_chain": ["..."]\n'
                    "}\n\n"
                    "要求：\n"
                    "1. 只输出合法 JSON，不要输出 Markdown，不要输出代码块。\n"
                    "2. daily_major_events、sector_impact_map、linkage_logic_chain 必须是字符串数组；没有内容时返回空数组。\n"
                    "3. 判断时优先依据 title + content；ai_summary 和 market_impact 仅作为辅助。\n"
                    "4. 不要输出空泛评论，必须落到具体事件、方向和影响。\n\n"
                    f"{json.dumps(payload, ensure_ascii=False)}"
                ),
            },
        ]
        llm_result = llm_client.call_chat(
            messages,
            log_label="日期级综合分析 %s" % analysis_date,
            model=LLM_SUMMARY_MODEL_ID,
            max_tokens=1400,
            timeout=LLM_SUMMARY_TIMEOUT,
        )
        # 打印 AI 出参摘要
        logger.info("[日总结] AI出参(前300字): %s", llm_result.response_text[:300])
        markdown = llm_result.response_text if llm_result.success else _generate_rule_based_summary(summary_news)

    parsed = _parse_summary_output(markdown)
    return {
        "analysis_date": analysis_date,
        "analysis_scope": "daily_summary",
        "batch_no": 0,
        "daily_major_events": "\n".join(parsed["daily_major_events"]),
        "sector_impact_map": "\n".join(parsed["sector_impact_map"]),
        "linkage_logic_chain": "\n".join(parsed["linkage_logic_chain"]),
        "source_news_ids": json.dumps(
            [int(item["id"]) for item in summary_news if item.get("id") is not None],
            ensure_ascii=False,
        ),
        "raw_summary": _format_summary_markdown(parsed),
    }


def _normalize_loaded_news_item(item: Dict[str, Any]) -> Dict[str, Any]:
    normalized = dict(item)
    related_symbols = normalized.get("related_symbols", [])
    if isinstance(related_symbols, str):
        try:
            related_symbols = json.loads(related_symbols)
        except json.JSONDecodeError:
            related_symbols = [symbol.strip() for symbol in related_symbols.split(",") if symbol.strip()]
    normalized["related_symbols"] = related_symbols if isinstance(related_symbols, list) else []
    normalized["importance_stars"] = _normalize_importance_stars(normalized.get("importance_stars"), 0)
    normalized["is_relevant_to_review"] = int(normalized.get("is_relevant_to_review") or 0)
    raw_rule_passed = normalized.get("rule_passed")
    has_structured_enrichment = bool(
        normalized.get("ai_summary")
        or normalized.get("market_impact")
        or normalized.get("type") in {"macro", "market", "symbol"}
    )
    # 历史数据可能缺少 rule_passed 字段，通过 LLM 结构化字段反推，避免将旧数据误排除在汇总之外
    if raw_rule_passed is None and normalized["importance_stars"] >= 3 and has_structured_enrichment:
        normalized["rule_passed"] = 1
    else:
        normalized["rule_passed"] = int(raw_rule_passed or 0)
    return normalized


def _summary_dedup_key(item: Dict[str, Any]) -> str:
    return "|".join([
        item.get("news_hash", ""),
        item.get("pub_date", "")[:19],
        item.get("source", ""),
        item.get("title", "")[:120],
    ])


def load_news_for_summary(
    analysis_date: str,
    use_remote: bool,
    fallback_news: List[Dict[str, Any]] | None = None,
) -> List[Dict[str, Any]]:
    """从数据库（或远程）加载分析窗口内的高质量新闻，供日期级综合分析使用"""
    start_time, end_time = get_analysis_window(analysis_date)
    data_source = "remote" if use_remote else "local"
    if use_remote:
        items = fetch_remote_news(start_time[:10], end_time[:10], limit=200)
    else:
        items = get_news_by_date_range(
            datetime.strptime(start_time, "%Y-%m-%d %H:%M:%S"),
            datetime.strptime(end_time, "%Y-%m-%d %H:%M:%S"),
        )

    # 将本次新采集的新闻并入，确保入库前即可参与当日汇总（尤其在首次运行时库内为空）
    db_count = len(items)
    fallback_count = len(fallback_news) if fallback_news else 0
    if fallback_news:
        items.extend(fallback_news)

    # 以复合 key 去重后过滤：只保留经 LLM 处理且重要性 >=3 星的新闻参与汇总
    deduped: Dict[str, Dict[str, Any]] = {}
    for item in items:
        normalized = _normalize_loaded_news_item(item)
        deduped[_summary_dedup_key(normalized)] = normalized

    logger.info(
        "[日总结] analysis_date=%s, 窗口=[%s ~ %s], 数据源=%s, 加载 %s条(db %s+回退 %s), 去重 %s条",
        analysis_date, start_time, end_time, data_source, len(items), db_count, fallback_count, len(deduped),
    )

    filtered = [
        item for item in deduped.values()
        if item.get("importance_stars", 0) >= 3
        and item.get("rule_passed")
        and item.get("processing_status") in {"llm_processed", "reviewed"}
        and start_time <= item.get("pub_date", "") <= end_time
    ]
    # 打印候选和未入选的新闻 ID
    candidate_ids = [item.get("id") for item in filtered if item.get("id")]
    excluded_items = [item for item in deduped.values() if item not in filtered]
    excluded_ids = [item.get("id") for item in excluded_items if item.get("id")]
    logger.info(
        "[日总结] 过滤(stars>=3, rule_passed, status∈{llm_processed,reviewed}): 候选 %s条 ids=%s, 排除 %s条 ids=%s",
        len(filtered), candidate_ids, len(excluded_items), excluded_ids,
    )
    if not filtered and fallback_news:
        fallback_filtered = []
        for item in fallback_news:
            normalized = _normalize_loaded_news_item(item)
            if (
                normalized.get("importance_stars", 0) >= 3
                and normalized.get("rule_passed")
                and normalized.get("processing_status") in {"llm_processed", "reviewed"}
                and start_time <= normalized.get("pub_date", "") <= end_time
            ):
                fallback_filtered.append(normalized)
        filtered = fallback_filtered
        logger.info(
            "日期级 summary 窗口为空，回退使用当前批次窗口内有效新闻 %s 条 (analysis_date=%s)",
            len(filtered),
            analysis_date,
        )
    logger.info("日期级 summary 候选新闻: %s 条 (analysis_date=%s)", len(filtered), analysis_date)
    return sorted(filtered, key=lambda item: item.get("pub_date", ""), reverse=True)


def _attach_remote_news_ids(items: List[Dict[str, Any]], result: Dict[str, Any] | None) -> None:
    """将 Cloudflare D1 写入后返回的 id_map 回填到新闻列表中。

    日期级汇总的 source_news_ids 字段依赖这些 id，因此必须在写入后立即回填。
    """
    if not items or not result:
        return
    id_map = result.get("id_map") or {}
    if not isinstance(id_map, dict):
        return
    for item in items:
        news_hash = item.get("news_hash")
        if news_hash in id_map:
            try:
                item["id"] = int(id_map[news_hash])
            except (TypeError, ValueError):
                continue


def collect_all_news(context: ExecutionContext | None = None) -> Dict[str, Any]:
    """采集新闻 -> Stage 1 关键词规则 -> Stage 2 Embedding -> Stage 3 LLM 深度分析

    三级漏斗架构，每个阶段的决策详情记录到 filter_log。
    """
    import uuid
    from embedding_filter import filter_news_by_embedding, generate_profile_embeddings

    context = context or build_execution_context()
    all_news: List[Dict[str, Any]] = []
    analysis_date = get_latest_closed_trading_day(context)
    run_id = str(uuid.uuid4())

    # --- 初始化 trace ---
    from datetime import datetime as dt
    from zoneinfo import ZoneInfo as ZI
    now_bj = dt.now(ZI("Asia/Shanghai")).strftime("%Y-%m-%d %H:%M:%S")
    trace = {
        "run_id": run_id,
        "run_date": analysis_date,
        "started_at": now_bj,
        "status": "running",
        "total_fetched": 0, "total_deduped": 0,
        "rule_passed": 0, "rule_filtered": 0,
        "embedding_input": 0, "embedding_passed": 0, "embedding_filtered": 0,
        "llm_input": 0, "llm_kept": 0, "llm_discarded": 0, "final_count": 0,
        "fetch_duration": 0, "rule_duration": 0, "embedding_duration": 0, "llm_duration": 0,
        "active_strategy": RULE_ACTIVE_STRATEGY,
        "star_fallback_triggered": 0,
        "error_message": "",
    }
    filter_logs: List[Dict[str, Any]] = []

    logger.info("========== 新闻采集 v6.0 启动 (run_id=%s) ==========", run_id[:8])
    logger.info(
        "分析日: %s | LLM: rules=%s, batch=%s, summary=%s",
        analysis_date, LLM_RULES_MODEL_ID, LLM_BATCH_MODEL_ID, LLM_SUMMARY_MODEL_ID,
    )
    logger.info(
        "超时: rules=%ss, batch=%ss, summary=%ss | 并发=%s | 批量=%s | 策略=%s | SKIP_LLM=%s",
        LLM_RULES_TIMEOUT, LLM_BATCH_TIMEOUT, LLM_SUMMARY_TIMEOUT,
        LLM_MAX_WORKERS, LLM_BATCH_SIZE, RULE_ACTIVE_STRATEGY, EFFECTIVE_SKIP_LLM,
    )
    logger.info("==========================================")

    try:
        # --- 采集阶段 ---
        t0 = time.time()
        all_news.extend(fetch_source_news(context))
        unique_news = merge_and_deduplicate(all_news)
        trace["fetch_duration"] = round(time.time() - t0, 2)
        trace["total_fetched"] = len(all_news)
        trace["total_deduped"] = len(unique_news)
        logger.info("[采集] 完成: %s条 (去重后 %s条), 耗时 %.1fs", len(all_news), len(unique_news), trace["fetch_duration"])

        # --- Stage 1: 关键词软加分（不过滤，全量进入 Stage 2）---
        t0 = time.time()
        screening_profile = _get_screening_profile()
        scored_news = score_news_by_rules(unique_news, screening_profile)
        trace["rule_duration"] = round(time.time() - t0, 2)
        trace["rule_passed"] = len(scored_news)  # 全量
        trace["rule_filtered"] = 0
        logger.info("[Stage 1] 软加分: %s条全部进入 Stage 2, 耗时 %.1fs", len(scored_news), trace["rule_duration"])

        # 构建 filter_log: 所有新闻（软加分模式下全量）
        for news in scored_news:
            scoring = news.get("_scoring", {})
            log_entry = {
                "run_id": run_id,
                "news_hash": news.get("news_hash", ""),
                "strategy_a_score": scoring.get("strategy_a_score"),
                "strategy_b_score": scoring.get("strategy_b_score"),
                "strategy_c_score": scoring.get("strategy_c_score"),
                "active_strategy": scoring.get("active_strategy", RULE_ACTIVE_STRATEGY),
                "rule_threshold": scoring.get("rule_threshold"),
                "macro_hits": json.dumps(scoring.get("macro_hits", []), ensure_ascii=False),
                "market_hits": json.dumps(scoring.get("market_hits", []), ensure_ascii=False),
                "noise_hits": json.dumps(scoring.get("noise_hits", []), ensure_ascii=False),
                "symbol_hits": json.dumps(scoring.get("symbol_hits", []), ensure_ascii=False),
                "focus_hits": json.dumps(scoring.get("focus_hits", []), ensure_ascii=False),
                "rule_score": scoring.get("rule_score", 0),
                "rule_decision": "pass",
                "rule_reason": news.get("rule_reason", ""),
                "final_decision": None,
            }
            filter_logs.append(log_entry)

        # filter_log 按 news_hash 索引方便后续更新
        log_by_hash = {log["news_hash"]: log for log in filter_logs}

        # --- Stage 2: Embedding 语义过滤（综合 rule_score 加分）---
        t0 = time.time()
        embedding_input = scored_news
        trace["embedding_input"] = len(embedding_input)

        profile_embeddings = generate_profile_embeddings()
        if profile_embeddings:
            embedding_passed, embedding_filtered = filter_news_by_embedding(embedding_input, profile_embeddings)
        else:
            logger.warning("[Stage 2] Profile 向量生成失败，跳过 Embedding 阶段")
            embedding_passed = embedding_input
            embedding_filtered = []
            for news in embedding_input:
                news["_embedding"] = {"similarity": None, "matched_symbol": None, "decision": "skipped"}

        trace["embedding_duration"] = round(time.time() - t0, 2)
        trace["embedding_passed"] = len(embedding_passed)
        trace["embedding_filtered"] = len(embedding_filtered)
        logger.info("[Stage 2] Embedding: 保留 %s/%s条, 耗时 %.1fs", len(embedding_passed), len(embedding_input), trace["embedding_duration"])

        # 更新 filter_log: Embedding 阶段
        for news in embedding_passed + embedding_filtered:
            emb = news.get("_embedding", {})
            log_entry = log_by_hash.get(news.get("news_hash"))
            if log_entry:
                log_entry["embedding_similarity"] = emb.get("similarity")
                log_entry["embedding_matched_symbol"] = emb.get("matched_symbol")
                log_entry["embedding_decision"] = emb.get("decision", "skipped")
                if emb.get("decision") == "filter":
                    log_entry["final_decision"] = "embedding_filtered"

        # 被 Embedding 过滤的新闻标记
        rejected_news = []
        for news in embedding_filtered:
            news["processing_status"] = "embedding_filtered"
        rejected_news.extend(embedding_filtered)
        # Stage 1 不再产生 rejected，rejected 仅来自 Embedding + LLM

        # --- Stage 3: LLM 深度分析 ---
        t0 = time.time()
        llm_input = embedding_passed
        trace["llm_input"] = len(llm_input)
        processed_news, final_news, batch_analysis_records = enhance_news_with_llm(llm_input, analysis_date)
        trace["llm_duration"] = round(time.time() - t0, 2)
        trace["llm_kept"] = len(final_news)
        trace["llm_discarded"] = len(processed_news) - len(final_news)
        trace["final_count"] = len(final_news)

        # 检查是否触发了打星兜底
        star_fallback = any(rec.get("star_fallback_triggered") for rec in batch_analysis_records)
        trace["star_fallback_triggered"] = 1 if star_fallback else 0

        logger.info("[Stage 3] LLM: 保留 %s/%s条, 耗时 %.1fs", len(final_news), len(llm_input), trace["llm_duration"])

        # 更新 filter_log: LLM 阶段
        for news in processed_news:
            log_entry = log_by_hash.get(news.get("news_hash"))
            if log_entry:
                log_entry["llm_keep"] = 1 if news.get("processing_status") == "llm_processed" else 0
                log_entry["llm_stars"] = news.get("importance_stars")
                log_entry["llm_type"] = news.get("type")
                log_entry["llm_summary"] = news.get("ai_summary", "")
                log_entry["llm_cot_reasoning"] = news.get("cot_reasoning", "")
                log_entry["llm_raw_response"] = ""  # batch 级别的 raw 在 batch_record 中
                if news.get("processing_status") == "llm_discarded":
                    log_entry["final_decision"] = "llm_discarded"
                elif news.get("processing_status") == "llm_processed":
                    log_entry["final_decision"] = "kept"

        trace["status"] = "completed"
        trace["finished_at"] = dt.now(ZI("Asia/Shanghai")).strftime("%Y-%m-%d %H:%M:%S")
        total_start = dt.strptime(trace["started_at"], "%Y-%m-%d %H:%M:%S")
        total_end = dt.strptime(trace["finished_at"], "%Y-%m-%d %H:%M:%S")
        trace["total_duration"] = round((total_end - total_start).total_seconds(), 2)

        # 配置快照
        trace["config_snapshot"] = json.dumps({
            "LLM_BATCH_SIZE": LLM_BATCH_SIZE,
            "LLM_MAX_WORKERS": LLM_MAX_WORKERS,
            "LLM_BATCH_MODEL_ID": LLM_BATCH_MODEL_ID,
            "LLM_RULES_MODEL_ID": LLM_RULES_MODEL_ID,
            "RULE_ACTIVE_STRATEGY": RULE_ACTIVE_STRATEGY,
            "EMBEDDING_SIMILARITY_THRESHOLD": float(os.getenv("EMBEDDING_SIMILARITY_THRESHOLD", "0.3")),
            "score_threshold": screening_profile.get("score_threshold"),
        }, ensure_ascii=False)

        # 动态关键词快照
        trace["dynamic_keywords"] = json.dumps({
            "macro_keywords": screening_profile.get("macro_keywords", []),
            "market_keywords": screening_profile.get("market_keywords", []),
            "noise_keywords": screening_profile.get("noise_keywords", []),
            "focus_topics": [],
        }, ensure_ascii=False)

    except Exception as exc:
        trace["status"] = "failed"
        trace["error_message"] = str(exc)[:500]
        from datetime import datetime as dt2
        from zoneinfo import ZoneInfo as ZI2
        trace["finished_at"] = dt2.now(ZI2("Asia/Shanghai")).strftime("%Y-%m-%d %H:%M:%S")
        raise
    finally:
        logger.info(
            "[Trace] run_id=%s status=%s | 采集=%s→去重=%s→规则=%s→Embedding=%s→LLM=%s→最终=%s | 耗时=%.1fs",
            run_id[:8], trace["status"],
            trace["total_fetched"], trace["total_deduped"], trace["rule_passed"],
            trace["embedding_passed"], trace["llm_kept"], trace["final_count"],
            trace.get("total_duration", 0),
        )

    return {
        "analysis_date": analysis_date,
        "screening_profile": screening_profile,
        "screened_news": scored_news,
        "rejected_news": rejected_news,
        "processed_news": processed_news,
        "final_news": final_news,
        "batch_analysis_records": batch_analysis_records,
        "pipeline_trace": trace,
        "filter_logs": filter_logs,
    }



def run_news_pipeline(
    collect_fresh_news: bool = True,
    persist_summary: bool = True,
    context: ExecutionContext | None = None,
) -> Dict[str, Any]:
    """运行新闻流程。

    collect_fresh_news=False 适合小时任务之外的收盘汇总任务，只对现有库内新闻做日期级汇总。
    persist_summary=False 适合小时任务，只入新闻库，不写 daily_news_ai_analysis。
    """
    context = context or build_execution_context()
    analysis_date = get_latest_closed_trading_day(context)
    batch_analysis_records: List[Dict[str, Any]] = []
    news_list: List[Dict[str, Any]] = []
    processed_news: List[Dict[str, Any]] = []
    screened_news: List[Dict[str, Any]] = []
    rejected_news: List[Dict[str, Any]] = []

    pipeline_trace = None
    filter_logs_data = []

    if collect_fresh_news:
        collected = collect_all_news(context)
        news_list = collected["final_news"]
        processed_news = collected["processed_news"]
        screened_news = collected["screened_news"]
        rejected_news = collected.get("rejected_news", [])
        analysis_date = collected["analysis_date"]
        batch_analysis_records = collected["batch_analysis_records"]
        pipeline_trace = collected.get("pipeline_trace")
        filter_logs_data = collected.get("filter_logs", [])

    use_remote = ENABLE_REMOTE_WRITE and is_remote_write_configured()

    inserted_count = 0
    updated_count = 0
    if collect_fresh_news:
        t0 = time.time()
        if use_remote:
            screened_result = send_news(screened_news) if screened_news else {"inserted": 0, "updated": 0, "ignored": 0}
            processed_result = send_news(processed_news) if processed_news else {"inserted": 0, "updated": 0, "ignored": 0}
            _attach_remote_news_ids(screened_news, screened_result)
            _attach_remote_news_ids(processed_news, processed_result)
            _attach_remote_news_ids(news_list, processed_result)
            inserted_count = screened_result.get('inserted', 0) + processed_result.get('inserted', 0)
            updated_count = screened_result.get('updated', 0) + processed_result.get('updated', 0)
        elif context.is_local_env:
            init_database()
            screened_stats = upsert_news_batch(screened_news)
            processed_stats = upsert_news_batch(processed_news)
            inserted_count = screened_stats["inserted"] + processed_stats["inserted"]
            updated_count = screened_stats["updated"] + processed_stats["updated"]
        else:
            logger.warning("[写入D1] 新闻写入被跳过: use_remote=%s, app_env=%s", use_remote, context.app_env)
        logger.info("[写入D1] 完成: 新增 %s, 更新 %s, 耗时 %.1fs", inserted_count, updated_count, time.time() - t0)

    # --- 写入 pipeline_trace 和 filter_logs ---
    if collect_fresh_news and use_remote and pipeline_trace:
        try:
            send_pipeline_trace(pipeline_trace)
        except Exception as exc:
            logger.warning("[Trace] pipeline_trace 写入失败（不影响主流程）: %s", exc)
        if filter_logs_data:
            try:
                send_filter_logs(filter_logs_data)
            except Exception as exc:
                logger.warning("[Trace] filter_logs 写入失败（不影响主流程）: %s", exc)

    # 被过滤新闻写本地 SQLite（仅用于复盘，不推送 remote）
    if collect_fresh_news and context.is_local_env and rejected_news:
        try:
            init_database()
            rejected_stats = upsert_news_batch(rejected_news, LOCAL_DB_PATH)
            logger.info("[复盘库] 被过滤新闻写入本地: 新增 %s, 已存在 %s", rejected_stats["inserted"], rejected_stats.get("ignored", 0) + rejected_stats.get("updated", 0))
        except Exception as exc:
            logger.warning("[复盘库] 被过滤新闻写入失败（不影响主流程）: %s", exc)

    window_news = load_news_for_summary(analysis_date, use_remote, fallback_news=news_list)
    daily_record: Dict[str, Any] = {}
    if persist_summary and window_news:
        t0 = time.time()
        daily_record = build_daily_summary_record(window_news, analysis_date)
        if use_remote:
            send_daily_news_ai_analysis(daily_record)
        elif context.is_local_env:
            save_daily_news_ai_analysis(daily_record)
        else:
            logger.warning("[日总结] 汇总未写入: use_remote=%s, app_env=%s", use_remote, context.app_env)
        logger.info("[日总结] 完成: 已更新, 耗时 %.1fs", time.time() - t0)
    elif persist_summary:
        logger.info("[日总结] 跳过: 交易日 %s 窗口内暂无有效新闻", analysis_date)
        if context.is_local_env:
            daily_record = get_daily_news_ai_analysis_by_date(analysis_date) or {}

    if persist_summary:
        if use_remote:
            initialize_remote_review(analysis_date)
        elif context.is_local_env:
            initialize_archive_record(analysis_date)
        else:
            logger.warning("[复盘] 复盘记录初始化被跳过: use_remote=%s, app_env=%s", use_remote, context.app_env)
        logger.info("复盘记录已初始化: %s", analysis_date)

    if not news_list:
        news_list = window_news
    summary_text = daily_record.get("raw_summary") or _generate_rule_based_summary(news_list[:10])

    # LLM 调用汇总
    llm_client.log_summary()

    return {
        "filepath": None,
        "news_count": len(news_list),
        "inserted_count": inserted_count,
        "summary": summary_text,
        "analysis_date": analysis_date,
        "batch_count": len(batch_analysis_records),
        "screened_count": len(screened_news),
        "processed_count": len(processed_news),
        "persisted_summary": persist_summary,
    }


def main():
    """主函数"""
    try:
        result = run_news_pipeline()
        logger.info(
            "新闻采集完成: 总数 %s条, 新增 %s条, 批次 %s, 分析日 %s",
            result["news_count"], result["inserted_count"],
            result["batch_count"], result["analysis_date"],
        )
        return 0
    except CloudflareIngestError as exc:
        logger.error("[写入D1] Cloudflare写入失败: %s", exc, exc_info=True)
        return 1
    except Exception as exc:
        logger.error("执行失败: %s", exc, exc_info=True)
        return 1


if __name__ == "__main__":
    import sys
    sys.exit(main())
