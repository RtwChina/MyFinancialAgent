#!/usr/bin/env python3
"""Integration runner for the Cloudflare test environment.

Current strategy:
1. Verify test Worker health
2. Clear remote business tables
3. Generate and import current-schema-compatible historical seed
4. Validate historical review list / bootstrap baseline
5. Validate tracked-symbols CRUD on remote Worker
6. Validate review draft -> complete -> reviewed edit/save lifecycle
7. Execute today's live hourly-news + close-summary tasks
8. Run final integrity / duplicate checks and write a report
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

import requests

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from collect_news_v3 import get_latest_closed_trading_day
from runtime.context import build_execution_context

FIXTURE_DIR = ROOT / "tests" / "testdata"
RUNS_DIR = ROOT / "tests" / "runs"
WRANGLER_TEST_CONFIG = ROOT / "tests" / "testdata" / "config" / "wrangler.test.toml"
PREPARE_HISTORY_SEED = FIXTURE_DIR / "prepare_history_seed.py"
SOURCE_SEED = FIXTURE_DIR / "test_week_seed_20260315.sql"
GENERATED_SEED = FIXTURE_DIR / "_generated_history_seed.sql"
DEFAULT_WORKER_BASE = "https://my-financial-agent-test.rtw1994.workers.dev"
DEFAULT_DB_NAME = "my-financial-agent-test"
DEFAULT_HISTORY_DATES = [
    "2026-03-09",
    "2026-03-10",
    "2026-03-11",
    "2026-03-12",
    "2026-03-13",
]
D1_RETRY_ATTEMPTS = 3
D1_RETRY_DELAY_SECONDS = 1.5


@dataclass
class StepResult:
    name: str
    ok: bool
    detail: str


class IntegrationError(RuntimeError):
    """Raised when the integration flow fails."""


def run_command(cmd: list[str], *, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        cwd=ROOT,
        env=env,
        text=True,
        capture_output=True,
        check=False,
    )


def require_success(result: subprocess.CompletedProcess[str], context: str) -> None:
    if result.returncode != 0:
        raise IntegrationError(
            f"{context} failed with exit code {result.returncode}\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
        )


def extract_json_tail(stdout: str) -> Any:
    start = stdout.find("[")
    if start == -1:
        raise IntegrationError(f"Unable to parse wrangler output as JSON:\n{stdout}")
    return json.loads(stdout[start:])


def execute_d1_with_retry(cmd: list[str], context: str) -> Any:
    last_result: subprocess.CompletedProcess[str] | None = None
    for attempt in range(1, D1_RETRY_ATTEMPTS + 1):
        result = run_command(cmd)
        if result.returncode == 0:
            return extract_json_tail(result.stdout)
        last_result = result
        if attempt < D1_RETRY_ATTEMPTS:
            time.sleep(D1_RETRY_DELAY_SECONDS)
    assert last_result is not None
    require_success(last_result, context)
    raise AssertionError("unreachable")


def d1_execute_sql(db_name: str, sql: str) -> Any:
    cmd = [
        "npx",
        "wrangler",
        "d1",
        "execute",
        db_name,
        "--remote",
        "--config",
        str(WRANGLER_TEST_CONFIG),
        "--command",
        sql,
    ]
    return execute_d1_with_retry(cmd, "D1 execute")


def d1_execute_file(db_name: str, path: Path) -> Any:
    cmd = [
        "npx",
        "wrangler",
        "d1",
        "execute",
        db_name,
        "--remote",
        "--config",
        str(WRANGLER_TEST_CONFIG),
        "--file",
        str(path),
    ]
    return execute_d1_with_retry(cmd, "D1 execute file")


def http_get_json(url: str) -> Any:
    response = requests.get(url, timeout=30)
    response.raise_for_status()
    return response.json()


def http_request_json(method: str, url: str, payload: dict[str, Any] | None = None) -> Any:
    response = requests.request(method, url, json=payload, timeout=30)
    response.raise_for_status()
    return response.json()


def reset_test_tables(db_name: str) -> None:
    d1_execute_sql(
        db_name,
        """
        DELETE FROM stock_raw;
        DELETE FROM news_raw_data;
        DELETE FROM daily_news_ai_analysis;
        DELETE FROM daily_review_archive;
        DELETE FROM daily_review_archive_news;
        """,
    )


def build_generated_seed(source: Path, output_path: Path) -> Path:
    result = run_command([sys.executable, str(PREPARE_HISTORY_SEED), str(source), str(output_path)])
    require_success(result, "Generate current-schema-compatible seed")
    return output_path


def import_history_seed(db_name: str, path: Path) -> None:
    d1_execute_file(db_name, path)


def validate_history_dates(worker_base: str, dates: list[str]) -> list[dict[str, Any]]:
    reviews = http_get_json(f"{worker_base}/api/reviews")
    listed_dates = {item.get("archive_date") for item in reviews.get("items", [])}
    validations: list[dict[str, Any]] = []
    for archive_date in dates:
        payload = http_get_json(f"{worker_base}/api/reviews/{archive_date}/bootstrap")
        prices = payload.get("prices") or {}
        price_count = sum(len(v) for v in prices.values()) if isinstance(prices, dict) else len(prices)
        validations.append(
            {
                "archive_date": archive_date,
                "listed": archive_date in listed_dates,
                "price_count": price_count,
                "news_count": len(payload.get("news", [])),
                "has_analysis": any(
                    str((payload.get("analysis") or {}).get(field, "")).strip()
                    for field in ("daily_major_events", "sector_impact_map", "linkage_logic_chain")
                ),
            }
        )
    return validations


def validate_symbol_crud(worker_base: str) -> dict[str, Any]:
    initial = http_get_json(f"{worker_base}/api/symbols")
    items = initial.get("items", [])
    seen_types = {item.get("symbol_type") for item in items}
    missing_types = sorted({"index", "sector", "stock"} - seen_types)
    if missing_types:
        raise IntegrationError(f"tracked_symbols missing symbol types: {missing_types}")

    temp_symbol = f"IT{int(time.time())}"
    created = http_request_json(
        "POST",
        f"{worker_base}/api/symbols",
        {
            "symbol": temp_symbol,
            "yahoo_symbol": temp_symbol,
            "display_name": "集成测试临时标的",
            "symbol_type": "stock",
            "aliases": [temp_symbol, "集成测试临时标的"],
        },
    )
    created_item = created.get("item") or {}
    symbol_id = created_item.get("id")
    if not symbol_id:
        raise IntegrationError("symbol create did not return id")

    updated = http_request_json(
        "PUT",
        f"{worker_base}/api/symbols/{symbol_id}",
        {
            "display_name": "集成测试临时标的-已编辑",
            "aliases": [temp_symbol, "集成测试临时标的", "已编辑"],
            "symbol_type": "stock",
        },
    )
    updated_item = updated.get("item") or {}
    if updated_item.get("display_name") != "集成测试临时标的-已编辑":
        raise IntegrationError("symbol update did not persist display_name")

    deleted = http_request_json("DELETE", f"{worker_base}/api/symbols/{symbol_id}")
    if not deleted.get("ok"):
        raise IntegrationError("symbol delete did not return ok=true")

    final_items = http_get_json(f"{worker_base}/api/symbols").get("items", [])
    if any(item.get("symbol") == temp_symbol for item in final_items):
        raise IntegrationError("soft-deleted symbol still returned by /api/symbols")

    return {
        "initial_total": initial.get("total", len(items)),
        "types": sorted(seen_types),
        "created_symbol": temp_symbol,
    }


def validate_review_lifecycle(worker_base: str, archive_date: str, db_name: str) -> dict[str, Any]:
    http_request_json("POST", f"{worker_base}/api/reviews/{archive_date}/initialize")
    http_request_json(
        "POST",
        f"{worker_base}/api/reviews/{archive_date}",
        {
            "reviewerNewsNotes": "集成测试：新闻总结草稿。",
            "marketSentiment": "集成测试：大盘盘点。",
            "sectorRotation": "集成测试：板块轮动。",
            "assetPlan": "集成测试：个股计划。",
            "tradingSummary": "集成测试：深度总结。",
        },
    )
    http_request_json("POST", f"{worker_base}/api/reviews/{archive_date}/complete")
    http_request_json(
        "POST",
        f"{worker_base}/api/reviews/{archive_date}",
        {
            "reviewerNewsNotes": "集成测试：已复盘后二次保存。",
            "marketSentiment": "集成测试：大盘盘点（二次保存）。",
            "sectorRotation": "集成测试：板块轮动（二次保存）。",
            "assetPlan": "集成测试：个股计划（二次保存）。",
            "tradingSummary": "集成测试：深度总结（二次保存）。",
        },
    )

    payload = http_get_json(f"{worker_base}/api/reviews/{archive_date}/bootstrap")
    draft = payload.get("draft") or {}
    if draft.get("review_status") != "reviewed":
        raise IntegrationError(f"review status not kept as reviewed for {archive_date}")
    if draft.get("reviewer_news_notes") != "集成测试：已复盘后二次保存。":
        raise IntegrationError(f"reviewed edit/save did not persist reviewer_news_notes for {archive_date}")

    counts = d1_execute_sql(
        db_name,
        f"SELECT COUNT(*) AS cnt FROM daily_review_archive_news WHERE archive_date = '{archive_date}';",
    )
    archive_news_count = counts[0]["results"][0]["cnt"]
    if archive_news_count <= 0:
        raise IntegrationError(f"no archived news snapshot generated for {archive_date}")

    return {
        "archive_date": archive_date,
        "review_status": draft.get("review_status"),
        "archive_news_count": archive_news_count,
    }


def run_task(mode: str, worker_base: str, ingest_token: str) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env.update(
        {
            "APP_ENV": "test",
            "TEST_MODE": "none",
            "DATA_MODE": "live",
            "ENABLE_REMOTE_WRITE": "true",
            "INGEST_API_BASE_URL": worker_base,
            "INGEST_API_TOKEN": ingest_token,
        }
    )
    return run_command([sys.executable, "main.py", mode], env=env)


def resolve_live_review_date(explicit_live_date: str | None) -> str:
    if explicit_live_date:
        return explicit_live_date
    context = build_execution_context(app_env="test", test_mode="none", data_mode="live")
    return get_latest_closed_trading_day(context)


def validate_nyse_closed_trading_day(db_name: str, worker_base: str) -> dict[str, Any]:
    """INT-010: 验证复盘候选日来自 ^GSPC 而非跨市场最大日期。

    步骤：
    1. 向 stock_raw 注入一条 ^HSI 的未来日期行（2099-12-31）
    2. 调用 GET /api/reviews，断言 latestClosedDate 仍为 ^GSPC 的最大 k_date（不是 2099-12-31）
    3. 清理注入行
    """
    inject_sql = (
        "INSERT OR IGNORE INTO stock_raw "
        "(k_date, stock_code, stock_name, symbol, current_price, change_percent, volume, captured_at) "
        "VALUES ('2099-12-31', '^HSI', '恒生指数', '^HSI', 99999.0, 0.0, 0, datetime('now'));"
    )
    d1_execute_sql(db_name, inject_sql)

    reviews = http_get_json(f"{worker_base}/api/reviews")
    latest_closed_date = reviews.get("latestClosedDate")

    cleanup_sql = "DELETE FROM stock_raw WHERE k_date = '2099-12-31' AND symbol = '^HSI';"
    d1_execute_sql(db_name, cleanup_sql)

    if latest_closed_date == "2099-12-31":
        raise IntegrationError(
            f"INT-010 FAILED: latestClosedDate='2099-12-31' — Worker is still using MAX(k_date) across all symbols instead of ^GSPC"
        )
    return {"latestClosedDate": latest_closed_date, "injected_date": "2099-12-31", "ok": True}


def validate_cross_market_price_query(db_name: str, worker_base: str, gspc_date: str) -> dict[str, Any]:
    """INT-011: 验证跨市场价格查询——archive_date 后一天有亚洲指数数据时，美股个股仍能展示。

    步骤：
    1. 向 stock_raw 注入 ^HSI 在 gspc_date+1 的一条价格行
    2. 调用 GET /api/reviews/{gspc_date}/bootstrap
    3. 断言 prices 中存在 US 股票（symbol_type=stock）
    4. 清理注入行
    """
    import datetime as _dt
    next_day = (_dt.date.fromisoformat(gspc_date) + _dt.timedelta(days=1)).isoformat()
    inject_sql = (
        f"INSERT OR IGNORE INTO stock_raw "
        f"(k_date, stock_code, stock_name, symbol, current_price, change_percent, volume, captured_at) "
        f"VALUES ('{next_day}', '^HSI', '恒生指数', '^HSI', 20000.0, 0.5, 100000, datetime('now'));"
    )
    d1_execute_sql(db_name, inject_sql)

    payload = http_get_json(f"{worker_base}/api/reviews/{gspc_date}/bootstrap")
    prices = payload.get("prices") or {}
    stock_prices = prices.get("stock") or []
    stock_symbols = [p["symbol"] for p in stock_prices]

    cleanup_sql = f"DELETE FROM stock_raw WHERE k_date = '{next_day}' AND symbol = '^HSI';"
    d1_execute_sql(db_name, cleanup_sql)

    if not stock_prices:
        raise IntegrationError(
            f"INT-011 FAILED: bootstrap for {gspc_date} returned no stock prices "
            f"even though ^HSI has k_date={next_day}. Per-symbol price query may be broken."
        )
    return {
        "archive_date": gspc_date,
        "injected_hsi_date": next_day,
        "stock_symbols_found": stock_symbols,
        "ok": True,
    }


def final_integrity_snapshot(db_name: str, worker_base: str, live_date: str) -> dict[str, Any]:
    counts = d1_execute_sql(
        db_name,
        """
        SELECT 'stock_raw' AS table_name, COUNT(*) AS cnt FROM stock_raw
        UNION ALL
        SELECT 'news_raw_data', COUNT(*) FROM news_raw_data
        UNION ALL
        SELECT 'daily_news_ai_analysis', COUNT(*) FROM daily_news_ai_analysis
        UNION ALL
        SELECT 'daily_review_archive', COUNT(*) FROM daily_review_archive
        UNION ALL
        SELECT 'daily_review_archive_news', COUNT(*) FROM daily_review_archive_news;
        SELECT COUNT(*) AS duplicate_price_groups
        FROM (
          SELECT k_date, symbol, COUNT(*) AS c
          FROM stock_raw
          GROUP BY k_date, symbol
          HAVING c > 1
        );
        SELECT COUNT(*) AS duplicate_news_hash_groups
        FROM (
          SELECT news_hash, COUNT(*) AS c
          FROM news_raw_data
          GROUP BY news_hash
          HAVING c > 1
        );
        SELECT COUNT(*) AS duplicate_archive_news_groups
        FROM (
          SELECT archive_date, news_hash, COUNT(*) AS c
          FROM daily_review_archive_news
          GROUP BY archive_date, news_hash
          HAVING c > 1
        );
        """,
    )
    reviews = http_get_json(f"{worker_base}/api/reviews")
    live_bootstrap = http_get_json(f"{worker_base}/api/reviews/{live_date}/bootstrap")
    prices = live_bootstrap.get("prices") or {}
    live_price_count = sum(len(v) for v in prices.values()) if isinstance(prices, dict) else len(prices)
    return {
        "counts": counts,
        "table_counts": {item["table_name"]: item["cnt"] for item in counts[0]["results"]},
        "duplicate_price_groups": counts[1]["results"][0]["duplicate_price_groups"],
        "duplicate_news_hash_groups": counts[2]["results"][0]["duplicate_news_hash_groups"],
        "duplicate_archive_news_groups": counts[3]["results"][0]["duplicate_archive_news_groups"],
        "reviews_total": len(reviews.get("items", [])),
        "live_date": live_date,
        "live_bootstrap_price_count": live_price_count,
        "live_bootstrap_news_count": len(live_bootstrap.get("news", [])),
    }


def write_report(report: dict[str, Any]) -> Path:
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = RUNS_DIR / f"INTEGRATION_TEST_REPORT_{timestamp}.md"
    integrity = report.get("integrity") or {}
    lines = [
        "# 集成测试报告",
        "",
        f"- 生成时间：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        f"- 测试 Worker：`{report['worker_base']}`",
        f"- 测试 D1：`{report['db_name']}`",
        f"- 历史日期：{', '.join(report['history_dates'])}",
        f"- 今日真实复盘日：`{report['live_date']}`",
        f"- 使用 seed：`{report['generated_seed']}`",
        "",
        "## 执行步骤",
        "",
    ]
    for item in report["steps"]:
        lines.append(f"- `{'PASS' if item['ok'] else 'FAIL'}` {item['name']}: {item['detail']}")
    lines.extend(["", "## 历史基线验证", ""])
    for item in report.get("history_validations", []):
        lines.append(
            f"- `{item['archive_date']}`: listed={item['listed']}, prices={item['price_count']}, news={item['news_count']}, has_analysis={item['has_analysis']}"
        )
    lines.extend([
        "",
        "## 最终完整性快照",
        "",
        f"- reviews_total={integrity.get('reviews_total', 'n/a')}",
        f"- live_bootstrap_price_count={integrity.get('live_bootstrap_price_count', 'n/a')}",
        f"- live_bootstrap_news_count={integrity.get('live_bootstrap_news_count', 'n/a')}",
        f"- duplicate_price_groups={integrity.get('duplicate_price_groups', 'n/a')}",
        f"- duplicate_news_hash_groups={integrity.get('duplicate_news_hash_groups', 'n/a')}",
        f"- duplicate_archive_news_groups={integrity.get('duplicate_archive_news_groups', 'n/a')}",
        "",
        "```json",
        json.dumps(integrity.get("table_counts", {}), ensure_ascii=False, indent=2),
        "```",
        "",
    ])
    path.write_text("\n".join(lines), encoding="utf-8")
    return path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run integration tests against the Cloudflare test environment.")
    parser.add_argument("--worker-base", default=DEFAULT_WORKER_BASE)
    parser.add_argument("--db-name", default=DEFAULT_DB_NAME)
    parser.add_argument("--ingest-token", required=True)
    parser.add_argument("--live-date", default=None)
    parser.add_argument("--history-dates", nargs="*", default=DEFAULT_HISTORY_DATES)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    steps: list[StepResult] = []
    live_date = resolve_live_review_date(args.live_date)

    try:
        health = http_get_json(f"{args.worker_base}/api/health")
        steps.append(StepResult("health-check", health.get("env") == "test", json.dumps(health, ensure_ascii=False)))

        reset_test_tables(args.db_name)
        steps.append(StepResult("reset-test-db", True, "Cleared remote business tables"))

        seed_path = build_generated_seed(SOURCE_SEED, GENERATED_SEED)
        steps.append(StepResult("build-generated-seed", True, str(seed_path)))

        import_history_seed(args.db_name, seed_path)
        steps.append(StepResult("import-history-seed", True, f"Imported {seed_path.name} into remote test D1"))

        history_validations = validate_history_dates(args.worker_base, args.history_dates)
        history_ok = all(item["listed"] and item["price_count"] > 0 and item["news_count"] > 0 and item["has_analysis"] for item in history_validations)
        steps.append(StepResult("validate-history-baseline", history_ok, json.dumps(history_validations, ensure_ascii=False)))

        nyse_date_result = validate_nyse_closed_trading_day(args.db_name, args.worker_base)
        steps.append(StepResult("validate-nyse-closed-date", True, json.dumps(nyse_date_result, ensure_ascii=False)))

        cross_market_result = validate_cross_market_price_query(args.db_name, args.worker_base, args.history_dates[-1])
        steps.append(StepResult("validate-cross-market-price", True, json.dumps(cross_market_result, ensure_ascii=False)))

        symbol_result = validate_symbol_crud(args.worker_base)
        steps.append(StepResult("symbol-crud", True, json.dumps(symbol_result, ensure_ascii=False)))

        lifecycle_result = validate_review_lifecycle(args.worker_base, args.history_dates[-1], args.db_name)
        steps.append(StepResult("review-lifecycle", True, json.dumps(lifecycle_result, ensure_ascii=False)))

        hourly = run_task("hourly-news", args.worker_base, args.ingest_token)
        require_success(hourly, "hourly-news task")
        steps.append(StepResult("run-hourly-news", True, "Executed today's live hourly-news task"))

        close_summary = run_task("close-summary", args.worker_base, args.ingest_token)
        require_success(close_summary, "close-summary task")
        steps.append(StepResult("run-close-summary", True, "Executed today's live close-summary task"))

        integrity = final_integrity_snapshot(args.db_name, args.worker_base, live_date)
        integrity_ok = (
            integrity["duplicate_price_groups"] == 0
            and integrity["duplicate_news_hash_groups"] == 0
            and integrity["duplicate_archive_news_groups"] == 0
            and integrity["live_bootstrap_price_count"] > 0
            and integrity["live_bootstrap_news_count"] > 0
            and integrity["table_counts"].get("daily_review_archive_news", 0) > 0
        )
        steps.append(StepResult("final-integrity", integrity_ok, json.dumps(integrity, ensure_ascii=False)))

        report = {
            "worker_base": args.worker_base,
            "db_name": args.db_name,
            "history_dates": args.history_dates,
            "live_date": live_date,
            "generated_seed": str(seed_path),
            "steps": [item.__dict__ for item in steps],
            "history_validations": history_validations,
            "integrity": integrity,
        }
        report_path = write_report(report)
        print(f"Integration completed. Report: {report_path}")
        return 0 if all(item.ok for item in steps) else 1
    except Exception as exc:
        steps.append(StepResult("fatal-error", False, str(exc)))
        report = {
            "worker_base": args.worker_base,
            "db_name": args.db_name,
            "history_dates": args.history_dates,
            "live_date": live_date,
            "generated_seed": str(GENERATED_SEED),
            "steps": [item.__dict__ for item in steps],
            "history_validations": [],
            "integrity": {},
        }
        report_path = write_report(report)
        print(f"Integration failed. Report: {report_path}", file=sys.stderr)
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
