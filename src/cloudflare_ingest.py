"""
Cloudflare Workers API 写入客户端
"""
from __future__ import annotations

import math
import time
from urllib.parse import urlencode
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
        "Authorization": "Bearer %s" % INGEST_API_TOKEN,
        "Content-Type": "application/json",
    }


def _sanitize_payload(value: Any) -> Any:
    """递归清理 payload，将 NaN/Inf 等非法浮点值替换为 None，避免 JSON 序列化失败"""
    # 非有限浮点数（NaN / Inf）无法被 JSON 标准序列化，统一置 None
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, dict):
        return {key: _sanitize_payload(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_sanitize_payload(item) for item in value]
    return value


def _post(path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    """向 Workers API 发送 POST 请求，带指数退避重试"""
    if not is_remote_write_configured():
        raise CloudflareIngestError("未配置 INGEST_API_BASE_URL 或 INGEST_API_TOKEN")

    url = "%s%s" % (INGEST_API_BASE_URL, path)
    sanitized_payload = _sanitize_payload(payload)
    last_error: Optional[Exception] = None

    for attempt in range(1, DEFAULT_MAX_RETRIES + 1):
        try:
            response = requests.post(url, headers=_headers(), json=sanitized_payload, timeout=DEFAULT_TIMEOUT)
            response.raise_for_status()
            return response.json()
        except requests.RequestException as exc:
            last_error = exc
            logger.error("[写入D1] API请求失败: path=%s, retry=%s/%s, %s", path, attempt, DEFAULT_MAX_RETRIES, exc)
            # 每次重试等待时间随次数线性递增，避免瞬时大量冲击
            if attempt < DEFAULT_MAX_RETRIES:
                time.sleep(DEFAULT_RETRY_DELAY * attempt)

    raise CloudflareIngestError("调用 Workers API 失败: %s" % last_error) from last_error


def _get(path: str, query: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """向 Workers API 发送 GET 请求，带重试；query 参数自动 URL 编码拼接"""
    if not is_remote_write_configured():
        raise CloudflareIngestError("未配置 INGEST_API_BASE_URL 或 INGEST_API_TOKEN")

    query_string = "?%s" % urlencode(query) if query else ""
    url = "%s%s%s" % (INGEST_API_BASE_URL, path, query_string)
    last_error: Optional[Exception] = None

    for attempt in range(1, DEFAULT_MAX_RETRIES + 1):
        try:
            response = requests.get(url, timeout=DEFAULT_TIMEOUT)
            response.raise_for_status()
            return response.json()
        except requests.RequestException as exc:
            last_error = exc
            logger.error("[写入D1] API请求失败: path=%s, retry=%s/%s, %s", path, attempt, DEFAULT_MAX_RETRIES, exc)
            if attempt < DEFAULT_MAX_RETRIES:
                time.sleep(DEFAULT_RETRY_DELAY * attempt)

    raise CloudflareIngestError("调用 Workers API 失败: %s" % last_error) from last_error


def _send_in_batches(path: str, items: List[Dict[str, Any]], batch_size: int) -> Dict[str, Any]:
    """将数据列表按 batch_size 分批 POST，并汇总各批次的 inserted/updated/ignored 统计"""
    inserted = 0
    updated = 0
    ignored = 0
    # 汇总所有批次返回的 news_hash -> id 映射，供调用方追踪写入 ID
    id_map: Dict[str, int] = {}

    for start in range(0, len(items), batch_size):
        batch = items[start:start + batch_size]
        result = _post(path, {"items": batch})
        inserted += result.get("inserted", 0)
        updated += result.get("updated", 0)
        ignored += result.get("ignored", 0)
        batch_id_map = result.get("id_map") or {}
        # 严格做类型转换，防止 Workers 返回非预期类型导致后续操作出错
        if isinstance(batch_id_map, dict):
            for news_hash, news_id in batch_id_map.items():
                try:
                    id_map[str(news_hash)] = int(news_id)
                except (TypeError, ValueError):
                    continue

    return {
        "inserted": inserted,
        "updated": updated,
        "ignored": ignored,
        "total": len(items),
        "id_map": id_map,
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


def send_daily_news_ai_analysis(analysis: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not analysis:
        return None

    result = _post("/api/ingest/news-analysis", analysis)
    logger.info("Cloudflare 新闻分析写入完成: %s", result)
    return result


FILTER_LOG_BATCH_SIZE = 20


def send_pipeline_trace(trace: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """写入 pipeline_trace 记录"""
    if not trace:
        return None
    result = _post("/api/ingest/pipeline-trace", trace)
    logger.info("Cloudflare pipeline_trace 写入完成: run_id=%s", trace.get("run_id", "")[:8])
    return result


def send_filter_logs(logs: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """批量写入 filter_log 记录（每 20 条一批）"""
    if not logs:
        return None
    result = _send_in_batches("/api/ingest/filter-logs", logs, FILTER_LOG_BATCH_SIZE)
    logger.info("Cloudflare filter_log 写入完成: %s条", len(logs))
    return result


def initialize_review(archive_date: str) -> Optional[Dict[str, Any]]:
    if not archive_date:
        return None

    result = _post("/api/reviews/%s/initialize" % archive_date, {})
    if result and result.get("skipped"):
        logger.warning("Cloudflare 跳过初始化复盘记录（已完成复盘）: %s reason=%s", archive_date, result.get("reason"))
    else:
        logger.info("Cloudflare 初始化复盘记录完成: %s", result)
    return result


def create_review_snapshot(archive_date: str, snapshot_reason: str | None = None) -> Optional[Dict[str, Any]]:
    """通过 Workers API 手动归档指定复盘日的当前版本快照。"""
    if not archive_date:
        return None

    payload: Dict[str, Any] = {}
    if snapshot_reason:
        payload["snapshotReason"] = snapshot_reason
    result = _post("/api/reviews/%s/snapshot" % archive_date, payload)
    logger.info("Cloudflare 复盘快照创建完成: %s", result)
    return result


def fetch_daily_news_ai_analysis(analysis_date: str) -> Optional[Dict[str, Any]]:
    """从 Workers API 拉取指定 analysis_date 的日期级新闻分析。"""
    if not analysis_date:
        return None

    result = _get(f"/api/news-analysis/{analysis_date}")
    return result.get("item")


def fetch_news(
    date_from: str | None = None,
    date_to: str | None = None,
    limit: int = 200,
    *,
    date_time_from: str | None = None,
    date_time_to: str | None = None,
    paginate_all: bool = False,
) -> List[Dict[str, Any]]:
    """从 Workers API 拉取新闻。

    - 兼容旧调用：按 date_from/date_to + limit 拉取
    - 新调用：按精确时间窗 date_time_from/date_time_to 查询
    - paginate_all=True 时自动翻页拉取全部匹配结果，避免 limit 截断
    """
    if paginate_all:
        page = 1
        page_size = 100
        items: List[Dict[str, Any]] = []
        total_pages = 1
        while page <= total_pages:
            query: Dict[str, Any] = {
                "isRelevantToReview": "true",
                "page": page,
                "pageSize": page_size,
            }
            if date_time_from:
                query["dateTimeFrom"] = date_time_from
            elif date_from:
                query["dateFrom"] = date_from
            if date_time_to:
                query["dateTimeTo"] = date_time_to
            elif date_to:
                query["dateTo"] = date_to
            result = _get("/api/news", query)
            batch = result.get("items", [])
            items.extend(batch)
            total_pages = max(1, int(result.get("totalPages") or 1))
            page += 1
        return items

    query = {
        "isRelevantToReview": "true",
        "limit": limit,
    }
    if date_time_from:
        query["dateTimeFrom"] = date_time_from
    elif date_from:
        query["dateFrom"] = date_from
    if date_time_to:
        query["dateTimeTo"] = date_time_to
    elif date_to:
        query["dateTo"] = date_to
    result = _get("/api/news", query)
    return result.get("items", [])


def fetch_existing_hashes(date_from: str, date_to: str) -> set:
    """从 Workers API 拉取指定时间范围内已存在的 news_hash 集合，用于 pipeline 入口预过滤。
    调用失败时记录 WARNING 并返回空集合，pipeline 不中断。
    Args:
        date_from: 起始时间，格式 'YYYY-MM-DD HH:MM:SS'（北京时间）
        date_to:   结束时间，格式 'YYYY-MM-DD HH:MM:SS'（北京时间）
    """
    try:
        result = _get("/api/news/hashes", {"dateFrom": date_from, "dateTo": date_to})
        hashes = result.get("hashes", [])
        return set(hashes)
    except Exception as exc:
        logger.warning("[预过滤] 拉取远端 hash 失败，降级为不过滤: %s", exc)
        return set()


def fetch_symbols() -> List[Dict[str, Any]]:
    """从 Workers API 拉取全部活跃标的列表"""
    result = _get("/api/symbols")
    return result.get("items", [])
