#!/usr/bin/env python3
"""Replay every D1 migration against an empty SQLite database."""

from __future__ import annotations

import sqlite3
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS_DIR = ROOT / "cloudflare" / "migrations"


def table_columns(conn: sqlite3.Connection, table_name: str) -> set[str]:
    return {row[1] for row in conn.execute(f"PRAGMA table_info({table_name})")}


def assert_final_schema(conn: sqlite3.Connection) -> None:
    required_columns = {
        "tracked_symbols": {"symbol", "market_type"},
        "daily_review_action_plans": {"account_id", "position_amount"},
        "account_live_action_plans": {"account_id", "position_amount"},
    }
    for table_name, expected in required_columns.items():
        actual = table_columns(conn, table_name)
        missing = expected - actual
        if missing:
            raise AssertionError(f"{table_name} is missing columns: {sorted(missing)}")

    archive_columns = table_columns(conn, "daily_review_archive")
    removed_archive_columns = {"asset_plan", "market_sentiment", "sector_rotation"}
    unexpected = archive_columns & removed_archive_columns
    if unexpected:
        raise AssertionError(f"daily_review_archive kept removed columns: {sorted(unexpected)}")

    index_rows = conn.execute("PRAGMA index_xinfo(idx_stock_raw_symbol_date)").fetchall()
    indexed_columns = [(row[2], row[3]) for row in index_rows if row[5] == 1]
    if indexed_columns != [("symbol", 0), ("k_date", 1)]:
        raise AssertionError(
            "idx_stock_raw_symbol_date must be (symbol ASC, k_date DESC), "
            f"got {indexed_columns!r}"
        )

    tracked_count = conn.execute("SELECT COUNT(*) FROM tracked_symbols").fetchone()[0]
    if tracked_count == 0:
        raise AssertionError("migration 007 did not seed tracked_symbols")

    integrity = conn.execute("PRAGMA integrity_check").fetchone()[0]
    if integrity != "ok":
        raise AssertionError(f"fresh migration database failed integrity_check: {integrity}")


def main() -> None:
    migrations = sorted(MIGRATIONS_DIR.glob("[0-9][0-9][0-9]_*.sql"))
    migration_numbers = [int(path.name[:3]) for path in migrations]
    if not migration_numbers or migration_numbers[-1] < 26:
        raise AssertionError(f"migration 026 is missing: {migration_numbers!r}")
    expected_numbers = list(range(1, migration_numbers[-1] + 1))
    if migration_numbers != expected_numbers:
        raise AssertionError(
            f"migration sequence has gaps: {migration_numbers!r}"
        )

    with sqlite3.connect(":memory:") as conn:
        for migration in migrations:
            try:
                conn.executescript(migration.read_text(encoding="utf-8"))
            except sqlite3.Error as error:
                raise AssertionError(f"fresh replay failed at {migration.name}: {error}") from error
        assert_final_schema(conn)

    print("migrations_fresh_replay: PASS")


if __name__ == "__main__":
    main()
