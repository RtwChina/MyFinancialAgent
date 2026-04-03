"""Delayed Yahoo retry job for repairing empty stock_raw prices."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from cloudflare_ingest import (
    CloudflareIngestError,
    fetch_price_repair_candidates,
    is_remote_write_configured,
    repair_price_record as remote_repair_price_record,
)
from config import ENABLE_REMOTE_WRITE
from data_sources.price_live import (
    REPAIR_FALLBACK_AKSHARE,
    REPAIR_FALLBACK_FINNHUB,
    fetch_price_for_k_date_akshare,
    fetch_price_for_k_date_finnhub,
    fetch_price_for_k_date_live,
    resolve_repair_fallback_source,
)
from db_utils import get_recent_empty_price_records, repair_price_data
from logger_utils import get_logger
from runtime.context import ExecutionContext, build_execution_context

logger = get_logger("repair_prices")
RECENT_REPAIR_DAYS = 3


def _date_from_for_recent_window(context: ExecutionContext, days: int = RECENT_REPAIR_DAYS) -> str:
    cutoff_date = context.clock.now().date() - timedelta(days=max(days - 1, 0))
    return cutoff_date.strftime("%Y-%m-%d")


def load_repair_candidates(context: ExecutionContext, days: int = RECENT_REPAIR_DAYS) -> list[dict[str, Any]]:
    date_from = _date_from_for_recent_window(context, days)
    if ENABLE_REMOTE_WRITE and is_remote_write_configured():
        items = fetch_price_repair_candidates(date_from)
        logger.info("远端坏记录查询完成: date_from=%s, candidates=%s", date_from, len(items))
        return items

    items = get_recent_empty_price_records(date_from)
    logger.info("本地坏记录查询完成: date_from=%s, candidates=%s", date_from, len(items))
    return items


def apply_repaired_price(context: ExecutionContext, repaired: dict[str, Any]) -> bool:
    if ENABLE_REMOTE_WRITE and is_remote_write_configured():
        result = remote_repair_price_record(repaired) or {}
        return bool(result.get("updated"))
    return repair_price_data(repaired)


def _repair_with_fallback(candidate: dict[str, Any], context: ExecutionContext) -> tuple[dict[str, Any] | None, str | None]:
    symbol = candidate.get("symbol")
    target_k_date = candidate.get("k_date")
    yahoo_symbol = candidate.get("yahoo_symbol") or symbol
    yahoo_repaired = fetch_price_for_k_date_live(candidate, context)
    if yahoo_repaired:
        logger.info(
            "Yahoo 修复命中: symbol=%s yahoo=%s k_date=%s price=%s",
            symbol, yahoo_symbol, target_k_date, yahoo_repaired.get("current_price"),
        )
        return yahoo_repaired, "yahoo"

    fallback_source = resolve_repair_fallback_source(candidate)
    logger.info(
        "Yahoo 修复未命中，准备尝试备用源: symbol=%s yahoo=%s k_date=%s fallback=%s",
        symbol, yahoo_symbol, target_k_date, fallback_source,
    )

    if fallback_source == REPAIR_FALLBACK_AKSHARE:
        repaired = fetch_price_for_k_date_akshare(candidate, context)
        if repaired:
            logger.info(
                "备用源修复命中: symbol=%s yahoo=%s k_date=%s source=%s price=%s",
                symbol, yahoo_symbol, target_k_date, fallback_source, repaired.get("current_price"),
            )
        else:
            logger.warning(
                "备用源修复未命中: symbol=%s yahoo=%s k_date=%s source=%s",
                symbol, yahoo_symbol, target_k_date, fallback_source,
            )
        return repaired, fallback_source
    if fallback_source == REPAIR_FALLBACK_FINNHUB:
        repaired = fetch_price_for_k_date_finnhub(candidate, context)
        if repaired:
            logger.info(
                "备用源修复命中: symbol=%s yahoo=%s k_date=%s source=%s price=%s",
                symbol, yahoo_symbol, target_k_date, fallback_source, repaired.get("current_price"),
            )
        else:
            logger.warning(
                "备用源修复未命中: symbol=%s yahoo=%s k_date=%s source=%s",
                symbol, yahoo_symbol, target_k_date, fallback_source,
            )
        return repaired, fallback_source
    logger.warning(
        "修复跳过: symbol=%s yahoo=%s k_date=%s 未识别到可用备用源",
        symbol, yahoo_symbol, target_k_date,
    )
    return None, None


def run_price_repair(context: ExecutionContext | None = None, days: int = RECENT_REPAIR_DAYS) -> dict[str, int]:
    context = context or build_execution_context()
    candidates = load_repair_candidates(context, days)
    stats = {"candidates": len(candidates), "repaired": 0, "skipped": 0, "failed": 0}

    for candidate in candidates:
        symbol = candidate.get("symbol")
        target_k_date = candidate.get("k_date")
        yahoo_symbol = candidate.get("yahoo_symbol") or symbol
        planned_fallback = resolve_repair_fallback_source(candidate)
        logger.info(
            "开始修复候选: symbol=%s yahoo=%s k_date=%s fallback_plan=%s",
            symbol, yahoo_symbol, target_k_date, planned_fallback,
        )

        repaired, source = _repair_with_fallback(candidate, context)
        if not repaired:
            stats["skipped"] += 1
            logger.warning("修复跳过: symbol=%s yahoo=%s k_date=%s", symbol, yahoo_symbol, target_k_date)
            continue

        try:
            updated = apply_repaired_price(context, repaired)
        except CloudflareIngestError:
            stats["failed"] += 1
            logger.error("修复写入失败: symbol=%s yahoo=%s k_date=%s", symbol, yahoo_symbol, target_k_date, exc_info=True)
            continue

        if updated:
            stats["repaired"] += 1
            logger.info(
                "修复成功: symbol=%s yahoo=%s k_date=%s source=%s price=%s",
                symbol, yahoo_symbol, target_k_date, source, repaired.get("current_price"),
            )
        else:
            stats["failed"] += 1
            logger.warning("修复未更新任何记录: symbol=%s yahoo=%s k_date=%s source=%s", symbol, yahoo_symbol, target_k_date, source)

    logger.info(
        "价格修复完成: candidates=%s repaired=%s skipped=%s failed=%s",
        stats["candidates"], stats["repaired"], stats["skipped"], stats["failed"],
    )
    return stats
