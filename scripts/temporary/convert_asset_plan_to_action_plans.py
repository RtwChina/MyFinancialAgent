#!/usr/bin/env python3
"""Temporary converter for legacy daily_review_archive.asset_plan text.

Default mode is dry-run: read legacy text and write preview JSON/Markdown.
Apply mode imports a reviewed preview into daily_review_action_plans.
"""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List


ACTION_VALUES = {"准备开仓", "持仓观察", "已清仓复盘"}
POSITION_VALUES = ("0-10%", "10%-20%", "20%-30%", ">30%")


def connect(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def normalize_action(value: str | None) -> str:
    text = (value or "").strip()
    return text if text in ACTION_VALUES else "持仓观察"


def normalize_position(value: str | None) -> str:
    text = (value or "").strip()
    return text if text in POSITION_VALUES else "0-10%"


def percent_to_position(percent: float | None) -> str:
    if percent is None:
        return "0-10%"
    if percent > 30:
        return ">30%"
    if percent > 20:
        return "20%-30%"
    if percent > 10:
        return "10%-20%"
    return "0-10%"


def fetch_symbols(conn: sqlite3.Connection) -> List[str]:
    try:
        rows = conn.execute(
            "SELECT symbol FROM tracked_symbols WHERE is_active = 1 ORDER BY sort_order, symbol",
        ).fetchall()
        symbols = [str(row["symbol"]).strip().upper() for row in rows if row["symbol"]]
    except sqlite3.Error:
        symbols = []
    defaults = ["MU", "MSFT", "GOOGL", "LITE", "BABA", "CASH", "SPY", "QQQ"]
    merged: List[str] = []
    for symbol in [*symbols, *defaults]:
        if symbol and symbol not in merged:
            merged.append(symbol)
    return merged


def existing_plan_count(conn: sqlite3.Connection, archive_date: str) -> int:
    try:
        row = conn.execute(
            "SELECT COUNT(*) AS cnt FROM daily_review_action_plans WHERE archive_date = ?",
            (archive_date,),
        ).fetchone()
        return int(row["cnt"] if row else 0)
    except sqlite3.Error:
        return 0


def detect_action(text: str) -> str:
    if re.search(r"已清|清仓|卖出|退出|复盘", text):
        return "已清仓复盘"
    if re.search(r"准备|开仓|买入|加仓|补仓|回踩|突破", text):
        return "准备开仓"
    return "持仓观察"


def detect_position(text: str) -> str:
    match = re.search(r"(\d+(?:\.\d+)?)\s*%", text)
    return percent_to_position(float(match.group(1)) if match else None)


def lines_matching(lines: Iterable[str], patterns: Iterable[str]) -> str:
    compiled = [re.compile(pattern, re.I) for pattern in patterns]
    selected = [line for line in lines if any(pattern.search(line) for pattern in compiled)]
    return "\n".join(selected).strip()


def split_text_for_symbol(text: str, symbol: str) -> str:
    lines = [line.rstrip() for line in text.splitlines()]
    matched_indexes = [idx for idx, line in enumerate(lines) if re.search(rf"(^|[^A-Z0-9]){re.escape(symbol)}([^A-Z0-9]|$)", line.upper())]
    if not matched_indexes:
        return ""
    start = max(0, matched_indexes[0] - 1)
    end = len(lines)
    for idx in range(matched_indexes[0] + 1, len(lines)):
        if re.match(r"^\s*([A-Z]{2,6}|[0-9]{6}(?:\.S[SZ])?)\b", lines[idx].upper()):
            end = idx
            break
    return "\n".join(lines[start:end]).strip()


def parse_asset_plan(archive_date: str, text: str, symbols: List[str]) -> List[Dict[str, Any]]:
    plans: List[Dict[str, Any]] = []
    upper_text = text.upper()
    matched_symbols = [symbol for symbol in symbols if re.search(rf"(^|[^A-Z0-9]){re.escape(symbol)}([^A-Z0-9]|$)", upper_text)]

    if not matched_symbols and text.strip():
      matched_symbols = ["CASH"]

    for sort_order, symbol in enumerate(matched_symbols):
        chunk = split_text_for_symbol(text, symbol) if symbol != "CASH" else text
        if not chunk:
            chunk = text
        lines = [line.strip() for line in chunk.splitlines() if line.strip()]
        key_levels = lines_matching(lines, [r"支撑|压力|support|resistance", r"\d+\s*[-–]\s*\d+"])
        plans.append({
            "archive_date": archive_date,
            "symbol": symbol,
            "action_type": detect_action(chunk),
            "current_position": detect_position(chunk),
            "entry_plan": lines_matching(lines, [r"开仓|买入|加仓|补仓|回踩|突破|企稳"]),
            "take_profit_plan": lines_matching(lines, [r"止盈|目标|减仓|新高"]),
            "stop_loss_plan": lines_matching(lines, [r"止损|跌破|失效|退出|清仓"]),
            "key_levels": key_levels,
            "thinking": chunk,
            "sort_order": sort_order,
            "migration_note": "temporary parser draft; review before apply",
        })
    return plans


def build_preview(conn: sqlite3.Connection, limit: int | None, override_existing: bool) -> Dict[str, Any]:
    symbols = fetch_symbols(conn)
    sql = (
        "SELECT archive_date, asset_plan FROM daily_review_archive "
        "WHERE TRIM(COALESCE(asset_plan, '')) <> '' "
        "ORDER BY archive_date DESC"
    )
    rows = conn.execute(sql).fetchall()
    if limit:
        rows = rows[:limit]

    items: List[Dict[str, Any]] = []
    for row in rows:
        archive_date = row["archive_date"]
        existing_count = existing_plan_count(conn, archive_date)
        if existing_count and not override_existing:
            items.append({
                "archive_date": archive_date,
                "skipped": True,
                "reason": "structured action plans already exist",
                "existing_count": existing_count,
            })
            continue
        text = row["asset_plan"] or ""
        items.append({
            "archive_date": archive_date,
            "skipped": False,
            "existing_count": existing_count,
            "asset_plan": text,
            "action_plans": parse_asset_plan(archive_date, text, symbols),
        })

    return {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "items": items,
    }


def write_preview_markdown(preview: Dict[str, Any], output_path: Path) -> None:
    lines = ["# Action Plan Migration Preview", ""]
    for item in preview.get("items", []):
        lines.append(f"## {item['archive_date']}")
        if item.get("skipped"):
            lines.append(f"- Skipped: {item.get('reason')}")
            lines.append("")
            continue
        for plan in item.get("action_plans", []):
            lines.extend([
                f"### {plan['symbol']}",
                f"- Action: {plan['action_type']}",
                f"- Position: {plan['current_position']}",
                f"- Entry: {plan['entry_plan'] or '-'}",
                f"- Take profit: {plan['take_profit_plan'] or '-'}",
                f"- Stop loss: {plan['stop_loss_plan'] or '-'}",
                "- Key levels:",
                plan["key_levels"] or "-",
                "- Thinking:",
                plan["thinking"] or "-",
                "",
            ])
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text("\n".join(lines), encoding="utf-8")


def apply_preview(conn: sqlite3.Connection, preview: Dict[str, Any], override_existing: bool) -> int:
    inserted = 0
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    for item in preview.get("items", []):
        if item.get("skipped"):
            continue
        archive_date = item["archive_date"]
        if existing_plan_count(conn, archive_date) and not override_existing:
            continue
        for plan in item.get("action_plans", []):
            symbol = str(plan.get("symbol") or "").strip().upper()
            if not symbol:
                continue
            conn.execute(
                """
                INSERT INTO daily_review_action_plans (
                    archive_date, symbol, action_type, entry_plan, take_profit_plan,
                    stop_loss_plan, key_levels, current_position, thinking,
                    sort_order, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(archive_date, symbol) DO UPDATE SET
                    action_type = excluded.action_type,
                    entry_plan = excluded.entry_plan,
                    take_profit_plan = excluded.take_profit_plan,
                    stop_loss_plan = excluded.stop_loss_plan,
                    key_levels = excluded.key_levels,
                    current_position = excluded.current_position,
                    thinking = excluded.thinking,
                    sort_order = excluded.sort_order,
                    updated_at = excluded.updated_at
                """,
                (
                    archive_date,
                    symbol,
                    normalize_action(plan.get("action_type")),
                    plan.get("entry_plan") or "",
                    plan.get("take_profit_plan") or "",
                    plan.get("stop_loss_plan") or "",
                    plan.get("key_levels") or "",
                    normalize_position(plan.get("current_position")),
                    plan.get("thinking") or "",
                    int(plan.get("sort_order") or 0),
                    now,
                    now,
                ),
            )
            inserted += 1
    conn.commit()
    return inserted


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=["dry-run", "apply"], default="dry-run")
    parser.add_argument("--db", default="output/financial_data.db", help="SQLite DB path")
    parser.add_argument("--preview-json", default=".tests/action_plan_migration_preview.json")
    parser.add_argument("--preview-md", default=".tests/action_plan_migration_preview.md")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--override-existing", action="store_true")
    parser.add_argument("--yes", action="store_true", help="Required for apply mode")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    db_path = Path(args.db)
    if not db_path.exists():
        raise SystemExit(f"Database not found: {db_path}")

    with connect(db_path) as conn:
        if args.mode == "dry-run":
            preview = build_preview(conn, args.limit, args.override_existing)
            json_path = Path(args.preview_json)
            md_path = Path(args.preview_md)
            json_path.parent.mkdir(parents=True, exist_ok=True)
            json_path.write_text(json.dumps(preview, ensure_ascii=False, indent=2), encoding="utf-8")
            write_preview_markdown(preview, md_path)
            print(f"Wrote preview JSON: {json_path}")
            print(f"Wrote preview Markdown: {md_path}")
            return 0

        if not args.yes:
            raise SystemExit("Apply mode requires --yes after reviewing the preview file.")
        preview_path = Path(args.preview_json)
        preview = json.loads(preview_path.read_text(encoding="utf-8"))
        inserted = apply_preview(conn, preview, args.override_existing)
        print(f"Applied {inserted} action plan rows from {preview_path}")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
