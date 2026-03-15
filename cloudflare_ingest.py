"""
Cloudflare Workers API 写入客户端
"""
from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

import requests

from config import INGEST_API_BASE_URL, INGEST_API_TOKEN
from logger_utils import get_logger

logger = get_logger("cloudflare_ingest")
DEFAULT_TIMEOUT = 30
DEFAULT_MAX_RETRIES = 3
DEFAULT_RETRY_DELAY = 1.0
PRICE_BATCH_SIZE = 5
NEWS_BATCH_SIZE = 20


class CloudflareIngestError(RuntimeError):
    """Cloudflare 远程写入失败"""


def is_remote_write_configured() -> bool:
    """是否已配置远程写入所需参数"""
    return bool(INGEST_API_BASE_URL and INGEST_API_TOKEN)


def _headers() -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {INGEST_API_TOKEN}",
        "Content-Type": "application/json",
    }


def _post(path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    if not is_remote_write_configured():
        raise CloudflareIngestError("未配置 INGEST_API_BASE_URL 或 INGEST_API_TOKEN")

    url = f"{INGEST_API_BASE_URL}{path}"
    last_error: Optional[Exception] = None

    for attempt in range(1, DEFAULT_MAX_RETRIES + 1):
        try:
            response = requests.post(url, headers=_headers(), json=payload, timeout=DEFAULT_TIMEOUT)
            response.raise_for_status()
            return response.json()
        except requests.RequestException as exc:
            last_error = exc
            logger.warning("调用 Workers API 失败，第 %s/%s 次重试: %s", attempt, DEFAULT_MAX_RETRIES, exc)
            if attempt < DEFAULT_MAX_RETRIES:
                time.sleep(DEFAULT_RETRY_DELAY * attempt)

    raise CloudflareIngestError(f"调用 Workers API 失败: {last_error}") from last_error


def _send_in_batches(path: str, items: List[Dict[str, Any]], batch_size: int) -> Dict[str, Any]:
    inserted = 0
    ignored = 0

    for start in range(0, len(items), batch_size):
        batch = items[start:start + batch_size]
        result = _post(path, {"items": batch})
        inserted += result.get("inserted", 0)
        ignored += result.get("ignored", 0)

    return {
        "inserted": inserted,
        "ignored": ignored,
        "total": len(items),
    }


def send_prices(prices: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not prices:
        return None

    result = _send_in_batches("/api/ingest/prices", prices, PRICE_BATCH_SIZE)
    logger.info("Cloudflare 价格写入完成: %s", result)
    return result


def send_news(news_items: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not news_items:
        return None

    result = _send_in_batches("/api/ingest/news", news_items, NEWS_BATCH_SIZE)
    logger.info("Cloudflare 新闻写入完成: %s", result)
    return result


def send_news_analysis(analysis: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not analysis:
        return None

    result = _post("/api/ingest/news-analysis", analysis)
    logger.info("Cloudflare 新闻分析写入完成: %s", result)
    return result
