#!/usr/bin/env python3
"""Backfill review_account_snapshots for review dates from 2026-05-08.

Default mode is dry-run. Use --apply with a local SQLite/D1 database path to upsert
one structured snapshot row per review date.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


DEFAULT_FROM_DATE = "2026-05-08"


def connect(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def ensure_snapshot_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS review_account_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            archive_date TEXT NOT NULL UNIQUE,
            accounts_snapshot TEXT NOT NULL,
            snapshot_source TEXT NOT NULL DEFAULT 'history_backfill',
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
        """,
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_review_account_snapshots_date ON review_account_snapshots(archive_date)",
    )


def number_or_none(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def fetch_review_dates(conn: sqlite3.Connection, from_date: str) -> list[str]:
    rows = conn.execute(
        """
        SELECT archive_date
        FROM daily_review_archive
        WHERE archive_date >= ?
        ORDER BY archive_date
        """,
        (from_date,),
    ).fetchall()
    return [str(row["archive_date"]) for row in rows]


def fetch_accounts(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT id, name, currency, total_assets, available_cash, enabled, sort_order
        FROM investment_accounts
        WHERE COALESCE(enabled, 1) = 1
          AND name != '未分配账户'
        ORDER BY sort_order, id
        """,
    ).fetchall()
    return [
        {
            "accountId": int(row["id"]),
            "accountName": row["name"] or "",
            "currency": row["currency"] or "CNY",
            "totalAssets": number_or_none(row["total_assets"]),
            "availableCash": number_or_none(row["available_cash"]),
            "netCashFlow": None,
            "dailyPnl": None,
            "dailyPnlPercent": None,
            "notes": "",
        }
        for row in rows
    ]


def load_snapshot(conn: sqlite3.Connection, archive_date: str) -> list[dict[str, Any]]:
    row = conn.execute(
        "SELECT accounts_snapshot FROM review_account_snapshots WHERE archive_date = ?",
        (archive_date,),
    ).fetchone()
    if not row:
        return []
    try:
        parsed = json.loads(row["accounts_snapshot"] or "[]")
    except json.JSONDecodeError:
        return []
    return parsed if isinstance(parsed, list) else []


def merge_accounts(existing: list[dict[str, Any]], current_accounts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    existing_by_id = {int(item.get("accountId") or 0): item for item in existing if item.get("accountId")}
    merged: list[dict[str, Any]] = []
    for account in current_accounts:
        item = existing_by_id.get(account["accountId"], {})
        merged.append({
            **account,
            "totalAssets": number_or_none(item.get("totalAssets", account["totalAssets"])),
            "availableCash": number_or_none(item.get("availableCash", account["availableCash"])),
            "netCashFlow": number_or_none(item.get("netCashFlow")),
            "dailyPnl": number_or_none(item.get("dailyPnl")),
            "dailyPnlPercent": number_or_none(item.get("dailyPnlPercent")),
            "notes": str(item.get("notes") or ""),
        })
    return merged


def fill_true_pnl_from_previous(
    previous: list[dict[str, Any]],
    current: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    previous_by_id = {int(item.get("accountId") or 0): item for item in previous if item.get("accountId")}
    output: list[dict[str, Any]] = []
    for account in current:
        item = dict(account)
        if item.get("dailyPnl") is None and item.get("dailyPnlPercent") is None:
            prev = previous_by_id.get(int(item.get("accountId") or 0))
            prev_total = number_or_none(prev.get("totalAssets")) if prev else None
            current_total = number_or_none(item.get("totalAssets"))
            net_cash_flow = number_or_none(item.get("netCashFlow")) or 0
            if prev_total not in (None, 0) and current_total is not None:
                daily_pnl = current_total - prev_total - net_cash_flow
                item["dailyPnl"] = round(daily_pnl, 2)
                item["dailyPnlPercent"] = round(daily_pnl / prev_total * 100, 4)
        output.append(item)
    return output


def upsert_snapshot(conn: sqlite3.Connection, archive_date: str, accounts: list[dict[str, Any]]) -> None:
    now = datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")
    conn.execute(
        """
        INSERT INTO review_account_snapshots (
            archive_date, accounts_snapshot, snapshot_source, notes, created_at, updated_at
        ) VALUES (?, ?, 'history_backfill', ?, ?, ?)
        ON CONFLICT(archive_date) DO UPDATE SET
            accounts_snapshot = excluded.accounts_snapshot,
            snapshot_source = excluded.snapshot_source,
            notes = excluded.notes,
            updated_at = excluded.updated_at
        """,
        (
            archive_date,
            json.dumps(accounts, ensure_ascii=False, separators=(",", ":")),
            "临时历史回填；无法确认的真实盈亏保持为空。",
            now,
            now,
        ),
    )


def backfill(conn: sqlite3.Connection, from_date: str, apply: bool) -> list[dict[str, Any]]:
    ensure_snapshot_table(conn)
    dates = fetch_review_dates(conn, from_date)
    current_accounts = fetch_accounts(conn)
    results: list[dict[str, Any]] = []
    previous_snapshot: list[dict[str, Any]] = []
    for archive_date in dates:
        existing = load_snapshot(conn, archive_date)
        merged = merge_accounts(existing, current_accounts)
        accounts = fill_true_pnl_from_previous(previous_snapshot, merged)
        if apply:
            upsert_snapshot(conn, archive_date, accounts)
        results.append({
            "archiveDate": archive_date,
            "accountCount": len(accounts),
            "dailyPnlCount": sum(1 for item in accounts if item.get("dailyPnl") is not None),
            "mode": "apply" if apply else "dry-run",
        })
        previous_snapshot = accounts
    if apply:
        conn.commit()
    return results


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db-path", required=True, type=Path, help="Local SQLite/D1 database path.")
    parser.add_argument("--from-date", default=DEFAULT_FROM_DATE)
    parser.add_argument("--apply", action="store_true", help="Write snapshots. Omit for dry-run.")
    args = parser.parse_args()

    conn = connect(args.db_path)
    try:
        results = backfill(conn, args.from_date, args.apply)
    finally:
        conn.close()

    print(json.dumps({"fromDate": args.from_date, "results": results}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
