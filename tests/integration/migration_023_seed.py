#!/usr/bin/env python3
"""Self-contained migration 023 seed/idempotency checks using temporary SQLite."""

from __future__ import annotations

import os
import sqlite3
import tempfile


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MIGRATION = os.path.join(ROOT, "cloudflare", "migrations", "023_account_live_action_plans.sql")


def setup_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE daily_review_archive (
            archive_date TEXT PRIMARY KEY,
            review_status TEXT
        );
        CREATE TABLE daily_review_action_plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            archive_date TEXT NOT NULL,
            account_id INTEGER NOT NULL,
            symbol TEXT NOT NULL,
            action_type TEXT,
            entry_plan TEXT,
            take_profit_plan TEXT,
            stop_loss_plan TEXT,
            key_levels TEXT,
            support_levels TEXT,
            resistance_levels TEXT,
            current_position TEXT,
            thinking TEXT,
            sort_order INTEGER DEFAULT 0,
            market_type TEXT DEFAULT '美股',
            created_at TEXT,
            updated_at TEXT
        );
        """
    )


def run_migration(conn: sqlite3.Connection) -> None:
    with open(MIGRATION, "r", encoding="utf-8") as fh:
        conn.executescript(fh.read())


def live_rows(conn: sqlite3.Connection) -> list[tuple]:
    return conn.execute(
        "SELECT account_id, symbol, action_type, entry_plan, sort_order, market_type "
        "FROM account_live_action_plans ORDER BY account_id, symbol"
    ).fetchall()


def case_with_reviewed_day() -> None:
    with sqlite3.connect(":memory:") as conn:
        setup_schema(conn)
        conn.executescript(
            """
            INSERT INTO daily_review_archive VALUES ('2026-05-10', 'reviewed');
            INSERT INTO daily_review_archive VALUES ('2026-05-12', 'reviewed');
            INSERT INTO daily_review_archive VALUES ('2026-05-13', 'initialized');
            INSERT INTO daily_review_action_plans (archive_date, account_id, symbol, action_type, entry_plan, sort_order, market_type)
              VALUES ('2026-05-10', 1, 'OLD', '持仓观察', 'old', 0, '美股');
            INSERT INTO daily_review_action_plans (archive_date, account_id, symbol, action_type, entry_plan, sort_order, market_type)
              VALUES ('2026-05-12', 1, 'MU', '准备开仓', 'seed', 0, '美股');
            INSERT INTO daily_review_action_plans (archive_date, account_id, symbol, action_type, entry_plan, sort_order, market_type)
              VALUES ('2026-05-13', 1, 'DRAFT', '准备开仓', 'draft', 0, '美股');
            """
        )
        before_daily = conn.execute("SELECT COUNT(*) FROM daily_review_action_plans").fetchone()[0]
        run_migration(conn)
        rows = live_rows(conn)
        if rows != [(1, "MU", "准备开仓", "seed", 0, "美股")]:
            raise AssertionError(f"unexpected seed rows: {rows!r}")
        run_migration(conn)
        if live_rows(conn) != rows:
            raise AssertionError("migration is not idempotent")
        after_daily = conn.execute("SELECT COUNT(*) FROM daily_review_action_plans").fetchone()[0]
        if before_daily != after_daily:
            raise AssertionError("migration changed daily_review_action_plans")


def case_without_reviewed_day() -> None:
    with sqlite3.connect(":memory:") as conn:
        setup_schema(conn)
        conn.executescript(
            """
            INSERT INTO daily_review_archive VALUES ('2026-05-13', 'initialized');
            INSERT INTO daily_review_action_plans (archive_date, account_id, symbol, action_type, entry_plan, sort_order, market_type)
              VALUES ('2026-05-13', 1, 'DRAFT', '准备开仓', 'draft', 0, '美股');
            """
        )
        run_migration(conn)
        if live_rows(conn):
            raise AssertionError("no reviewed day should leave live table empty")


def main() -> None:
    if not os.path.exists(MIGRATION):
        raise AssertionError(f"missing migration: {MIGRATION}")
    case_with_reviewed_day()
    case_without_reviewed_day()
    print("migration_023_seed: PASS")


if __name__ == "__main__":
    main()
