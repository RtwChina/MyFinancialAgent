#!/usr/bin/env python3
"""Integration checks for account-managed live action plans.

Defaults target the local wrangler dev environment. Override with:
  INTEGRATION_BASE_URL=http://localhost:8787
  INTEGRATION_DB_NAME=my-financial-agent
  INTEGRATION_WRANGLER_CONFIG=wrangler.toml
  INTEGRATION_WRANGLER_LOCAL=1
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import urllib.error
import urllib.request
from datetime import date, timedelta


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BASE_URL = os.environ.get("INTEGRATION_BASE_URL", "http://localhost:8787").rstrip("/")
DB_NAME = os.environ.get("INTEGRATION_DB_NAME", "my-financial-agent")
WRANGLER_CONFIG = os.environ.get("INTEGRATION_WRANGLER_CONFIG", "wrangler.toml")
WRANGLER_LOCAL = os.environ.get("INTEGRATION_WRANGLER_LOCAL", "1") != "0"


def api(method: str, path: str, payload: dict | None = None) -> dict:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        f"{BASE_URL}{path}",
        data=data,
        method=method,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8")
        raise AssertionError(f"{method} {path} failed: HTTP {exc.code} {body}") from exc


def d1(sql: str) -> list[dict]:
    cmd = [
        "npx",
        "wrangler",
        "d1",
        "execute",
        DB_NAME,
        "--config",
        WRANGLER_CONFIG,
        "--command",
        sql,
    ]
    if WRANGLER_LOCAL:
        cmd.append("--local")
    result = subprocess.run(cmd, cwd=ROOT, text=True, capture_output=True, check=True)
    clean = re.sub(r"\x1b\[[0-9;]*m", "", result.stdout)
    start = clean.rfind("\n[")
    if start < 0:
        return []
    payload = json.loads(clean[start + 1:])
    return payload[0].get("results", []) if payload else []


def assert_equal(left, right, label: str) -> None:
    if left != right:
        raise AssertionError(f"{label}: expected {right!r}, got {left!r}")


def plan_count(table: str, where: str) -> int:
    rows = d1(f"SELECT COUNT(*) AS n FROM {table} WHERE {where};")
    return int(rows[0]["n"] if rows else 0)


def main() -> None:
    today = date.today()
    latest = (today + timedelta(days=3700)).isoformat()
    next_day = (today + timedelta(days=3701)).isoformat()
    history = (today + timedelta(days=3699)).isoformat()

    accounts = api("GET", "/api/investment-accounts").get("items", [])
    enabled_accounts = [item for item in accounts if item.get("enabled") is not False and int(item.get("enabled", 1)) != 0]
    if len(enabled_accounts) < 1:
        raise AssertionError("Need at least one enabled investment account")

    catalog = api("GET", "/api/account-live-action-plans/symbols").get("items", [])
    symbols = [item["symbol"] for item in catalog if item.get("symbol")]
    if not symbols:
        raise AssertionError("Need at least one managed symbol")

    account_id = int(enabled_accounts[0]["id"])
    symbol = symbols[0]

    cleanup = (
        f"DELETE FROM daily_review_action_plans WHERE archive_date IN ('{latest}','{next_day}','{history}');"
        f"DELETE FROM daily_review_archive WHERE archive_date IN ('{latest}','{next_day}','{history}');"
        f"DELETE FROM account_live_action_plans WHERE account_id = {account_id} AND symbol = '{symbol}';"
    )
    d1(cleanup)
    d1(
        "INSERT INTO daily_review_archive (archive_date, review_status, updated_at) VALUES "
        f"('{history}', 'reviewed', datetime('now')),"
        f"('{latest}', 'initialized', datetime('now'));"
    )

    created = api("POST", "/api/account-live-action-plans", {
        "accountId": account_id,
        "symbol": symbol,
        "actionType": "准备开仓",
        "currentPosition": "0%",
        "entryPlan": "integration create",
        "takeProfitPlan": "integration take profit",
        "stopLossPlan": "integration stop loss",
        "supportLevels": "10",
        "resistanceLevels": "20",
        "thinking": "integration",
    })["item"]
    plan_id = int(created["id"])
    assert_equal(plan_count("daily_review_action_plans", f"archive_date = '{latest}' AND account_id = {account_id} AND symbol = '{symbol}'"), 1, "live create mirrors latest daily")

    try:
        api("POST", "/api/account-live-action-plans", {"accountId": account_id, "symbol": symbol})
        raise AssertionError("duplicate create should fail")
    except AssertionError as exc:
        if "HTTP 409" not in str(exc):
            raise

    api("PUT", f"/api/account-live-action-plans/{plan_id}", {
        **created,
        "takeProfitPlan": "integration updated take profit",
    })
    rows = d1(f"SELECT take_profit_plan FROM daily_review_action_plans WHERE archive_date = '{latest}' AND account_id = {account_id} AND symbol = '{symbol}';")
    assert_equal(rows[0]["take_profit_plan"], "integration updated take profit", "live update mirrors latest daily")

    d1(f"INSERT INTO daily_review_archive (archive_date, review_status, updated_at) VALUES ('{next_day}', 'initialized', datetime('now'));")
    api("POST", f"/api/reviews/{next_day}/initialize")
    first = plan_count("daily_review_action_plans", f"archive_date = '{next_day}'")
    api("POST", f"/api/reviews/{next_day}/initialize")
    second = plan_count("daily_review_action_plans", f"archive_date = '{next_day}'")
    assert_equal(first, second, "initialize is idempotent")

    live_before_history = plan_count("account_live_action_plans", f"account_id = {account_id} AND symbol = '{symbol}'")
    api("POST", f"/api/reviews/{history}", {
        "reviewStatus": "draft",
        "actionPlans": [{
            "accountId": account_id,
            "symbol": symbol,
            "actionType": "持仓观察",
            "currentPosition": "5%-10%",
            "entryPlan": "history only",
        }],
    })
    assert_equal(plan_count("account_live_action_plans", f"account_id = {account_id} AND symbol = '{symbol}'"), live_before_history, "historical save does not change live")

    api("DELETE", f"/api/account-live-action-plans/{plan_id}")
    assert_equal(plan_count("account_live_action_plans", f"id = {plan_id}"), 0, "live delete removes row")
    d1(cleanup)
    print("account_live_action_plans_e2e: PASS")


if __name__ == "__main__":
    main()
