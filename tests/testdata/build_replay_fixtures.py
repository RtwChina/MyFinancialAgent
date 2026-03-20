#!/usr/bin/env python3
"""Build standardized replay fixtures from the historical SQL seed.

The weekly integration runner uses these fixtures as source-layer replay data.
Fixtures should already reflect current system symbols and type names so that
historical replay behaves like today's production code.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
from datetime import datetime
from pathlib import Path

import pandas as pd
import pandas_market_calendars as mcal

from prepare_history_seed import (
    create_legacy_temp_schema,
    load_legacy_seed,
    normalize_news_type,
    normalize_related_symbols,
    normalize_symbol,
)

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SOURCE = ROOT / "tests" / "testdata" / "test_week_seed_20260315.sql"
DEFAULT_OUTPUT = ROOT / "tests" / "testdata" / "replay"

def previous_trading_day(date_string: str) -> str:
    target = datetime.strptime(date_string, "%Y-%m-%d").date()
    nyse = mcal.get_calendar("NYSE")
    schedule = nyse.schedule(start_date=target - pd.Timedelta(days=10), end_date=target)
    trading_days = [index.date() for index in schedule.index if index.date() < target]
    return trading_days[-1].strftime("%Y-%m-%d")


def build_price_fixtures(conn: sqlite3.Connection, output_root: Path) -> list[str]:
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

    grouped: dict[str, list[dict]] = {}
    for row in rows:
        item = dict(row)
        item["symbol"] = normalize_symbol(item["symbol"])
        item["yahoo_symbol"] = yahoo_map.get(item["symbol"])
        grouped.setdefault(item["k_date"], []).append(item)

    dates = sorted(grouped.keys())
    for k_date, items in grouped.items():
        price_dir = output_root / "prices" / k_date
        price_dir.mkdir(parents=True, exist_ok=True)
        payload = {"k_date": k_date, "items": items}
        (price_dir / "close.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        (price_dir / "latest.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return dates


def build_news_fixtures(conn: sqlite3.Connection, output_root: Path, review_dates: list[str]) -> None:
    rows = conn.execute(
        """
        SELECT pub_date, title, content, url, source, type, related_symbols,
               importance_stars, rule_passed, rule_reason, processing_status,
               ai_summary, market_impact, news_hash
        FROM news_raw_data
        ORDER BY pub_date
        """
    ).fetchall()

    news_items = []
    for row in rows:
        item = dict(row)
        item["type"] = normalize_news_type(item.get("type"))
        item["related_symbols"] = json.loads(normalize_related_symbols(item.get("related_symbols")))
        item["importance_stars"] = int(item.get("importance_stars") or 0)
        item["rule_passed"] = int(item.get("rule_passed") or 0)
        news_items.append(item)
    for review_date in review_dates:
        previous_day = previous_trading_day(review_date)
        start_bound = f"{previous_day} 16:00:00"
        end_bound = f"{review_date} 16:00:00"
        items = [item for item in news_items if start_bound <= item["pub_date"] <= end_bound]
        news_dir = output_root / "news" / review_date
        news_dir.mkdir(parents=True, exist_ok=True)
        payload = {"review_date": review_date, "items": items}
        (news_dir / "latest.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        (news_dir / "15-00.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build replay fixtures from SQL seed.")
    parser.add_argument("--source", default=str(DEFAULT_SOURCE))
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    source = Path(args.source)
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    create_legacy_temp_schema(conn)
    load_legacy_seed(conn, source)
    review_dates = build_price_fixtures(conn, output)
    build_news_fixtures(conn, output, review_dates)
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
