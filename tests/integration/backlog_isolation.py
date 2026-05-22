#!/usr/bin/env python3
"""Backlog isolation integration check for account-managed live action plans."""

from __future__ import annotations

import json
import os
import re
import subprocess
import urllib.request
from datetime import date, timedelta


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BASE_URL = os.environ.get("INTEGRATION_BASE_URL", "http://localhost:8787").rstrip("/")
DB_NAME = os.environ.get("INTEGRATION_DB_NAME", "my-financial-agent")
WRANGLER_CONFIG = os.environ.get("INTEGRATION_WRANGLER_CONFIG", "wrangler.toml")
WRANGLER_LOCAL = os.environ.get("INTEGRATION_WRANGLER_LOCAL", "1") != "0"


def api(method: str, path: str, payload: dict | None = None) -> dict:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(f"{BASE_URL}{path}", data=data, method=method, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8") or "{}")


def d1(sql: str) -> list[dict]:
    cmd = ["npx", "wrangler", "d1", "execute", DB_NAME, "--config", WRANGLER_CONFIG, "--command", sql]
    if WRANGLER_LOCAL:
        cmd.append("--local")
    result = subprocess.run(cmd, cwd=ROOT, text=True, capture_output=True, check=True)
    clean = re.sub(r"\x1b\[[0-9;]*m", "", result.stdout)
    start = clean.rfind("\n[")
    payload = json.loads(clean[start + 1:]) if start >= 0 else []
    return payload[0].get("results", []) if payload else []


def live_snapshot() -> list[tuple]:
    rows = d1("SELECT account_id, symbol, action_type, entry_plan, sort_order FROM account_live_action_plans ORDER BY account_id, symbol;")
    return [(row["account_id"], row["symbol"], row.get("action_type"), row.get("entry_plan"), row.get("sort_order")) for row in rows]


def main() -> None:
    accounts = api("GET", "/api/investment-accounts").get("items", [])
    account = next((item for item in accounts if item.get("enabled") is not False and int(item.get("enabled", 1)) != 0), None)
    catalog = api("GET", "/api/account-live-action-plans/symbols").get("items", [])
    symbol = catalog[0]["symbol"] if catalog else None
    if not account or not symbol:
        raise AssertionError("Need one enabled account and one managed symbol")

    base = date.today() + timedelta(days=3800)
    days = [(base + timedelta(days=i)).isoformat() for i in range(4)]
    account_id = int(account["id"])

    d1(
        f"DELETE FROM daily_review_action_plans WHERE archive_date IN ({','.join(repr(day) for day in days)});"
        f"DELETE FROM daily_review_archive WHERE archive_date IN ({','.join(repr(day) for day in days)});"
        f"DELETE FROM account_live_action_plans WHERE account_id = {account_id} AND symbol = '{symbol}';"
    )
    values = ",".join(f"('{day}', 'initialized', datetime('now'))" for day in days)
    d1(f"INSERT INTO daily_review_archive (archive_date, review_status, updated_at) VALUES {values};")
    created = api("POST", "/api/account-live-action-plans", {
        "accountId": account_id,
        "symbol": symbol,
        "actionType": "持仓观察",
        "currentPosition": "0-5%",
        "entryPlan": "backlog live",
    })["item"]

    before = live_snapshot()
    middle = days[1]
    latest = days[-1]
    api("POST", f"/api/reviews/{middle}", {
        "reviewStatus": "draft",
        "actionPlans": [{
            "accountId": account_id,
            "symbol": symbol,
            "actionType": "准备开仓",
            "currentPosition": "0%",
            "entryPlan": "middle day only",
        }],
    })
    if live_snapshot() != before:
        raise AssertionError("non-latest backlog day changed live plans")

    api("POST", f"/api/reviews/{latest}", {
        "reviewStatus": "draft",
        "actionPlans": [{
            "accountId": account_id,
            "symbol": symbol,
            "actionType": "准备开仓",
            "currentPosition": "0%",
            "entryPlan": "latest changes live",
        }],
    })
    after = live_snapshot()
    if after == before:
        raise AssertionError("latest backlog day did not update live plans")

    bootstrap = api("GET", f"/api/reviews/{middle}/bootstrap")
    if bootstrap.get("latestArchiveDate") != latest:
        raise AssertionError("bootstrap latestArchiveDate mismatch")
    if "carryForward" in bootstrap:
        raise AssertionError("bootstrap must omit carryForward")

    api("DELETE", f"/api/account-live-action-plans/{created['id']}")
    d1(
        f"DELETE FROM daily_review_action_plans WHERE archive_date IN ({','.join(repr(day) for day in days)});"
        f"DELETE FROM daily_review_archive WHERE archive_date IN ({','.join(repr(day) for day in days)});"
        f"DELETE FROM account_live_action_plans WHERE account_id = {account_id} AND symbol = '{symbol}';"
    )
    print("backlog_isolation: PASS")


if __name__ == "__main__":
    main()
