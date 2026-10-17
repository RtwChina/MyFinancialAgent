#!/usr/bin/env python3
"""市场与板块迁移验证：正式迁移重放后的新 schema，以及旧数据升级不被改写。"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS_DIR = ROOT / "cloudflare" / "migrations"
MARKET_REVIEW_MIGRATION = 27


def migration_files() -> list[Path]:
    return sorted(MIGRATIONS_DIR.glob("[0-9][0-9][0-9]_*.sql"))


def apply(conn: sqlite3.Connection, files: list[Path]) -> None:
    for migration in files:
        conn.executescript(migration.read_text(encoding="utf-8"))


def columns(conn: sqlite3.Connection, table: str) -> dict[str, tuple]:
    return {row[1]: row for row in conn.execute(f"PRAGMA table_info({table})")}


def assert_market_review_schema(conn: sqlite3.Connection) -> None:
    level_columns = columns(conn, "daily_review_symbol_levels")
    if not level_columns:
        raise AssertionError("daily_review_symbol_levels table is missing")
    for name in ("archive_date", "symbol", "support_levels", "resistance_levels", "created_at", "updated_at"):
        if name not in level_columns:
            raise AssertionError(f"daily_review_symbol_levels missing column {name}")
    for name in ("support_levels", "resistance_levels"):
        _, _, _, notnull, default, _ = level_columns[name]
        if notnull != 1 or default not in ("''", '""'):
            raise AssertionError(f"{name} must be NOT NULL DEFAULT '', got notnull={notnull} default={default!r}")
    for name in ("archive_date", "symbol"):
        if level_columns[name][3] != 1:
            raise AssertionError(f"{name} must be NOT NULL")
    primary_key = sorted((row[5], row[1]) for row in level_columns.values() if row[5])
    if [name for _, name in primary_key] != ["archive_date", "symbol"]:
        raise AssertionError(f"daily_review_symbol_levels primary key must be (archive_date, symbol), got {primary_key}")
    foreign_keys = conn.execute("PRAGMA foreign_key_list(daily_review_symbol_levels)").fetchall()
    if foreign_keys:
        raise AssertionError(f"daily_review_symbol_levels must not cascade from catalog: {foreign_keys}")

    archive = columns(conn, "daily_review_archive")
    for name in ("market_review_json", "market_sentiment_blocks_json", "sector_rotation_blocks_json"):
        if name not in archive:
            raise AssertionError(f"daily_review_archive missing column {name}")
    snapshots = columns(conn, "daily_review_snapshots")
    for name in ("market_review_json", "symbol_levels_json", "market_sentiment_blocks_json", "sector_rotation_blocks_json"):
        if name not in snapshots:
            raise AssertionError(f"daily_review_snapshots missing column {name}")
    plans = columns(conn, "daily_review_action_plans")
    for name in ("support_levels", "resistance_levels", "key_levels"):
        if name not in plans:
            raise AssertionError(f"daily_review_action_plans dropped evidence column {name}")


def fresh_replay() -> None:
    files = migration_files()
    numbers = [int(path.name[:3]) for path in files]
    if MARKET_REVIEW_MIGRATION not in numbers:
        raise AssertionError(f"migration {MARKET_REVIEW_MIGRATION:03d} is missing: {numbers!r}")
    with sqlite3.connect(":memory:") as conn:
        apply(conn, files)
        assert_market_review_schema(conn)


def table_rows(conn: sqlite3.Connection, table: str) -> list[tuple]:
    return conn.execute(f"SELECT * FROM {table} ORDER BY rowid").fetchall()


def upgrade_keeps_existing_rows() -> None:
    files = migration_files()
    before = [path for path in files if int(path.name[:3]) < MARKET_REVIEW_MIGRATION]
    after = [path for path in files if int(path.name[:3]) >= MARKET_REVIEW_MIGRATION]
    with sqlite3.connect(":memory:") as conn:
        apply(conn, before)
        market = json.dumps([{"id": "m", "title": "标普500点位", "children": [{"title": "支撑位", "body": "6500"}]}], ensure_ascii=False)
        rotation = json.dumps([{"id": "r", "title": "存储/光通信", "children": [{"title": "思考", "body": "原文"}]}], ensure_ascii=False)
        conn.execute(
            "INSERT INTO daily_review_archive (archive_date, review_status, market_sentiment_blocks_json, sector_rotation_blocks_json) VALUES (?, 'reviewed', ?, ?)",
            ("2026-10-12", market, rotation),
        )
        conn.execute(
            "INSERT INTO daily_review_action_plans (archive_date, account_id, symbol, support_levels, resistance_levels, key_levels) VALUES ('2026-10-12', 1, 'SOXX', '500', '560', '关键位原值')",
        )
        conn.execute(
            "INSERT INTO daily_review_snapshots (archive_date, version_no, review_status, market_sentiment_blocks_json) VALUES ('2026-10-12', 1, 'reviewed', ?)",
            (market,),
        )
        conn.execute("INSERT INTO tracked_symbols (symbol, display_name, symbol_type) VALUES ('LEGACYX', '历史标的', 'stock')")
        conn.execute("INSERT INTO account_live_action_plans (account_id, symbol, support_levels, resistance_levels, key_levels, current_position, position_amount, thinking) VALUES (1, 'SOXX', '480', '580', 'live 关键位', '5%-10%', 12345.67, '账户原思考')")
        conn.execute("UPDATE daily_review_archive SET reviewer_news_notes=?, trading_summary=?, reviewed_at=?, updated_at=? WHERE archive_date=?",
                     ('新闻原文 <b>不可改</b>', '总结 500/480', '2026-10-12 21:00:00', '2026-10-12 22:00:00', '2026-10-12'))
        tables = [row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
        old_columns = {table: list(columns(conn, table)) for table in tables}
        snapshot_before = {table: table_rows(conn, table) for table in tables}
        apply(conn, after)
        assert_market_review_schema(conn)
        for table, rows in snapshot_before.items():
            selected_columns = ', '.join(f'"{column}"' for column in old_columns[table])
            current = conn.execute(f'SELECT {selected_columns} FROM "{table}" ORDER BY rowid').fetchall()
            if current != rows:
                raise AssertionError(f"migration {MARKET_REVIEW_MIGRATION:03d} changed existing rows in {table}")
        if conn.execute("SELECT market_review_json FROM daily_review_archive").fetchone()[0] is not None:
            raise AssertionError("market_review_json must not be backfilled")
        if conn.execute("SELECT market_review_json, symbol_levels_json FROM daily_review_snapshots").fetchone() != (None, None):
            raise AssertionError("old snapshots must not be backfilled")
        if conn.execute("SELECT COUNT(*) FROM daily_review_symbol_levels").fetchone()[0] != 0:
            raise AssertionError("daily_review_symbol_levels must start empty (no history backfill)")
        if conn.execute("SELECT COUNT(*) FROM tracked_symbols WHERE symbol = 'US10Y'").fetchone()[0] != 0:
            raise AssertionError("US10Y must not be added as a tracked symbol")


def main() -> None:
    fresh_replay()
    upgrade_keeps_existing_rows()
    print("market_review_migration: PASS")


if __name__ == "__main__":
    main()
