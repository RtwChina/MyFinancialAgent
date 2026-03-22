"""
Embedding 语义过滤模块
使用 DashScope text-embedding-v3 API 对新闻做语义相关性过滤
"""
import json
import math
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Dict, List, Optional, Tuple

from config import LLM_API_KEY, LLM_BASE_URL
from logger_utils import get_logger
from symbol_registry import get_tracked_symbols

logger = get_logger("embedding_filter")

EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-v3")
EMBEDDING_SIMILARITY_THRESHOLD = float(os.getenv("EMBEDDING_SIMILARITY_THRESHOLD", "0.3"))
EMBEDDING_TIMEOUT = int(os.getenv("EMBEDDING_TIMEOUT", "30"))
EMBEDDING_BATCH_SIZE = 10  # DashScope text-embedding-v3 单次最多 10 条
RULE_SCORE_WEIGHT = float(os.getenv("RULE_SCORE_WEIGHT", "0.02"))

# 复用 TCP 连接池，并发 embedding 调用时避免频繁建连
import requests as _requests
from requests.adapters import HTTPAdapter as _HTTPAdapter
_embedding_session = _requests.Session()
_embedding_adapter = _HTTPAdapter(pool_connections=10, pool_maxsize=10)
_embedding_session.mount("https://", _embedding_adapter)
_embedding_session.mount("http://", _embedding_adapter)

# 标的 Profile 文本：中英文混合，包含公司名、代码、业务关键词
# 从 tracked_symbols 动态生成
_PROFILE_TEMPLATES = {
    # 个股
    "MU": "Micron Technology MU 美光科技 DRAM NAND 半导体 存储芯片 内存 HBM 数据中心",
    "LITE": "Lumentum Holdings LITE 光通信 光子学 激光器 3D传感 光模块 光纤",
    "MSFT": "Microsoft MSFT 微软 Azure 云计算 AI Copilot Office Windows 人工智能",
    "GOOGL": "Alphabet Google GOOGL 谷歌 搜索 广告 YouTube 云计算 AI Gemini DeepMind",
    # 指数
    "GSPC": "S&P 500 标普500 美股大盘 蓝筹股 美国经济",
    "VIX": "VIX 恐慌指数 波动率 市场恐慌 风险情绪",
    "HSI": "Hang Seng 恒生指数 港股 香港股市",
    "SSE": "Shanghai Composite 上证指数 A股 中国股市 上证",
    "DXY": "Dollar Index DXY 美元指数 美元 汇率",
    "GOLD": "Gold 黄金 COMEX 避险资产 贵金属 金价",
    "CL": "Crude Oil WTI 原油 油价 OPEC 能源",
    # 板块
    "SOXX": "Semiconductor ETF SOXX 半导体 芯片板块 晶圆 制程",
    "XLK": "Technology XLK 科技板块 科技股 硬件 软件",
}


def _get_profile_text(symbol_record: Dict[str, Any]) -> str:
    """获取标的的 profile 文本，优先用预定义模板，否则用 display_name + aliases 拼接"""
    symbol = symbol_record["symbol"]
    if symbol in _PROFILE_TEMPLATES:
        return _PROFILE_TEMPLATES[symbol]
    display_name = symbol_record.get("display_name", symbol)
    aliases = symbol_record.get("aliases", [])
    return f"{symbol} {display_name} {' '.join(aliases[:5])}"


def _call_embedding_api(texts: List[str]) -> Optional[List[List[float]]]:
    """调用 DashScope text-embedding-v3 API 生成向量"""
    try:
        # 使用 OpenAI 兼容接口，通过共享 Session 复用 TCP 连接
        url = f"{LLM_BASE_URL}/embeddings"
        headers = {
            "Authorization": f"Bearer {LLM_API_KEY}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": EMBEDDING_MODEL,
            "input": texts,
        }
        resp = _embedding_session.post(url, headers=headers, json=payload, timeout=EMBEDDING_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
        # 按 index 排序确保顺序一致
        embeddings = sorted(data["data"], key=lambda x: x["index"])
        return [item["embedding"] for item in embeddings]
    except Exception as exc:
        logger.warning("[Embedding] API 调用失败: %s", exc)
        return None


def _cosine_similarity(vec_a: List[float], vec_b: List[float]) -> float:
    """计算两个向量的余弦相似度"""
    dot = sum(a * b for a, b in zip(vec_a, vec_b))
    norm_a = math.sqrt(sum(a * a for a in vec_a))
    norm_b = math.sqrt(sum(b * b for b in vec_b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def _batch_embed(texts: List[str]) -> Optional[List[List[float]]]:
    """并发分批调用 Embedding API，处理超过单次上限的情况"""
    chunks = [texts[i:i + EMBEDDING_BATCH_SIZE] for i in range(0, len(texts), EMBEDDING_BATCH_SIZE)]
    if len(chunks) <= 1:
        # 单批直接调用，不需要线程池
        return _call_embedding_api(chunks[0]) if chunks else []

    results: Dict[int, List[List[float]]] = {}
    with ThreadPoolExecutor(max_workers=min(len(chunks), 5)) as executor:
        futures = {executor.submit(_call_embedding_api, chunk): idx for idx, chunk in enumerate(chunks)}
        for future in as_completed(futures):
            idx = futures[future]
            result = future.result()
            if result is None:
                return None
            results[idx] = result

    all_embeddings: List[List[float]] = []
    for idx in range(len(chunks)):
        all_embeddings.extend(results[idx])
    return all_embeddings


def generate_profile_embeddings() -> Optional[Dict[str, List[float]]]:
    """为所有 tracked_symbols 生成 profile 向量"""
    symbols = get_tracked_symbols()
    if not symbols:
        logger.warning("[Embedding] 无 tracked_symbols，跳过 profile 生成")
        return None

    texts = []
    symbol_keys = []
    for rec in symbols:
        profile_text = _get_profile_text(rec)
        texts.append(profile_text)
        symbol_keys.append(rec["symbol"])

    embeddings = _batch_embed(texts)
    if embeddings is None:
        return None

    return dict(zip(symbol_keys, embeddings))


def filter_news_by_embedding(
    news_list: List[Dict[str, Any]],
    profile_embeddings: Dict[str, List[float]],
    threshold: Optional[float] = None,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """使用 Embedding 语义过滤新闻。

    返回 (passed, filtered)，每条新闻增加 _embedding 字段记录相似度详情。
    """
    if threshold is None:
        threshold = EMBEDDING_SIMILARITY_THRESHOLD

    # 构造新闻文本用于向量化
    news_texts = []
    for news in news_list:
        title = news.get("title", "")
        content = (news.get("content") or "")[:200]
        news_texts.append(f"{title} {content}".strip())

    t0 = time.time()
    news_embeddings = _batch_embed(news_texts)
    embed_duration = time.time() - t0

    if news_embeddings is None:
        logger.warning("[Embedding] 新闻向量化失败，跳过 Embedding 阶段 (耗时 %.1fs)", embed_duration)
        # 降级：全部标记为 skipped
        for news in news_list:
            news["_embedding"] = {
                "similarity": None,
                "matched_symbol": None,
                "decision": "skipped",
            }
        return news_list, []

    logger.info("[Embedding] 新闻向量化完成: %s条, 耗时 %.1fs", len(news_list), embed_duration)

    profile_symbols = list(profile_embeddings.keys())
    profile_vectors = list(profile_embeddings.values())

    passed = []
    filtered = []
    for news, news_vec in zip(news_list, news_embeddings):
        # 与所有标的 profile 计算相似度，取最大值
        max_sim = 0.0
        best_symbol = None
        for sym, prof_vec in zip(profile_symbols, profile_vectors):
            sim = _cosine_similarity(news_vec, prof_vec)
            if sim > max_sim:
                max_sim = sim
                best_symbol = sym

        # 综合评分：embedding_similarity + rule_score * RULE_SCORE_WEIGHT
        rule_score = news.get("_scoring", {}).get("rule_score", 0.0)
        rule_score_bonus = round(rule_score * RULE_SCORE_WEIGHT, 4)
        combined_score = round(max_sim + rule_score_bonus, 4)

        decision = "pass" if combined_score >= threshold else "filter"
        news["_embedding"] = {
            "similarity": round(max_sim, 4),
            "matched_symbol": best_symbol,
            "rule_score_bonus": rule_score_bonus,
            "combined_score": combined_score,
            "decision": decision,
        }

        if combined_score >= threshold:
            passed.append(news)
        else:
            filtered.append(news)

    logger.info(
        "[Embedding] 过滤完成: 保留 %s/%s条, 阈值=%.2f, rule_weight=%.3f",
        len(passed), len(news_list), threshold, RULE_SCORE_WEIGHT,
    )
    return passed, filtered
