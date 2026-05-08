#!/usr/bin/env python3
"""Normalize legacy historical SQL seeds to the current project schema.

This helper exists for two related workflows:

1. Local smoke testing, where we need a D1-importable SQL file that matches the
   current schema exactly.
2. Weekly integration replay, where historical source data must be normalized to
   current system symbols and type names before being replayed through task
   entrypoints.

The source fixture can still use older columns such as `rule_score`,
`news_brief`, and `selected_news_ids`. This script loads those legacy inserts
into a temporary SQLite schema, then rewrites them into the current schema:

- `stock_raw.symbol` uses system symbols such as `GSPC`, `VIX`, `DXY`
- `news_raw_data.type` uses `index/sector/stock`
- `daily_review_archive` uses `reviewer_news_notes`
- `daily_news_ai_analysis` uses the current three analysis fields plus
  `source_news_ids`
"""

from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path
from typing import Any


SYSTEM_SYMBOL_MAP = {
    "^GSPC": "GSPC",
    "^NDX": "NDX",
    "^DJI": "DJI",
    "^VIX": "VIX",
    "^HSI": "HSI",
    "000001.SS": "SSE",
    "DX-Y.NYB": "DXY",
    "GC=F": "GOLD",
    "CL=F": "CL",
}

NEWS_TYPE_MAP = {
    "macro": "index",
    "market": "sector",
    "symbol": "stock",
}


def normalize_symbol(value: str | None) -> str | None:
    if value is None:
        return None
    return SYSTEM_SYMBOL_MAP.get(value, value)


def normalize_news_type(value: str | None) -> str | None:
    if value is None:
        return None
    return NEWS_TYPE_MAP.get(value, value)


def normalize_related_symbols(raw_value: Any) -> str:
    if raw_value in (None, ""):
        return "[]"

    values: list[str]
    if isinstance(raw_value, list):
        values = [str(item).strip() for item in raw_value if str(item).strip()]
    else:
        text = str(raw_value).strip()
        try:
            parsed = json.loads(text)
            if isinstance(parsed, list):
                values = [str(item).strip() for item in parsed if str(item).strip()]
            else:
                values = [text]
        except json.JSONDecodeError:
            values = [part.strip() for part in text.split(",") if part.strip()]

    normalized: list[str] = []
    for symbol in values:
        mapped = normalize_symbol(symbol)
        if mapped and mapped not in normalized:
            normalized.append(mapped)
    return json.dumps(normalized, ensure_ascii=False)


def create_legacy_temp_schema(conn: sqlite3.Connection) -> None:
    """Create a permissive schema that can ingest older project seed files."""

    conn.executescript(
        """
        CREATE TABLE stock_raw (
            k_date TEXT,
            stock_name TEXT,
            symbol TEXT,
            yahoo_symbol TEXT,
            current_price REAL,
            change_percent REAL,
            volume INTEGER,
            captured_at TEXT
        );

        CREATE TABLE news_raw_data (
            pub_date TEXT,
            title TEXT,
            content TEXT,
            url TEXT,
            source TEXT,
            type TEXT,
            rule_passed INTEGER,
            rule_score REAL,
            rule_reason TEXT,
            processing_status TEXT,
            ai_summary TEXT,
            market_impact TEXT,
            importance_stars INTEGER,
            related_symbols TEXT,
            is_relevant_to_review INTEGER,
            news_hash TEXT,
            captured_at TEXT
        );

        CREATE TABLE daily_news_ai_analysis (
            analysis_date TEXT,
            global_news TEXT,
            market_news TEXT,
            symbol_news TEXT,
            market_analysis TEXT,
            updated_at TEXT
        );

        CREATE TABLE daily_review_archive (
            archive_date TEXT,
            review_status TEXT,
            news_brief TEXT,
            selected_news_ids TEXT,
            market_sentiment TEXT,
            sector_rotation TEXT,
            trading_summary TEXT,
            reviewed_at TEXT,
            updated_at TEXT
        );
        """
    )


def load_legacy_seed(conn: sqlite3.Connection, source: Path) -> None:
    """Execute only INSERT statements from the historical source seed."""

    buffer: list[str] = []
    for raw_line in source.read_text(encoding="utf-8").splitlines():
        stripped = raw_line.strip()
        if not stripped or stripped.startswith("--"):
            continue
        buffer.append(stripped)
        if stripped.endswith(";"):
            statement = " ".join(buffer)
            if statement.startswith("INSERT INTO "):
                conn.execute(statement)
            buffer = []
    conn.commit()


def sql_value(value: Any) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)
    text = str(value).replace("'", "''")
    return f"'{text}'"


def render_stock_rows(conn: sqlite3.Connection) -> list[str]:
    rows = conn.execute(
        """
        SELECT k_date, stock_name, symbol, current_price, change_percent, volume, captured_at
        FROM stock_raw
        ORDER BY k_date, symbol
        """
    ).fetchall()

    # symbol -> yahoo_symbol mapping
    yahoo_map = {
        'SSE': '000001.SS', 'DXY': 'DX-Y.NYB', 'GOLD': 'GC=F', 'GOOGL': 'GOOGL',
        'LITE': 'LITE', 'MSFT': 'MSFT', 'MU': 'MU', 'GSPC': '^GSPC',
        'HSI': '^HSI', 'VIX': '^VIX', 'IXIC': '^IXIC', 'DJI': '^DJI',
        'STOXX50E': '^STOXX50E', 'TNX': '^TNX', 'USDJPY': 'JPY=X',
        'USDCNY': 'CNY=X', 'SILVER': 'SI=F', 'COPPER': 'HG=F',
        'SOYBEAN': 'ZS=F', 'BTCUSD': 'BTC-USD', 'BZ=F': 'BZ=F',
        'XLK': 'XLK', 'SOXX': 'SOXX', 'EWY': 'EWY', 'XLE': 'XLE',
        'XLF': 'XLF', 'XLY': 'XLY', 'XLC': 'XLC', 'XLI': 'XLI',
        'XLP': 'XLP', 'XLB': 'XLB', 'XLU': 'XLU', 'XLV': 'XLV',
        'IYR': 'IYR', 'VIG': 'VIG', 'AGG': 'AGG',
        'SNDK': 'SNDK', '通信ETF': '515880.SS', '机器人ETF': '562500.SS',
        '胜宏科技': '300476.SZ', '润泽科技': '300442.SZ', '阿里巴巴': '9988.HK', '紫金矿业': '601899.SS',
    }

    statements: list[str] = []
    for row in rows:
        system_symbol = normalize_symbol(row["symbol"])
        yahoo_symbol = yahoo_map.get(system_symbol)
        statements.append(
            "INSERT OR IGNORE INTO stock_raw "
            "(k_date, stock_name, symbol, yahoo_symbol, current_price, change_percent, volume, captured_at) "
            f"VALUES ({sql_value(row['k_date'])}, {sql_value(row['stock_name'])}, "
            f"{sql_value(system_symbol)}, {sql_value(yahoo_symbol)}, {sql_value(row['current_price'])}, {sql_value(row['change_percent'])}, "
            f"{sql_value(row['volume'])}, {sql_value(row['captured_at'])});"
        )
    return statements


def render_news_rows(conn: sqlite3.Connection) -> list[str]:
    rows = conn.execute(
        """
        SELECT pub_date, title, content, url, source, type, rule_passed, rule_reason,
               processing_status, ai_summary, market_impact, importance_stars,
               related_symbols, is_relevant_to_review, news_hash, captured_at
        FROM news_raw_data
        ORDER BY pub_date, news_hash
        """
    ).fetchall()

    statements: list[str] = []
    for row in rows:
        statements.append(
            "INSERT OR IGNORE INTO news_raw_data "
            "(pub_date, title, content, url, source, type, rule_passed, rule_reason, processing_status, "
            "ai_summary, market_impact, importance_stars, related_symbols, is_relevant_to_review, news_hash, captured_at) "
            f"VALUES ({sql_value(row['pub_date'])}, {sql_value(row['title'])}, {sql_value(row['content'])}, "
            f"{sql_value(row['url'])}, {sql_value(row['source'])}, {sql_value(normalize_news_type(row['type']))}, "
            f"{sql_value(row['rule_passed'])}, {sql_value(row['rule_reason'])}, {sql_value(row['processing_status'])}, "
            f"{sql_value(row['ai_summary'])}, {sql_value(row['market_impact'])}, {sql_value(row['importance_stars'])}, "
            f"{sql_value(normalize_related_symbols(row['related_symbols']))}, {sql_value(row['is_relevant_to_review'])}, "
            f"{sql_value(row['news_hash'])}, {sql_value(row['captured_at'])});"
        )
    return statements


def subtract_trading_days(date_str: str, count: int) -> str:
    """Return the date string after subtracting `count` trading days (skip weekends)."""
    from datetime import date, timedelta
    d = date.fromisoformat(date_str)
    remaining = count
    while remaining > 0:
        d -= timedelta(days=1)
        if d.weekday() < 5:  # Mon-Fri
            remaining -= 1
    return d.isoformat()


def compute_news_window(conn: sqlite3.Connection, analysis_date: str) -> tuple[str, str]:
    """Compute news window [start, end] for a given analysis_date using stock_raw dates.

    Mirrors the Worker's getNewsWindowForDate logic:
    - If 2+ stock dates exist <= analysis_date, use the earliest of the two as start.
    - Otherwise fall back to analysis_date minus 1 trading day.
    """
    dates = conn.execute(
        """
        SELECT DISTINCT k_date FROM stock_raw
        WHERE k_date <= ? ORDER BY k_date DESC LIMIT 2
        """,
        (analysis_date,),
    ).fetchall()
    k_dates = sorted(row["k_date"] for row in dates)
    end_date = analysis_date
    if len(k_dates) >= 2:
        start_date = k_dates[0]
    else:
        start_date = subtract_trading_days(analysis_date, 1)
    return f"{start_date} 16:00:00", f"{end_date} 16:00:00"


def render_analysis_rows(conn: sqlite3.Connection) -> list[str]:
    rows = conn.execute(
        """
        SELECT analysis_date, global_news, market_news, symbol_news, market_analysis, updated_at
        FROM daily_news_ai_analysis
        ORDER BY analysis_date
        """
    ).fetchall()

    statements: list[str] = []
    for row in rows:
        sector_impact = "\n".join(
            part for part in [row["market_news"], row["market_analysis"]] if str(part or "").strip()
        )
        win_start, win_end = compute_news_window(conn, row["analysis_date"])
        # source_news_ids 用 UPDATE 语句在 INSERT 后通过子查询填充，避免 AUTOINCREMENT ID 未知问题
        statements.append(
            "INSERT OR IGNORE INTO daily_news_ai_analysis "
            "(analysis_date, daily_major_events, sector_impact_map, linkage_logic_chain, source_news_ids, updated_at) "
            f"VALUES ({sql_value(row['analysis_date'])}, {sql_value(row['global_news'])}, "
            f"{sql_value(sector_impact)}, {sql_value(row['symbol_news'])}, '[]', {sql_value(row['updated_at'])});"
        )
        # 后置 UPDATE：用子查询回填真实 news ID
        statements.append(
            f"UPDATE daily_news_ai_analysis SET source_news_ids = ("
            f"SELECT json_group_array(id) FROM news_raw_data "
            f"WHERE pub_date >= {sql_value(win_start)} AND pub_date <= {sql_value(win_end)} "
            f"AND rule_passed = 1 AND COALESCE(importance_stars, 0) >= 3"
            f") WHERE analysis_date = {sql_value(row['analysis_date'])} AND source_news_ids = '[]';"
        )
    return statements


def render_archive_rows(conn: sqlite3.Connection) -> list[str]:
    rows = conn.execute(
        """
        SELECT archive_date, review_status, news_brief, market_sentiment, sector_rotation,
               trading_summary, reviewed_at, updated_at
        FROM daily_review_archive
        ORDER BY archive_date
        """
    ).fetchall()

    statements: list[str] = []
    for row in rows:
        statements.append(
            "INSERT OR IGNORE INTO daily_review_archive "
            "(archive_date, review_status, reviewer_news_notes, market_sentiment, sector_rotation, "
            "trading_summary, reviewed_at, updated_at) "
            f"VALUES ({sql_value(row['archive_date'])}, {sql_value(row['review_status'])}, {sql_value(row['news_brief'])}, "
            f"{sql_value(row['market_sentiment'])}, {sql_value(row['sector_rotation'])}, "
            f"{sql_value(row['trading_summary'])}, {sql_value(row['reviewed_at'])}, {sql_value(row['updated_at'])});"
        )
    return statements


def transform_seed(source: Path) -> str:
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    create_legacy_temp_schema(conn)
    load_legacy_seed(conn, source)

    statements = [
        "-- Generated current-schema-compatible history seed",
        *render_stock_rows(conn),
        *render_news_rows(conn),
        *render_analysis_rows(conn),
        *render_archive_rows(conn),
        "",
    ]
    return "\n".join(statements)


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: prepare_history_seed.py <source.sql> <output.sql>", file=sys.stderr)
        return 1

    source = Path(sys.argv[1])
    output = Path(sys.argv[2])

    if not source.exists():
        print(f"Source file not found: {source}", file=sys.stderr)
        return 1

    output.write_text(transform_seed(source), encoding="utf-8")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
