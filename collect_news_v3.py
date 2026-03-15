"""
新闻采集脚本 v3.0
整合: 新浪财经、财联社、金十数据、Yahoo财经美股首页
优化: LLM超时处理、重试机制、降级策略、数据库存储
注意: 新闻数据持续积累不做删除，复盘时根据时间范围查询
"""
import json
import re
import os
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Dict, List, Tuple
import yfinance as yf
import pandas as pd
import pandas_market_calendars as mcal
import pytz
import requests

from config import (
    OUTPUT_DIR,
    LLM_API_KEY, LLM_BASE_URL, LLM_BATCH_MODEL_ID, LLM_MODEL_ID, LLM_RULES_MODEL_ID, LLM_SUMMARY_MODEL_ID,
    ENABLE_REMOTE_WRITE, USE_DEMO_DATA,
)
from cloudflare_ingest import (
    CloudflareIngestError,
    fetch_news as fetch_remote_news,
    initialize_review as initialize_remote_review,
    is_remote_write_configured,
    send_news,
    send_news_analysis,
)
from logger_utils import get_logger
from db_utils import (
    generate_news_hash,
    get_news_analysis_by_date,
    get_news_by_date_range,
    initialize_archive_record,
    init_database,
    save_news_analysis,
    upsert_news_batch,
)
from demo_data import build_demo_news_feed
from llm_client import LLMClient

logger = get_logger("collect_news_v3")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
}

# ========== 可配置参数 ==========
LLM_TIMEOUT = int(os.getenv("LLM_TIMEOUT", "120"))  # LLM 超时时间(秒)
LLM_RULES_TIMEOUT = int(os.getenv("LLM_RULES_TIMEOUT", str(LLM_TIMEOUT)))
LLM_BATCH_TIMEOUT = int(os.getenv("LLM_BATCH_TIMEOUT", str(LLM_TIMEOUT)))
LLM_SUMMARY_TIMEOUT = int(os.getenv("LLM_SUMMARY_TIMEOUT", str(LLM_TIMEOUT)))
LLM_MAX_RETRIES = int(os.getenv("LLM_MAX_RETRIES", "2"))  # 最大重试次数
LLM_MAX_WORKERS = int(os.getenv("LLM_MAX_WORKERS", "2"))  # 并发数降低，避免超时
LLM_BATCH_SIZE = max(1, int(os.getenv("LLM_BATCH_SIZE", "6")))
LLM_CANDIDATE_LIMIT = max(1, int(os.getenv("LLM_CANDIDATE_LIMIT", "6")))
LLM_RULES_SAMPLE_SIZE = max(8, int(os.getenv("LLM_RULES_SAMPLE_SIZE", "12")))
SKIP_LLM = os.getenv("SKIP_LLM", "false").lower() == "true"  # 跳过 LLM 分析开关
EFFECTIVE_SKIP_LLM = SKIP_LLM or USE_DEMO_DATA

llm_client = LLMClient(
    api_key=LLM_API_KEY,
    base_url=LLM_BASE_URL,
    default_model=LLM_MODEL_ID,
    timeout=LLM_TIMEOUT,
    max_retries=LLM_MAX_RETRIES,
    logger=logger,
)


# ========== 数据源1: 新浪财经 ==========
def fetch_sina_finance() -> list:
    """抓取新浪财经快讯（不筛选时间，全部采集）"""
    url = "https://feed.sina.com.cn/api/roll/get"
    params = {
        'pageid': '153',
        'lid': '2509',
        'k': '',
        'num': 50,
        'page': 1,
    }
    try:
        logger.info("正在抓取新浪财经...")
        resp = requests.get(url, headers=HEADERS, params=params, timeout=15)
        resp.raise_for_status()

        data = resp.json()
        result = data.get('result', {}).get('data', [])

        news_list = []
        for item in result:
            timestamp = item.get('ctime', 0)
            if isinstance(timestamp, str):
                timestamp = int(timestamp)
            pub_time = datetime.fromtimestamp(timestamp)

            news_list.append({
                'time': pub_time.strftime('%Y-%m-%d %H:%M:%S'),
                'title': item.get('title', ''),
                'content': item.get('intro', '') or item.get('title', ''),
                'url': item.get('url', ''),
                'source': 'sina',
            })

        logger.info(f"新浪财经: {len(news_list)} 条")
        return news_list

    except Exception as e:
        logger.error(f"新浪财经失败: {str(e)}")
        return []


# ========== 数据源2: 财联社 ==========
def fetch_cls_cn() -> list:
    """抓取财联社电报（不筛选时间，全部采集）"""
    url = "https://www.cls.cn/telegraph"
    try:
        logger.info("正在抓取财联社...")
        resp = requests.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()

        pattern = r'<script[^>]*type="application/json"[^>]*>(.+?)</script>'
        match = re.search(pattern, resp.text, re.DOTALL)

        if not match:
            return []

        data = json.loads(match.group(1))
        telegraph_list = data.get('props', {}).get('initialState', {}).get('telegraph', {}).get('telegraphList', [])

        news_list = []
        for item in telegraph_list:
            pub_time = datetime.fromtimestamp(item.get('ctime', 0)) if item.get('ctime') else None

            news_list.append({
                'time': pub_time.strftime('%Y-%m-%d %H:%M:%S') if pub_time else '',
                'title': item.get('title', ''),
                'content': item.get('content', '')[:500],
                'source': 'cls_cn',
            })

        logger.info(f"财联社: {len(news_list)} 条")
        return news_list

    except Exception as e:
        logger.error(f"财联社失败: {str(e)}")
        return []


# ========== 数据源3: 金十数据 ==========
def fetch_jin10() -> list:
    """抓取金十数据快讯（不筛选时间，全部采集）"""
    from bs4 import BeautifulSoup

    url = "https://www.jin10.com/"
    try:
        logger.info("正在抓取金十数据...")
        resp = requests.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        resp.encoding = 'utf-8'

        soup = BeautifulSoup(resp.text, 'html.parser')
        flash_items = soup.find_all(id=lambda x: x and x.startswith('flash'))

        news_list = []
        for item in flash_items:
            try:
                # 提取时间
                time_elem = item.select_one('.jin-flash_time, [class*="time"]')
                pub_time_str = time_elem.get_text(strip=True) if time_elem else ''

                # 解析时间 (格式 HH:MM:SS，需要加上日期)
                pub_time = None
                if pub_time_str and len(pub_time_str) == 8:
                    today = datetime.now()
                    pub_time = datetime.strptime(f"{today.strftime('%Y-%m-%d')} {pub_time_str}", '%Y-%m-%d %H:%M:%S')

                # 提取内容
                text = item.get_text(strip=True)
                content_elem = item.select_one('.jin-flash_content, [class*="content"]')
                content = content_elem.get_text(strip=True) if content_elem else text.replace(pub_time_str, '').strip()
                content = content.replace('分享收藏详情复制', '').strip()

                is_vip = bool(item.select_one('.vip, [class*="vip"], .lock')) or 'VIP' in text

                if content and len(content) > 10:
                    news_list.append({
                        'time': pub_time.strftime('%Y-%m-%d %H:%M:%S') if pub_time else pub_time_str,
                        'title': '',
                        'content': content[:500],
                        'source': 'jin10',
                        'is_vip': is_vip,
                    })
            except:
                continue

        # 去重
        seen = set()
        unique_list = []
        for item in news_list:
            key = item['content'][:50]
            if key not in seen:
                seen.add(key)
                unique_list.append(item)

        logger.info(f"金十数据: {len(unique_list)} 条")
        return unique_list

    except Exception as e:
        logger.error(f"金十数据失败: {str(e)}")
        return []


# ========== 数据源4: Yahoo财经美股首页 ==========
def fetch_yahoo_finance_news() -> list:
    """抓取Yahoo财经美股首页新闻（不筛选时间，全部采集）"""
    url = "https://finance.yahoo.com/"
    try:
        logger.info("正在抓取Yahoo财经...")
        resp = requests.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()

        soup = __import__('bs4').BeautifulSoup(resp.text, 'html.parser')

        news_list = []

        # 方法1: 查找新闻链接
        news_links = soup.select('a[href*="/news/"], a[href*="news.yahoo.com"]')

        for link in news_links[:30]:
            title = link.get_text(strip=True)
            href = link.get('href', '')

            if title and len(title) > 10 and 'news' in href.lower():
                news_list.append({
                    'time': '',
                    'title': title,
                    'content': title,
                    'url': href if href.startswith('http') else f"https://finance.yahoo.com{href}",
                    'source': 'yahoo_finance',
                })

        # 方法2: 使用 yfinance 获取新闻
        try:
            sp500 = yf.Ticker('^GSPC')
            yahoo_news = sp500.news

            if yahoo_news:
                for item in yahoo_news[:20]:
                    content = item.get('content', {})
                    title = content.get('title', '')
                    pub_date = content.get('pubDate', '')

                    # 解析时间
                    pub_time = None
                    if pub_date:
                        try:
                            pub_time = datetime.fromisoformat(pub_date.replace('Z', '+00:00')).replace(tzinfo=None)
                        except:
                            pass

                    if title:
                        news_list.append({
                            'time': pub_time.strftime('%Y-%m-%d %H:%M:%S') if pub_time else pub_date,
                            'title': title,
                            'content': content.get('summary', title)[:500],
                            'url': content.get('canonicalUrl', {}).get('url', ''),
                            'source': 'yahoo_finance',
                        })
        except Exception as e:
            logger.warning(f"Yahoo yfinance 获取失败: {str(e)}")

        # 去重
        seen = set()
        unique_list = []
        for item in news_list:
            key = item.get('title', '')[:50]
            if key and key not in seen:
                seen.add(key)
                unique_list.append(item)

        logger.info(f"Yahoo财经: {len(unique_list)} 条")
        return unique_list

    except Exception as e:
        logger.error(f"Yahoo财经失败: {str(e)}")
        return []


TRACKED_SYMBOLS = [
    {"symbol": "MU", "aliases": ["MU", "Micron", "Micron Technology", "美光"]},
    {"symbol": "LITE", "aliases": ["LITE", "Lumentum", "Lumentum Holdings"]},
    {"symbol": "MSFT", "aliases": ["MSFT", "Microsoft", "微软"]},
    {"symbol": "GOOGL", "aliases": ["GOOGL", "Google", "Alphabet", "谷歌"]},
    {"symbol": "^VIX", "aliases": ["VIX", "Volatility Index", "恐慌指数"]},
    {"symbol": "^HSI", "aliases": ["HSI", "Hang Seng", "恒指", "恒生指数"]},
    {"symbol": "^GSPC", "aliases": ["S&P 500", "SP500", "标普500", "标普"]},
    {"symbol": "000001.SS", "aliases": ["SSE Composite", "上证指数", "沪指"]},
    {"symbol": "DX-Y.NYB", "aliases": ["Dollar Index", "DXY", "美元指数"]},
    {"symbol": "GC=F", "aliases": ["Gold", "黄金", "金价"]},
]
EQUITY_TRACKED_SYMBOLS = {"MU", "LITE", "MSFT", "GOOGL"}
MARKET_REFERENCE_SYMBOLS = {"^VIX", "^HSI", "^GSPC", "000001.SS", "DX-Y.NYB", "GC=F"}

BASE_MACRO_KEYWORDS = [
    "美联储", "fed", "利率", "降息", "加息", "通胀", "cpi", "ppi", "非农", "就业",
    "关税", "制裁", "贸易", "财政刺激", "流动性", "衰退", "债务上限",
    "战争", "冲突", "霍尔木兹", "中东", "俄乌", "伊朗", "以色列", "原油", "油价",
]
BASE_MARKET_KEYWORDS = [
    "标普", "纳指", "道指", "s&p", "nasdaq", "dow",
    "财报", "盈利", "业绩", "回购", "分红", "ipo", "并购", "收购", "监管",
    "芯片", "半导体", "ai", "人工智能", "nvidia", "英伟达", "微软", "谷歌",
]
BASE_NOISE_KEYWORDS = [
    "分析师", "评级", "目标价", "看涨", "看跌", "买入评级", "卖出评级",
    "技术面", "盘前异动", "盘后异动", "短线", "传闻",
]
BASE_SYMBOL_CONTEXT_KEYWORDS = [
    "财报", "指引", "监管", "诉讼", "产品", "合作", "订单", "收购", "回购", "盈利",
]


def merge_and_deduplicate(all_news: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """按标题、内容和时间做跨源去重"""
    seen = set()
    unique_list = []

    for news in all_news:
        title = (news.get('title') or '').strip()
        content = (news.get('content') or '').strip()
        pub_date = (news.get('time') or news.get('pub_date') or '').strip()
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
    normalized = text.lower()
    matched = []
    for entry in TRACKED_SYMBOLS:
        if any(alias.lower() in normalized for alias in entry["aliases"]):
            matched.append(entry["symbol"])
    return matched


def _score_keyword_hits(text: str, keywords: List[str]) -> List[str]:
    return sorted({keyword for keyword in keywords if keyword.lower() in text})


def _score_to_importance(score: float) -> str:
    if score >= 6:
        return "high"
    if score >= 3:
        return "medium"
    return "low"


def _score_to_stars(score: float) -> int:
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
        "macro_keywords": BASE_MACRO_KEYWORDS,
        "market_keywords": BASE_MARKET_KEYWORDS,
        "noise_keywords": BASE_NOISE_KEYWORDS,
        "symbol_context_keywords": BASE_SYMBOL_CONTEXT_KEYWORDS,
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
    profile = _default_screening_profile()
    if not isinstance(raw_profile, dict):
        return profile

    profile["macro_keywords"] = _normalize_keyword_list(raw_profile.get("macro_keywords"), profile["macro_keywords"])
    profile["market_keywords"] = _normalize_keyword_list(raw_profile.get("market_keywords"), profile["market_keywords"])
    profile["noise_keywords"] = _normalize_keyword_list(raw_profile.get("noise_keywords"), profile["noise_keywords"])
    profile["symbol_context_keywords"] = _normalize_keyword_list(
        raw_profile.get("symbol_context_keywords"),
        profile["symbol_context_keywords"],
    )
    profile["focus_topics"] = _normalize_focus_topics(raw_profile.get("focus_topics"))
    profile["include_rules"] = _normalize_keyword_list(raw_profile.get("include_rules"), profile["include_rules"])
    profile["exclude_rules"] = _normalize_keyword_list(raw_profile.get("exclude_rules"), profile["exclude_rules"])
    profile["score_threshold"] = float(raw_profile.get("score_threshold") or profile["score_threshold"])
    profile["reasoning_summary"] = _normalize_text(raw_profile.get("reasoning_summary") or profile["reasoning_summary"])
    return profile


def generate_dynamic_screening_profile(news_list: List[Dict[str, Any]], analysis_date: str) -> Dict[str, Any]:
    if EFFECTIVE_SKIP_LLM:
        return _default_screening_profile()

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
                "只输出 JSON，不要输出解释。"
            ),
        },
        {
            "role": "user",
            "content": (
                "返回一个 JSON 对象，字段必须包含："
                "macro_keywords, market_keywords, noise_keywords, symbol_context_keywords, "
                "focus_topics, include_rules, exclude_rules, score_threshold, reasoning_summary。\n"
                "要求：keywords 用短词数组；focus_topics 每项含 label/keywords/weight(1-5)；"
                "noise_keywords 优先覆盖与全球经济或股市无关的主题；"
                "跟踪标的包括 MU/LITE/MSFT/GOOGL/VIX/HSI/GSPC/DXY/黄金；"
                "score_threshold 取 3.5-7.5；只输出 JSON。\n\n"
                f"{json.dumps({'analysis_date': analysis_date, 'samples': sample_items}, ensure_ascii=False)}"
            ),
        },
    ]

    llm_result = llm_client.call_chat(
        messages,
        log_label=f"动态初筛规则 {analysis_date}",
        model=LLM_RULES_MODEL_ID,
        max_tokens=1400,
        timeout=LLM_RULES_TIMEOUT,
    )
    if not llm_result.success:
        logger.warning("动态初筛规则生成失败，回退默认静态规则")
        return _default_screening_profile()

    try:
        profile = _normalize_screening_profile(_extract_json_payload(llm_result.response_text))
        logger.info(
            "动态初筛规则已生成: 宏观=%s, 市场=%s, 噪音=%s, 动态主题=%s",
            len(profile["macro_keywords"]),
            len(profile["market_keywords"]),
            len(profile["noise_keywords"]),
            len(profile["focus_topics"]),
        )
        return profile
    except Exception as exc:
        logger.warning("动态初筛规则 JSON 解析失败，回退默认静态规则: %s", exc)
        return _default_screening_profile()


def apply_rule_filter(news: Dict[str, Any], profile: Dict[str, Any]) -> Dict[str, Any] | None:
    """动态初筛，只保留真正影响宏观/大盘/标的的新闻"""
    pub_date = _normalize_text(news.get('time') or news.get('pub_date') or '')
    title = _normalize_text(news.get('title') or '')
    content = _normalize_text(news.get('content') or '')
    if not pub_date or not content:
        return None

    text = f"{title}\n{content}".lower()
    related_symbols = derive_related_symbols(f"{title}\n{content}")
    macro_hits = _score_keyword_hits(text, profile["macro_keywords"])
    market_hits = _score_keyword_hits(text, profile["market_keywords"])
    noise_hits = _score_keyword_hits(text, profile["noise_keywords"])
    symbol_context_hits = _score_keyword_hits(text, profile["symbol_context_keywords"])

    focus_hits = []
    focus_score = 0
    for topic in profile.get("focus_topics", []):
        matched = _score_keyword_hits(text, topic.get("keywords", []))
        if matched:
            focus_hits.append(f"{topic['label']}({', '.join(matched[:2])})")
            focus_score += float(topic.get("weight", 2))

    score = len(macro_hits) * 2.5 + len(market_hits) * 1.7 + len(related_symbols) * 3.5 + len(symbol_context_hits) * 1.2 + focus_score
    score -= len(noise_hits) * 2.5

    if "vip" in text:
        score -= 0.5

    threshold = float(profile.get("score_threshold", 4.5))
    keep = False
    rule_type = "market"
    reasons = []

    equity_symbols = [symbol for symbol in related_symbols if symbol in EQUITY_TRACKED_SYMBOLS]
    market_reference_symbols = [symbol for symbol in related_symbols if symbol in MARKET_REFERENCE_SYMBOLS]

    if equity_symbols:
        keep = True
        rule_type = "symbol"
        reasons.append(f"涉及跟踪标的 {', '.join(equity_symbols)}")
        if symbol_context_hits:
            reasons.append(f"标的事件命中 {', '.join(symbol_context_hits[:3])}")
    elif market_reference_symbols and (len(macro_hits) >= 1 or len(market_hits) >= 1 or focus_hits):
        keep = True
        rule_type = "macro" if len(macro_hits) >= len(market_hits) else "market"
        reasons.append(f"涉及核心市场资产 {', '.join(market_reference_symbols[:3])}")
        if macro_hits:
            reasons.append(f"宏观关键词命中 {', '.join(macro_hits[:3])}")
        if market_hits:
            reasons.append(f"市场关键词命中 {', '.join(market_hits[:3])}")
    elif focus_hits:
        keep = True
        rule_type = "macro" if len(macro_hits) >= len(market_hits) else "market"
        reasons.append(f"动态主题命中 {'；'.join(focus_hits[:2])}")
    elif len(macro_hits) >= 2 or score >= threshold:
        keep = True
        rule_type = "macro" if len(macro_hits) >= len(market_hits) else "market"
        if macro_hits:
            reasons.append(f"宏观关键词命中 {', '.join(macro_hits[:3])}")
        if market_hits:
            reasons.append(f"市场关键词命中 {', '.join(market_hits[:3])}")
    elif len(market_hits) >= 2 and not noise_hits:
        keep = True
        rule_type = "market"
        reasons.append(f"市场事件命中 {', '.join(market_hits[:3])}")

    if noise_hits and not related_symbols and len(macro_hits) < 2:
        keep = False

    if not keep:
        return None

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
        'type': rule_type,
        'rule_passed': 1,
        'rule_score': round(score, 2),
        'rule_reason': '；'.join(reasons[:3]) or "规则保留",
        'processing_status': 'rule_screened',
        'ai_summary': '',
        'market_impact': '',
        'importance_level': _score_to_importance(score),
        'importance_stars': _score_to_stars(score),
        'primary_symbol': related_symbols[0] if related_symbols else None,
        'related_symbols': related_symbols,
        'is_relevant_to_review': 1,
        'llm_batch_id': '',
        'review_archive_date': None,
        'reviewed_at': None,
    }
    cleaned['news_hash'] = generate_news_hash(cleaned['title'], cleaned['content'], cleaned['pub_date'])
    return cleaned


def filter_news_by_rules(news_list: List[Dict[str, Any]], profile: Dict[str, Any]) -> List[Dict[str, Any]]:
    filtered = []
    for news in news_list:
        kept = apply_rule_filter(news, profile)
        if kept:
            filtered.append(kept)
    filtered.sort(key=lambda item: (item.get('rule_score', 0), item.get('pub_date', '')), reverse=True)
    if len(filtered) > LLM_CANDIDATE_LIMIT:
        logger.info("规则初筛命中过多，按分数仅保留前 %s 条进入 LLM / 正式新闻库", LLM_CANDIDATE_LIMIT)
        filtered = filtered[:LLM_CANDIDATE_LIMIT]
    logger.info("规则初筛后保留 %s / %s 条新闻", len(filtered), len(news_list))
    return filtered


def _extract_json_payload(raw_text: str) -> Any:
    """从 LLM 输出中提取 JSON 载荷"""
    content = (raw_text or '').strip()
    if not content:
        raise ValueError("empty content")

    fenced_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", content)
    if fenced_match:
        content = fenced_match.group(1).strip()

    start = min([pos for pos in [content.find('{'), content.find('[')] if pos != -1], default=-1)
    end = max(content.rfind('}'), content.rfind(']'))
    if start != -1 and end != -1 and end > start:
        content = content[start:end + 1]

    return json.loads(content)


def _chunk_items(items: List[Dict[str, Any]], batch_size: int) -> List[List[Dict[str, Any]]]:
    return [items[index:index + batch_size] for index in range(0, len(items), batch_size)]


def _fallback_batch_result(news_batch: List[Dict[str, Any]], batch_id: str) -> Dict[str, Any]:
    items = []
    for news in news_batch:
        items.append({
            "news_hash": news["news_hash"],
            "keep": True,
            "type": news.get("type", "market"),
            "ai_summary": news.get("summary") or news.get("title") or news.get("content", "")[:80],
            "market_impact": news.get("rule_reason", "可能影响市场情绪和相关标的。"),
            "importance_level": news.get("importance_level", "medium"),
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

    messages = [
        {
            "role": "system",
            "content": (
                "你是一位金融新闻筛选助手。"
                "请只输出 JSON，不要输出额外解释。"
                "你需要对输入新闻逐条判断是否值得保留进入正式新闻库。"
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
                '      "type": "macro|market|symbol",\n'
                '      "ai_summary": "一句中文摘要",\n'
                '      "market_impact": "一句中文说明市场影响",\n'
                '      "importance_level": "high|medium|low",\n'
                '      "importance_stars": 0,\n'
                '      "primary_symbol": "MU 或 null",\n'
                '      "related_symbols": ["MU"]\n'
                "    }\n"
                "  ]\n"
                "}\n"
                "要求：\n"
                "1. 如果一条新闻信息价值不够高，可以返回 keep=false，importance_stars 必须给 0。\n"
                "2. 保留新闻时，importance_stars 必须是 1-5 的整数，5 星代表极重要。\n"
                "3. related_symbols 必须是数组。\n"
                "4. symbol 新闻只在确实和跟踪标的或其产业链相关时使用。\n"
                "5. 只返回 JSON。\n\n"
                f"{json.dumps(batch_prompt, ensure_ascii=False)}"
            ),
        },
    ]

    llm_result = llm_client.call_chat(
        messages,
        log_label=f"新闻批次分析 {batch_id}",
        model=LLM_BATCH_MODEL_ID,
        max_tokens=1200,
        timeout=LLM_BATCH_TIMEOUT,
    )
    if not llm_result.success:
        return _fallback_batch_result(news_batch, batch_id)

    try:
        parsed = _extract_json_payload(llm_result.response_text)
        if not isinstance(parsed, dict) or not isinstance(parsed.get("items"), list):
            raise ValueError("invalid batch payload")
        parsed["raw_text"] = llm_result.response_text
        parsed["batch_id"] = batch_id
        return parsed
    except Exception as exc:
        logger.warning("批次 %s JSON 解析失败，回退规则结果: %s", batch_id, exc)
        return _fallback_batch_result(news_batch, batch_id)


def _normalize_type(value: str | None, fallback: str) -> str:
    if value in {"macro", "market", "symbol"}:
        return value
    return fallback


def _normalize_importance(value: str | None, fallback: str) -> str:
    if value in {"high", "medium", "low"}:
        return value
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


def _merge_batch_result(news_batch: List[Dict[str, Any]], llm_result: Dict[str, Any], batch_no: int, analysis_date: str) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], Dict[str, Any]]:
    result_by_hash = {
        item.get("news_hash"): item
        for item in llm_result.get("items", [])
        if isinstance(item, dict) and item.get("news_hash")
    }
    batch_id = llm_result.get("batch_id", f"{analysis_date}-batch-{batch_no}")
    processed_items = []
    kept_items = []

    for news in news_batch:
        item_result = result_by_hash.get(news["news_hash"], {})
        keep = item_result.get("keep", True)

        related_symbols = _normalize_related_symbols(item_result.get("related_symbols"), news.get("related_symbols", []))
        merged = dict(news)
        merged["type"] = _normalize_type(item_result.get("type"), news.get("type", "market"))
        merged["ai_summary"] = _normalize_text(item_result.get("ai_summary") or news.get("summary") or news.get("title"))
        merged["market_impact"] = _normalize_text(item_result.get("market_impact") or news.get("rule_reason"))
        merged["importance_level"] = _normalize_importance(item_result.get("importance_level"), news.get("importance_level", "medium"))
        merged["importance_stars"] = _normalize_importance_stars(item_result.get("importance_stars"), news.get("importance_stars", 0))
        merged["primary_symbol"] = item_result.get("primary_symbol") or (related_symbols[0] if related_symbols else news.get("primary_symbol"))
        merged["related_symbols"] = related_symbols
        merged["is_relevant_to_review"] = 1 if keep else 0
        merged["llm_batch_id"] = batch_id
        merged["processing_status"] = "llm_processed" if keep else "llm_discarded"
        processed_items.append(merged)
        if keep:
            kept_items.append(merged)

    batch_record = {
        "analysis_date": analysis_date,
        "analysis_scope": "batch",
        "batch_no": batch_no,
        "global_news": "\n".join(f"- {item['title'] or item['summary']}" for item in kept_items if item.get("type") == "macro"),
        "market_news": "\n".join(f"- {item['title'] or item['summary']}" for item in kept_items if item.get("type") == "market"),
        "symbol_news": "\n".join(f"- {item['title'] or item['summary']}" for item in kept_items if item.get("type") == "symbol"),
        "market_analysis": f"保留 {len(kept_items)} 条 / 输入 {len(news_batch)} 条",
        "raw_summary": llm_result.get("raw_text", ""),
    }
    return processed_items, kept_items, batch_record


def enhance_news_with_llm(filtered_news: List[Dict[str, Any]], analysis_date: str) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
    if not filtered_news:
        return [], [], []

    batches = _chunk_items(filtered_news, LLM_BATCH_SIZE)
    processed_news: List[Dict[str, Any]] = []
    enhanced: List[Dict[str, Any]] = []
    batch_records: Dict[int, Dict[str, Any]] = {}

    with ThreadPoolExecutor(max_workers=LLM_MAX_WORKERS) as executor:
        futures = {}
        for index, batch in enumerate(batches, start=1):
            batch_id = f"{analysis_date}-batch-{index}"
            futures[executor.submit(_call_batch_llm, batch, batch_id)] = (index, batch)

        for future in as_completed(futures):
            batch_no, batch = futures[future]
            llm_result = future.result()
            processed_items, kept_items, batch_record = _merge_batch_result(batch, llm_result, batch_no, analysis_date)
            processed_news.extend(processed_items)
            enhanced.extend(kept_items)
            batch_records[batch_no] = batch_record

    importance_rank = {"high": 3, "medium": 2, "low": 1}
    enhanced.sort(
        key=lambda item: (
            item.get("importance_stars", 0),
            importance_rank.get(item.get("importance_level"), 1),
            item.get("rule_score", 0),
            item.get("pub_date", ""),
        ),
        reverse=True,
    )
    ordered_batch_records = [batch_records[index] for index in sorted(batch_records)]
    return processed_news, enhanced, ordered_batch_records


def _parse_summary_output(summary: str) -> Dict[str, str]:
    result = {
        "global_news": "",
        "market_news": "",
        "symbol_news": "",
        "market_analysis": "",
    }
    try:
        parsed = _extract_json_payload(summary)
        if isinstance(parsed, dict):
            for key in result:
                value = parsed.get(key)
                if isinstance(value, list):
                    result[key] = "\n".join(str(item) for item in value if item)
                elif value:
                    result[key] = str(value).strip()
            return result
    except Exception:
        pass

    patterns = {
        "global_news": r"###\s*全球重大新闻\s*\n([\s\S]*?)(?=###\s*股票市场重大新闻|###\s*标的相关新闻|###\s*市场分析|$)",
        "market_news": r"###\s*股票市场重大新闻\s*\n([\s\S]*?)(?=###\s*标的相关新闻|###\s*市场分析|$)",
        "symbol_news": r"###\s*标的相关新闻\s*\n([\s\S]*?)(?=###\s*市场分析|$)",
        "market_analysis": r"###\s*市场分析\s*\n([\s\S]*?)$",
    }
    for key, pattern in patterns.items():
        match = re.search(pattern, summary or "")
        if match:
            result[key] = match.group(1).strip()
    return result


def _format_summary_markdown(parsed: Dict[str, str]) -> str:
    return (
        "### 全球重大新闻\n"
        f"{parsed.get('global_news') or '- 暂无'}\n\n"
        "### 股票市场重大新闻\n"
        f"{parsed.get('market_news') or '- 暂无'}\n\n"
        "### 标的相关新闻\n"
        f"{parsed.get('symbol_news') or '- 暂无'}\n\n"
        "### 市场分析\n"
        f"{parsed.get('market_analysis') or '- 暂无'}"
    )


def _generate_rule_based_summary(news_list: List[Dict[str, Any]]) -> str:
    if not news_list:
        return ""

    buckets = {"macro": [], "market": [], "symbol": []}
    for news in news_list:
        buckets.setdefault(news.get("type", "market"), []).append(news)

    parsed = {
        "global_news": "\n".join(f"- {item['title'] or item['summary']}: {item['market_impact'] or item['rule_reason']}" for item in buckets["macro"][:5]),
        "market_news": "\n".join(f"- {item['title'] or item['summary']}: {item['market_impact'] or item['rule_reason']}" for item in buckets["market"][:5]),
        "symbol_news": "\n".join(f"- {item['title'] or item['summary']}: {item['market_impact'] or item['rule_reason']}" for item in buckets["symbol"][:5]),
        "market_analysis": f"当前保留 {len(news_list)} 条有效新闻，其中宏观 {len(buckets['macro'])} 条、市场 {len(buckets['market'])} 条、标的 {len(buckets['symbol'])} 条。",
    }
    return _format_summary_markdown(parsed)


def get_latest_closed_trading_day() -> str:
    """按 NYSE 日历计算最近一个已收盘交易日"""
    ny_tz = pytz.timezone('America/New_York')
    now_ny = datetime.now(ny_tz)
    nyse = mcal.get_calendar('NYSE')
    schedule = nyse.schedule(start_date=now_ny.date() - pd.Timedelta(days=10), end_date=now_ny.date())
    closed_sessions = schedule[schedule['market_close'] <= now_ny]

    if closed_sessions.empty:
        return now_ny.strftime('%Y-%m-%d')

    latest_close = closed_sessions.iloc[-1].name
    return latest_close.strftime('%Y-%m-%d')


def get_active_review_trading_day() -> str:
    """按 6 小时新闻节奏计算当前新闻应归属的复盘日"""
    ny_tz = pytz.timezone('America/New_York')
    now_ny = datetime.now(ny_tz)
    nyse = mcal.get_calendar('NYSE')
    schedule = nyse.schedule(
        start_date=now_ny.date() - pd.Timedelta(days=10),
        end_date=now_ny.date() + pd.Timedelta(days=10),
    )
    upcoming_sessions = schedule[schedule['market_close'] >= now_ny]

    if upcoming_sessions.empty:
        return get_latest_closed_trading_day()

    review_date = upcoming_sessions.iloc[0].name
    return review_date.strftime('%Y-%m-%d')


def subtract_trading_days(date_string: str, count: int) -> str:
    current = datetime.strptime(date_string, "%Y-%m-%d")
    remaining = count
    while remaining > 0:
        current -= pd.Timedelta(days=1)
        if current.weekday() < 5:
            remaining -= 1
    return current.strftime("%Y-%m-%d")


def get_analysis_window(analysis_date: str) -> Tuple[str, str]:
    start_date = subtract_trading_days(analysis_date, 1)
    return f"{start_date} 16:00:00", f"{analysis_date} 16:00:00"


def build_daily_summary_record(news_list: List[Dict[str, Any]], analysis_date: str) -> Dict[str, Any]:
    if not news_list:
        return {
            "analysis_date": analysis_date,
            "analysis_scope": "daily_summary",
            "batch_no": 0,
            "global_news": "",
            "market_news": "",
            "symbol_news": "",
            "market_analysis": "",
            "raw_summary": "",
        }

    summary_news = sorted(
        news_list,
        key=lambda item: (
            item.get("importance_stars", 0),
            {"high": 3, "medium": 2, "low": 1}.get(item.get("importance_level"), 1),
            item.get("rule_score", 0),
            item.get("pub_date", ""),
        ),
        reverse=True,
    )[:20]

    if EFFECTIVE_SKIP_LLM:
        markdown = _generate_rule_based_summary(summary_news)
    else:
        payload = {
            "analysis_date": analysis_date,
            "items": [
                {
                    "news_hash": item.get("news_hash"),
                    "pub_date": item.get("pub_date"),
                    "type": item.get("type"),
                    "importance_level": item.get("importance_level"),
                    "importance_stars": item.get("importance_stars"),
                    "primary_symbol": item.get("primary_symbol"),
                    "related_symbols": item.get("related_symbols", []),
                    "title": item.get("title"),
                    "ai_summary": item.get("ai_summary"),
                    "market_impact": item.get("market_impact"),
                }
                for item in summary_news
            ],
        }
        messages = [
            {
                "role": "system",
                "content": (
                    "你是一位金融复盘分析师。"
                    "请基于输入新闻生成一个 JSON 对象，字段包含 "
                    "global_news, market_news, symbol_news, market_analysis。"
                ),
            },
            {
                "role": "user",
                "content": (
                    "请只输出 JSON。"
                    "global_news、market_news、symbol_news 可以是字符串或字符串数组。"
                    "market_analysis 用中文概括最重要的市场影响。\n\n"
                    f"{json.dumps(payload, ensure_ascii=False)}"
                ),
            },
        ]
        llm_result = llm_client.call_chat(
            messages,
            log_label=f"日期级综合分析 {analysis_date}",
            model=LLM_SUMMARY_MODEL_ID,
            max_tokens=1000,
            timeout=LLM_SUMMARY_TIMEOUT,
        )
        markdown = llm_result.response_text if llm_result.success else _generate_rule_based_summary(summary_news)

    parsed = _parse_summary_output(markdown)
    return {
        "analysis_date": analysis_date,
        "analysis_scope": "daily_summary",
        "batch_no": 0,
        "global_news": parsed["global_news"],
        "market_news": parsed["market_news"],
        "symbol_news": parsed["symbol_news"],
        "market_analysis": parsed["market_analysis"],
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
    normalized["rule_score"] = float(normalized.get("rule_score") or 0)
    normalized["importance_stars"] = _normalize_importance_stars(normalized.get("importance_stars"), 0)
    normalized["is_relevant_to_review"] = int(normalized.get("is_relevant_to_review") or 0)
    raw_rule_passed = normalized.get("rule_passed")
    has_structured_enrichment = bool(
        normalized.get("ai_summary")
        or normalized.get("market_impact")
        or normalized.get("type") in {"macro", "market", "symbol"}
    )
    if raw_rule_passed is None and normalized["is_relevant_to_review"] and has_structured_enrichment:
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
    start_time, end_time = get_analysis_window(analysis_date)
    if use_remote:
        items = fetch_remote_news(start_time[:10], end_time[:10], limit=200)
    else:
        items = get_news_by_date_range(
            datetime.strptime(start_time, "%Y-%m-%d %H:%M:%S"),
            datetime.strptime(end_time, "%Y-%m-%d %H:%M:%S"),
        )

    if fallback_news:
        items.extend(fallback_news)

    deduped: Dict[str, Dict[str, Any]] = {}
    for item in items:
        normalized = _normalize_loaded_news_item(item)
        deduped[_summary_dedup_key(normalized)] = normalized

    filtered = [
        item for item in deduped.values()
        if item.get("is_relevant_to_review")
        and item.get("rule_passed")
        and item.get("processing_status") in {"llm_processed", "reviewed"}
        and start_time <= item.get("pub_date", "") <= end_time
    ]
    if not filtered and fallback_news:
        filtered = [
            _normalize_loaded_news_item(item)
            for item in fallback_news
            if item.get("is_relevant_to_review")
            and item.get("rule_passed")
            and item.get("processing_status") in {"llm_processed", "reviewed"}
        ]
        logger.info(
            "日期级 summary 窗口为空，回退使用当前批次有效新闻 %s 条 (analysis_date=%s)",
            len(filtered),
            analysis_date,
        )
    logger.info("日期级 summary 候选新闻: %s 条 (analysis_date=%s)", len(filtered), analysis_date)
    return sorted(filtered, key=lambda item: item.get("pub_date", ""), reverse=True)


def collect_all_news() -> Dict[str, Any]:
    """采集新闻 -> 动态规则初筛 -> 批量 LLM 结构化增强"""
    logger.info("=" * 60)
    logger.info("开始采集新闻 (v5.0 - 动态规则初筛 + 状态机 + 批量 LLM)")
    logger.info(
        "配置: rules_model=%s, batch_model=%s, summary_model=%s, LLM_TIMEOUT=%ss, LLM_MAX_RETRIES=%s, LLM_MAX_WORKERS=%s, LLM_BATCH_SIZE=%s, LLM_CANDIDATE_LIMIT=%s, SKIP_LLM=%s",
        LLM_RULES_MODEL_ID, LLM_BATCH_MODEL_ID, LLM_SUMMARY_MODEL_ID, LLM_TIMEOUT, LLM_MAX_RETRIES, LLM_MAX_WORKERS, LLM_BATCH_SIZE, LLM_CANDIDATE_LIMIT, EFFECTIVE_SKIP_LLM,
    )
    logger.info(
        "阶段超时: rules_timeout=%ss, batch_timeout=%ss, summary_timeout=%ss",
        LLM_RULES_TIMEOUT,
        LLM_BATCH_TIMEOUT,
        LLM_SUMMARY_TIMEOUT,
    )
    logger.info("=" * 60)

    all_news: List[Dict[str, Any]] = []
    analysis_date = get_latest_closed_trading_day()
    logger.info("当前新闻分析目标日: %s", analysis_date)

    print("\n正在采集新闻...")
    if USE_DEMO_DATA:
        demo_news = build_demo_news_feed()
        all_news.extend(demo_news)
        logger.info("当前启用 demo 数据模式，直接加载 %s 条预置新闻", len(demo_news))
        print(f"  ✓ demo: {len(demo_news)} 条")
    else:
        with ThreadPoolExecutor(max_workers=4) as executor:
            futures = {
                executor.submit(fetch_sina_finance): 'sina',
                executor.submit(fetch_cls_cn): 'cls_cn',
                executor.submit(fetch_jin10): 'jin10',
                executor.submit(fetch_yahoo_finance_news): 'yahoo',
            }
            for future in as_completed(futures):
                source = futures[future]
                try:
                    news = future.result()
                    all_news.extend(news)
                    print(f"  ✓ {source}: {len(news)} 条")
                except Exception as exc:
                    logger.error("%s 采集失败: %s", source, exc)
                    print(f"  ✗ {source}: 失败")

    unique_news = merge_and_deduplicate(all_news)
    logger.info("合并去重后: %s 条", len(unique_news))

    screening_profile = generate_dynamic_screening_profile(unique_news, analysis_date)
    logger.info("动态初筛摘要: %s", screening_profile.get("reasoning_summary"))
    filtered_news = filter_news_by_rules(unique_news, screening_profile)
    print(f"\n规则初筛保留 {len(filtered_news)} / {len(unique_news)} 条新闻...")

    processed_news, final_news, batch_analysis_records = enhance_news_with_llm(filtered_news, analysis_date)
    logger.info("LLM 精选后保留 %s 条新闻", len(final_news))
    return {
        "analysis_date": analysis_date,
        "screening_profile": screening_profile,
        "screened_news": filtered_news,
        "processed_news": processed_news,
        "final_news": final_news,
        "batch_analysis_records": batch_analysis_records,
    }


def export_to_excel(news_list: list, summary: str) -> str:
    """导出到 Excel"""
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)

    filepath = f"{OUTPUT_DIR}/news_v3_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"

    with pd.ExcelWriter(filepath, engine='openpyxl') as writer:
        df_news = pd.DataFrame(news_list)
        df_news.to_excel(writer, sheet_name='News', index=False)

        df_summary = pd.DataFrame({'类型': ['综合分析'], 'AI总结': [summary]})
        df_summary.to_excel(writer, sheet_name='AI_Summary', index=False)

    logger.info(f"数据已导出: {filepath}")
    return filepath


def run_news_pipeline(collect_fresh_news: bool = True, persist_summary: bool = True) -> Dict[str, Any]:
    """运行新闻流程。

    collect_fresh_news=False 适合小时任务之外的收盘汇总任务，只对现有库内新闻做日期级汇总。
    persist_summary=False 适合小时任务，只入新闻库，不写 news_analysis。
    """
    analysis_date = get_latest_closed_trading_day()
    batch_analysis_records: List[Dict[str, Any]] = []
    news_list: List[Dict[str, Any]] = []
    processed_news: List[Dict[str, Any]] = []
    screened_news: List[Dict[str, Any]] = []

    if collect_fresh_news:
        collected = collect_all_news()
        news_list = collected["final_news"]
        processed_news = collected["processed_news"]
        screened_news = collected["screened_news"]
        analysis_date = collected["analysis_date"]
        batch_analysis_records = collected["batch_analysis_records"]

    use_remote = ENABLE_REMOTE_WRITE and is_remote_write_configured()

    inserted_count = 0
    if collect_fresh_news:
        if use_remote:
            screened_result = send_news(screened_news) if screened_news else {"inserted": 0, "updated": 0, "ignored": 0}
            processed_result = send_news(processed_news) if processed_news else {"inserted": 0, "updated": 0, "ignored": 0}
            inserted_count = screened_result.get('inserted', 0) + processed_result.get('inserted', 0)
            logger.info(
                "Cloudflare D1 新闻写入完成: 初筛新增 %s / 更新 %s；LLM 阶段新增 %s / 更新 %s",
                screened_result.get('inserted', 0),
                screened_result.get('updated', 0),
                processed_result.get('inserted', 0),
                processed_result.get('updated', 0),
            )
            logger.info(
                "Cloudflare D1 新闻去重统计: 初筛忽略 %s；LLM 阶段忽略 %s",
                screened_result.get('ignored', 0),
                processed_result.get('ignored', 0),
            )
        else:
            init_database()
            screened_stats = upsert_news_batch(screened_news)
            processed_stats = upsert_news_batch(processed_news)
            inserted_count = screened_stats["inserted"] + processed_stats["inserted"]
            logger.info(
                "数据库新闻写入完成: 初筛新增 %s / 更新 %s；LLM 阶段新增 %s / 更新 %s",
                screened_stats["inserted"],
                screened_stats["updated"],
                processed_stats["inserted"],
                processed_stats["updated"],
            )
            logger.info(
                "数据库新闻去重统计: 初筛忽略 %s；LLM 阶段忽略 %s",
                screened_stats["ignored"],
                processed_stats["ignored"],
            )
    window_news = load_news_for_summary(analysis_date, use_remote, fallback_news=news_list)
    daily_record: Dict[str, Any] = {}
    if persist_summary and window_news:
        daily_record = build_daily_summary_record(window_news, analysis_date)
        if use_remote:
            send_news_analysis(daily_record)
        else:
            save_news_analysis(daily_record)
            logger.info("日期级综合分析已更新: %s", analysis_date)
    elif persist_summary:
        logger.info("交易日 %s 的分析窗口内暂无有效新闻，跳过 daily_summary 覆盖", analysis_date)
        if not use_remote:
            daily_record = get_news_analysis_by_date(analysis_date) or {}

    if persist_summary:
        if use_remote:
            initialize_remote_review(analysis_date)
        else:
            initialize_archive_record(analysis_date)
        logger.info("复盘记录已初始化: %s", analysis_date)

    if not news_list:
        news_list = window_news
    summary_text = daily_record.get("raw_summary") or _generate_rule_based_summary(news_list[:10])

    filepath = export_to_excel(news_list, summary_text)
    return {
        "filepath": filepath,
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
    logger.info("=" * 60)
    logger.info("新闻采集脚本 v4.0 启动")
    logger.info("=" * 60)

    try:
        result = run_news_pipeline()
        print("\n" + "=" * 60)
        print("采集完成!")
        print("=" * 60)
        print(f"新闻总数: {result['news_count']} 条")
        print(f"数据库新增: {result['inserted_count']} 条")
        print(f"输出文件: {result['filepath']}")
        print(f"分析交易日: {result['analysis_date']}")
        print(f"LLM 批次数: {result['batch_count']}")

        if result.get("summary"):
            print("\n【AI 分析摘要】")
            print(result["summary"][:500] + "..." if len(result["summary"]) > 500 else result["summary"])

        logger.info("新闻采集脚本执行完成")
        return 0
    except CloudflareIngestError as exc:
        logger.error("Cloudflare 写入失败: %s", exc, exc_info=True)
        return 1
    except Exception as exc:
        logger.error("执行失败: %s", exc, exc_info=True)
        return 1


if __name__ == "__main__":
    import sys
    sys.exit(main())
