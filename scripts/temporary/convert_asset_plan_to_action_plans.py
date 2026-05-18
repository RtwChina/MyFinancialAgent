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
POSITION_VALUES = ("0%", "0-5%", "5%-10%", "10%-15%", "15%-20%", "20%-25%", "25%-30%", ">30%")


def connect(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def normalize_action(value: str | None) -> str:
    text = (value or "").strip()
    return text if text in ACTION_VALUES else "持仓观察"


def normalize_position(value: str | None) -> str:
    text = (value or "").strip()
    return text if text in POSITION_VALUES else "0-5%"


def percent_to_position(percent: float | None) -> str:
    if percent is None:
        return "0-5%"
    if percent <= 0:
        return "0%"
    if percent > 30:
        return ">30%"
    if percent > 25:
        return "25%-30%"
    if percent > 20:
        return "20%-25%"
    if percent > 15:
        return "15%-20%"
    if percent > 10:
        return "10%-15%"
    if percent > 5:
        return "5%-10%"
    return "0-5%"


def fetch_symbol_records(conn: sqlite3.Connection) -> List[Dict[str, str]]:
    try:
        rows = conn.execute(
            "SELECT symbol, display_name, aliases FROM tracked_symbols WHERE is_active = 1 ORDER BY sort_order, symbol",
        ).fetchall()
        records = [
            {
                "symbol": str(row["symbol"]).strip(),
                "display_name": str(row["display_name"] or "").strip(),
                "aliases": str(row["aliases"] or "").strip(),
            }
            for row in rows if row["symbol"]
        ]
    except sqlite3.Error:
        records = []
    defaults = ["AMD", "LITE", "MSFT", "GOOGL", "MU", "BABA", "CASH", "SPY", "QQQ"]
    known = {record["symbol"].upper() for record in records}
    for symbol in defaults:
        if symbol.upper() not in known:
            records.append({"symbol": symbol, "display_name": "", "aliases": ""})
    return records


def build_symbol_lookup(records: List[Dict[str, str]]) -> Dict[str, str]:
    lookup: Dict[str, str] = {}
    for record in records:
        symbol = record["symbol"].strip()
        if not symbol:
            continue
        candidates = [symbol, record.get("display_name", "")]
        try:
            aliases = json.loads(record.get("aliases") or "[]")
            if isinstance(aliases, list):
                candidates.extend(str(item) for item in aliases)
        except json.JSONDecodeError:
            pass
        for candidate in candidates:
            key = normalize_lookup_key(candidate)
            if key:
                lookup[key] = symbol
    return lookup


def normalize_lookup_key(value: str | None) -> str:
    return re.sub(r"\s+", "", str(value or "").strip()).upper()


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
    if re.search(r"已经清空|已清仓|已清空|清仓复盘", text):
        return "已清仓复盘"
    if re.search(r"准备开仓|等待.*开仓|计划开仓", text):
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


def split_asset_plan_sections(text: str) -> List[Dict[str, str]]:
    marker = re.compile(r"^\s*~{3,}\s*(.*?)\s*~{3,}\s*$")
    sections: List[Dict[str, str]] = []
    current_title = ""
    current_lines: List[str] = []

    for line in text.splitlines():
        match = marker.match(line)
        if match:
            if current_title or current_lines:
                sections.append({"title": current_title, "body": "\n".join(current_lines).strip()})
            current_title = match.group(1).strip()
            current_lines = []
            continue
        current_lines.append(line)

    if current_title or current_lines:
        sections.append({"title": current_title, "body": "\n".join(current_lines).strip()})

    return [section for section in sections if section["body"]]


def detect_section_symbol(title: str, body: str, lookup: Dict[str, str]) -> str:
    candidates = [title]
    heading = re.search(r"^\s*#\s*([^：:\n#]+)", body, re.M)
    if heading:
        candidates.append(heading.group(1))

    for candidate in candidates:
        cleaned = re.sub(r"[#：:，,。].*$", "", candidate).strip()
        for key, symbol in lookup.items():
            if key and key in normalize_lookup_key(cleaned):
                return symbol
        if cleaned:
            return cleaned
    return "CASH"


LABEL_PREFIX = r"(?:支撑位|压力位|上方压力|下方支撑|止盈计划|止损计划|开仓计划|操作计划|思考|深度思考)"


def clean_labeled_line(line: str) -> str:
    return re.sub(
        rf"^\s*[-*]?\s*(?:#{{1,3}}\s*)?{LABEL_PREFIX}\s*(?:\([^)]*\))?\s*[：:]?\s*",
        "",
        line,
        flags=re.I,
    ).strip()


def is_section_label(line: str, labels: Iterable[str]) -> bool:
    label_alt = "|".join(labels)
    return bool(re.match(rf"^\s*[-*]?\s*(?:#{{1,3}}\s*)?(?:{label_alt})\s*(?:\([^)]*\))?\s*[：:]?", line, re.I))


def extract_labeled_block(lines: List[str], labels: Iterable[str]) -> str:
    stop = re.compile(rf"^\s*[-*]?\s*(?:#{{1,3}}\s*)?{LABEL_PREFIX}\s*(?:\([^)]*\))?\s*[：:]?", re.I)
    selected: List[str] = []
    in_block = False
    for line in lines:
        stripped = line.strip()
        if not stripped:
            if in_block:
                selected.append("")
            continue
        if is_section_label(stripped, labels):
            in_block = True
            cleaned = clean_labeled_line(stripped)
            if cleaned.strip("、:-： "):
                selected.append(cleaned)
            continue
        if in_block and stop.match(stripped):
            break
        if in_block and re.match(r"^\s*#{1,3}\s+", stripped):
            break
        if in_block:
            selected.append(stripped)
    return "\n".join(line for line in selected if line).strip()


def extract_trade_label_block(lines: List[str], labels: Iterable[str]) -> str:
    selected: List[str] = []
    in_block = False
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        if is_section_label(stripped, labels):
            in_block = True
            cleaned = clean_labeled_line(stripped)
            if cleaned.strip("、:-： "):
                selected.append(cleaned)
            continue
        if in_block and (stripped.startswith("- ") or re.match(r"^\s*#{1,3}\s+", stripped) or is_section_label(stripped, LABEL_PREFIX.split("|"))):
            break
        if in_block:
            selected.append(stripped)
    return "\n".join(line for line in selected if line).strip()


def parse_plan_chunk(archive_date: str, symbol: str, chunk: str, sort_order: int) -> Dict[str, Any]:
    lines = [line.strip() for line in chunk.splitlines() if line.strip()]
    action_type = detect_action(chunk)
    current_position = "0%" if action_type in {"准备开仓", "已清仓复盘"} else detect_position(chunk)
    support_levels = extract_labeled_block(lines, [r"支撑位|support"])
    resistance_levels = extract_labeled_block(lines, [r"压力位|resistance"])
    key_levels = "\n\n".join(
        section for section in [
            f"支撑位：\n{support_levels}" if support_levels else "",
            f"压力位：\n{resistance_levels}" if resistance_levels else "",
        ] if section
    )
    return {
        "archive_date": archive_date,
        "symbol": symbol,
        "action_type": action_type,
        "current_position": current_position,
        "entry_plan": extract_trade_label_block(lines, ["开仓计划", "操作计划"]),
        "take_profit_plan": extract_trade_label_block(lines, ["止盈计划"]),
        "stop_loss_plan": extract_trade_label_block(lines, ["止损计划"]),
        "key_levels": key_levels,
        "support_levels": support_levels,
        "resistance_levels": resistance_levels,
        "thinking": chunk,
        "sort_order": sort_order,
        "migration_note": "temporary parser draft; review before apply",
    }


def parse_asset_plan(archive_date: str, text: str, symbol_records: List[Dict[str, str]]) -> List[Dict[str, Any]]:
    lookup = build_symbol_lookup(symbol_records)
    sections = split_asset_plan_sections(text)
    if sections:
        return [
            parse_plan_chunk(
                archive_date,
                detect_section_symbol(section["title"], section["body"], lookup),
                section["body"],
                sort_order,
            )
            for sort_order, section in enumerate(sections)
        ]

    plans: List[Dict[str, Any]] = []
    symbols = [record["symbol"].strip().upper() for record in symbol_records if record["symbol"]]
    upper_text = text.upper()
    matched_symbols = [symbol for symbol in symbols if re.search(rf"(^|[^A-Z0-9]){re.escape(symbol)}([^A-Z0-9]|$)", upper_text)]

    if not matched_symbols and text.strip():
      matched_symbols = ["CASH"]

    for sort_order, symbol in enumerate(matched_symbols):
        chunk = split_text_for_symbol(text, symbol) if symbol != "CASH" else text
        if not chunk:
            chunk = text
        plans.append(parse_plan_chunk(archive_date, symbol, chunk, sort_order))
    return plans


def build_preview(conn: sqlite3.Connection, limit: int | None, override_existing: bool) -> Dict[str, Any]:
    symbol_records = fetch_symbol_records(conn)
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
            "action_plans": parse_asset_plan(archive_date, text, symbol_records),
        })

    return {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "items": items,
    }


def extract_wranger_results(data: Any) -> List[Dict[str, Any]]:
    if isinstance(data, list):
        rows: List[Dict[str, Any]] = []
        for item in data:
            if isinstance(item, dict) and isinstance(item.get("results"), list):
                rows.extend(row for row in item["results"] if isinstance(row, dict))
        return rows
    if isinstance(data, dict) and isinstance(data.get("results"), list):
        return [row for row in data["results"] if isinstance(row, dict)]
    raise ValueError("Unsupported JSON input. Expected Wrangler D1 --json output.")


def build_preview_from_rows(
    rows: List[Dict[str, Any]],
    symbol_records: List[Dict[str, str]],
    limit: int | None,
) -> Dict[str, Any]:
    if limit:
        rows = rows[:limit]
    items = []
    for row in rows:
        archive_date = str(row.get("archive_date") or "").strip()
        text = str(row.get("asset_plan") or "")
        if not archive_date or not text.strip():
            continue
        items.append({
            "archive_date": archive_date,
            "skipped": False,
            "existing_count": int(row.get("existing_count") or 0),
            "asset_plan": text,
            "action_plans": parse_asset_plan(archive_date, text, symbol_records),
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
                "- Support levels:",
                plan["support_levels"] or "-",
                "- Resistance levels:",
                plan["resistance_levels"] or "-",
                "- Thinking:",
                plan["thinking"] or "-",
                "",
            ])
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text("\n".join(lines), encoding="utf-8")


def sql_quote(value: Any) -> str:
    return "'" + str(value or "").replace("'", "''") + "'"


def write_insert_sql(preview: Dict[str, Any], output_path: Path) -> int:
    columns = [
        "archive_date",
        "account_id",
        "symbol",
        "action_type",
        "entry_plan",
        "take_profit_plan",
        "stop_loss_plan",
        "key_levels",
        "support_levels",
        "resistance_levels",
        "current_position",
        "thinking",
        "market_type",
        "sort_order",
        "created_at",
        "updated_at",
    ]
    statements = [
        "-- Generated from reviewed legacy daily_review_archive.asset_plan data.",
        "-- The original asset_plan text is preserved in daily_review_archive.",
        "BEGIN TRANSACTION;",
    ]
    inserted = 0
    for item in preview.get("items", []):
        if item.get("skipped"):
            continue
        for plan in item.get("action_plans", []):
            symbol = str(plan.get("symbol") or "").strip()
            if not symbol:
                continue
            values = [
                item["archive_date"],
                int(plan.get("account_id") or 4),
                symbol,
                normalize_action(plan.get("action_type")),
                plan.get("entry_plan") or "",
                plan.get("take_profit_plan") or "",
                plan.get("stop_loss_plan") or "",
                plan.get("key_levels") or "",
                plan.get("support_levels") or "",
                plan.get("resistance_levels") or "",
                normalize_position(plan.get("current_position")),
                plan.get("thinking") or "",
                plan.get("market_type") or "美股",
                int(plan.get("sort_order") or 0),
                "CURRENT_TIMESTAMP",
                "CURRENT_TIMESTAMP",
            ]
            sql_values = [
                str(value) if column in {"account_id", "sort_order"} else "CURRENT_TIMESTAMP" if column in {"created_at", "updated_at"} else sql_quote(value)
                for column, value in zip(columns, values)
            ]
            statements.append(
                "INSERT INTO daily_review_action_plans ("
                + ", ".join(columns)
                + ") VALUES ("
                + ", ".join(sql_values)
                + ") ON CONFLICT(archive_date, account_id, symbol) DO UPDATE SET "
                + ", ".join(
                    f"{column} = excluded.{column}"
                    for column in columns
                    if column not in {"archive_date", "account_id", "symbol", "created_at"}
                )
                + ";"
            )
            inserted += 1
    statements.append("COMMIT;")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text("\n".join(statements) + "\n", encoding="utf-8")
    return inserted


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
	                    archive_date, account_id, symbol, action_type, entry_plan, take_profit_plan,
	                    stop_loss_plan, key_levels, support_levels, resistance_levels,
	                    current_position, thinking, market_type, sort_order, created_at, updated_at
	                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(archive_date, account_id, symbol) DO UPDATE SET
                    action_type = excluded.action_type,
                    entry_plan = excluded.entry_plan,
                    take_profit_plan = excluded.take_profit_plan,
	                    stop_loss_plan = excluded.stop_loss_plan,
	                    key_levels = excluded.key_levels,
	                    support_levels = excluded.support_levels,
	                    resistance_levels = excluded.resistance_levels,
                    current_position = excluded.current_position,
                    thinking = excluded.thinking,
                    market_type = excluded.market_type,
                    sort_order = excluded.sort_order,
                    updated_at = excluded.updated_at
                """,
                (
                    archive_date,
                    int(plan.get("account_id") or 4),
                    symbol,
                    normalize_action(plan.get("action_type")),
                    plan.get("entry_plan") or "",
                    plan.get("take_profit_plan") or "",
	                    plan.get("stop_loss_plan") or "",
	                    plan.get("key_levels") or "",
	                    plan.get("support_levels") or "",
	                    plan.get("resistance_levels") or "",
                    normalize_position(plan.get("current_position")),
                    plan.get("thinking") or "",
                    plan.get("market_type") or "美股",
                    int(plan.get("sort_order") or 0),
                    now,
                    now,
                ),
            )
            inserted += 1
    conn.commit()
    return inserted


def count_unassigned_action_plans(conn: sqlite3.Connection) -> int:
    row = conn.execute(
        """
        SELECT COUNT(*) AS cnt
        FROM daily_review_action_plans p
        JOIN investment_accounts a ON a.id = p.account_id
        WHERE a.name = '未分配账户'
        """
    ).fetchone()
    return int(row["cnt"] if row else 0)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=["dry-run", "apply"], default="dry-run")
    parser.add_argument("--db", default="output/financial_data.db", help="SQLite DB path")
    parser.add_argument("--source-json", default="", help="Wrangler D1 --json output containing archive_date and asset_plan")
    parser.add_argument("--symbols-json", default="", help="Wrangler D1 --json output containing tracked_symbols rows")
    parser.add_argument("--preview-json", default=".tests/action_plan_migration_preview.json")
    parser.add_argument("--preview-md", default=".tests/action_plan_migration_preview.md")
    parser.add_argument("--insert-sql", default="", help="Optional SQL file generated from the preview")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--override-existing", action="store_true")
    parser.add_argument("--yes", action="store_true", help="Required for apply mode")
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    if args.source_json:
        source_path = Path(args.source_json)
        symbols_path = Path(args.symbols_json)
        if not source_path.exists():
            raise SystemExit(f"Source JSON not found: {source_path}")
        if not symbols_path.exists():
            raise SystemExit("--symbols-json is required when using --source-json")
        source_rows = extract_wranger_results(json.loads(source_path.read_text(encoding="utf-8")))
        symbol_rows = extract_wranger_results(json.loads(symbols_path.read_text(encoding="utf-8")))
        symbol_records = [
            {
                "symbol": str(row.get("symbol") or "").strip(),
                "display_name": str(row.get("display_name") or "").strip(),
                "aliases": str(row.get("aliases") or "").strip(),
            }
            for row in symbol_rows if row.get("symbol")
        ]
        preview = build_preview_from_rows(source_rows, symbol_records, args.limit)
        json_path = Path(args.preview_json)
        md_path = Path(args.preview_md)
        json_path.parent.mkdir(parents=True, exist_ok=True)
        json_path.write_text(json.dumps(preview, ensure_ascii=False, indent=2), encoding="utf-8")
        write_preview_markdown(preview, md_path)
        print(f"Wrote preview JSON: {json_path}")
        print(f"Wrote preview Markdown: {md_path}")
        if args.insert_sql:
            count = write_insert_sql(preview, Path(args.insert_sql))
            print(f"Wrote insert SQL: {args.insert_sql} ({count} rows)")
        return 0

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
            if args.insert_sql:
                count = write_insert_sql(preview, Path(args.insert_sql))
                print(f"Wrote insert SQL: {args.insert_sql} ({count} rows)")
            return 0

        if not args.yes:
            raise SystemExit("Apply mode requires --yes after reviewing the preview file.")
        preview_path = Path(args.preview_json)
        preview = json.loads(preview_path.read_text(encoding="utf-8"))
        inserted = apply_preview(conn, preview, args.override_existing)
        print(f"Applied {inserted} action plan rows from {preview_path}")
        print(f"Unassigned action plan rows: {count_unassigned_action_plans(conn)}")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
