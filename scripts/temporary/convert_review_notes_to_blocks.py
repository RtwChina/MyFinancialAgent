#!/usr/bin/env python3
"""Convert legacy review market/rotation Markdown into structured note blocks.

The script is intentionally conservative:
- It reads Wrangler D1 --json output.
- It writes preview JSON/Markdown and guarded UPDATE SQL.
- Generated SQL only fills NULL block JSON columns and never changes legacy text.
"""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List


def strip_number_prefix(value: str) -> str:
    return re.sub(r"^\s*\d+[.)、]?\s*", "", str(value or "").strip()).strip()


def split_heading_intro(value: str) -> Dict[str, str]:
    cleaned = strip_number_prefix(value)
    match = re.match(r"^([^：:]{1,28})[：:]\s*(.+)$", cleaned)
    if not match:
        return {"title": cleaned, "intro": ""}
    return {"title": match.group(1).strip(), "intro": match.group(2).strip()}


def split_layer_bullet(line: str) -> Dict[str, str] | None:
    match = re.match(
        r"^\s*[-*]\s*第[一二三四五六七八九十]+层[：:]\s*([^，。；:：]{2,28})[，。；:：]?\s*(.*)$",
        str(line or "").strip(),
    )
    if not match:
        return None
    title = match.group(1).strip()
    rest = match.group(2).strip()
    return {"title": title, "body": f"{title}：{rest}" if rest else title}


def make_id(prefix: str, section_index: int, child_index: int | None = None) -> str:
    if child_index is None:
        return f"{prefix}-{section_index + 1}"
    return f"{prefix}-{section_index + 1}-{child_index + 1}"


def normalize_blocks(blocks: List[Dict[str, Any]], prefix: str) -> List[Dict[str, Any]]:
    normalized = []
    for section_index, section in enumerate(blocks):
        title = strip_number_prefix(str(section.get("title") or "")) or "未命名主题"
        children = []
        for child_index, child in enumerate(section.get("children") or []):
            child_title = strip_number_prefix(str(child.get("title") or "")) or "核心判断"
            body = str(child.get("body") or "").strip()
            if child_title or body:
                children.append({
                    "id": str(child.get("id") or make_id(f"{prefix}-sub", section_index, child_index)),
                    "title": child_title,
                    "body": body,
                })
        if title or children:
            normalized.append({
                "id": str(section.get("id") or make_id(prefix, section_index)),
                "title": title,
                "children": children,
            })
    return normalized


def clean_body_line(line: str) -> str:
    return re.sub(r"^\s*[-*]\s*", "", str(line or "")).strip()


def section_text(section: Dict[str, Any] | None) -> str:
    if not section:
        return ""
    parts = [str(section.get("title") or "")]
    for child in section.get("children") or []:
        parts.extend([str(child.get("title") or ""), str(child.get("body") or "")])
    return "\n".join(part for part in parts if part)


def section_summary(section: Dict[str, Any] | None) -> str:
    if not section:
        return ""
    title = str(section.get("title") or "").strip()
    body = "\n".join(
        str(child.get("body") or "").strip()
        for child in section.get("children") or []
        if str(child.get("body") or "").strip()
    )
    if title and body:
        return f"{title}：{body}"
    return title or body


def split_lines_from_children(section: Dict[str, Any]) -> List[str]:
    lines: List[str] = []
    for child in section.get("children") or []:
        lines.extend(clean_body_line(line) for line in str(child.get("body") or "").splitlines())
    return [line for line in lines if line]


def add_child_if_body(children: List[Dict[str, str]], title: str, value: str | List[str]) -> None:
    values = value if isinstance(value, list) else [value]
    body = "\n".join(clean_body_line(item) for item in values if clean_body_line(item))
    if body:
        children.append({"title": title, "body": body})


def merge_sp_macro_cluster(blocks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    result = []
    index = 0
    while index < len(blocks):
        current = blocks[index]
        next_section = blocks[index + 1] if index + 1 < len(blocks) else None
        third_section = blocks[index + 2] if index + 2 < len(blocks) else None
        current_title = str(current.get("title") or "")
        next_text = section_text(next_section)
        third_text = section_text(third_section)
        should_merge = (
            re.search(r"^标普\s*\d+", current_title)
            and re.search(r"十年期国债|国债", next_text)
            and re.search(r"海峡|重开|战争|布伦特|石油", third_text)
        )

        if not should_merge:
            result.append(current)
            index += 1
            continue

        current_lines = split_lines_from_children(current)
        gex_lines = [line for line in current_lines if re.search(r"GEX|半导体", line)]
        war_lines = [line for line in current_lines if re.search(r"布伦特|石油|危机|战争", line)]
        children: List[Dict[str, str]] = []
        add_child_if_body(children, "GEX", gex_lines)
        add_child_if_body(children, "战争", [*war_lines, section_summary(third_section)])
        add_child_if_body(children, "国债", section_summary(next_section))
        result.append({
            "title": f"标普：{current_title}",
            "children": children,
            "migrationNote": "merged_sp_macro_cluster",
        })
        index += 3
    return result


def normalize_market_point_sections(blocks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    order = ["CTA", "JPM", "支撑"]
    result = []
    for section in blocks:
        title = str(section.get("title") or "")
        only_treasury_risk = (
            re.search(r"十年期国债|国债", title)
            and any(re.search(r"高危失控|强投机", str(child.get("title") or "")) for child in section.get("children") or [])
        )
        if only_treasury_risk:
            continue
        if not re.search(r"标普500分析|标普500点位", title):
            result.append(section)
            continue
        children = []
        for child in section.get("children") or []:
            child_title = str(child.get("title") or "")
            if re.search(r"加速卖出", child_title):
                continue
            if re.search(r"CTA", child_title):
                child = {**child, "title": "CTA流动性"}
            elif re.search(r"JPM", child_title, re.I):
                child = {**child, "title": re.sub(r"\s+", " ", child_title).strip()}
            elif re.search(r"支撑", child_title):
                child = {**child, "title": "支撑"}
            if re.search(r"CTA|JPM|支撑", str(child.get("title") or "")):
                children.append(child)
        children.sort(key=lambda child: next(
            (idx for idx, marker in enumerate(order) if marker in str(child.get("title") or "")),
            99,
        ))
        result.append({
            **section,
            "title": "标普500点位",
            "children": children,
            "migrationNote": "normalized_sp500_points",
        })
    return result


def parse_markdown(text: str, prefix: str) -> List[Dict[str, Any]]:
    raw = str(text or "").strip()
    if not raw:
        return []
    sections: List[Dict[str, Any]] = []
    current_section: Dict[str, Any] | None = None
    current_child: Dict[str, str] | None = None

    def ensure_section() -> Dict[str, Any]:
        nonlocal current_section
        if current_section is None:
            current_section = {"title": "未分类", "children": []}
            sections.append(current_section)
        return current_section

    def ensure_child() -> Dict[str, str]:
        nonlocal current_child
        section = ensure_section()
        if current_child is None:
            current_child = {"title": "核心判断", "body": ""}
            section["children"].append(current_child)
        return current_child

    for line in raw.splitlines():
        h2 = re.match(r"^##\s+(.+)$", line)
        h1 = re.match(r"^#\s+(.+)$", line)
        if h1:
            heading = split_heading_intro(h1.group(1))
            current_section = {"title": heading["title"] or "未命名主题", "children": []}
            sections.append(current_section)
            current_child = None
            if heading["intro"]:
                current_child = {"title": "核心判断", "body": heading["intro"]}
                current_section["children"].append(current_child)
            continue
        if h2:
            heading = split_heading_intro(h2.group(1))
            section = ensure_section()
            current_child = {"title": heading["title"] or "未命名维度", "body": heading["intro"] or ""}
            section["children"].append(current_child)
            continue
        layer = split_layer_bullet(line)
        if layer and current_section is not None:
            current_child = {"title": layer["title"], "body": layer["body"]}
            current_section["children"].append(current_child)
            continue
        child = ensure_child()
        child["body"] = f"{child['body']}\n{line}" if child["body"] else line

    return normalize_blocks(
        normalize_market_point_sections(merge_sp_macro_cluster(normalize_blocks(sections, prefix))),
        prefix,
    )


def inspect_blocks(blocks: List[Dict[str, Any]], raw: str) -> List[str]:
    warnings = []
    if not blocks and str(raw or "").strip():
        warnings.append("纯文本兜底")
    for section in blocks:
        title = str(section.get("title") or "")
        if not section.get("children"):
            warnings.append(f"{title}: no children")
        if re.search(r"操作计划|加仓|清空", title):
            warnings.append(f"{title}: possible legacy action-plan content")
        for child in section.get("children") or []:
            if not str(child.get("body") or "").strip():
                warnings.append(f"{title}/{child.get('title')}: empty body")
    return warnings


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


def sql_literal(value: str) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def build_preview(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    items = []
    for row in rows:
        archive_date = str(row.get("archive_date") or "").strip()
        if not archive_date:
            continue
        market_text = str(row.get("market_sentiment") or "")
        sector_text = str(row.get("sector_rotation") or "")
        market_blocks = parse_markdown(market_text, "market") if market_text.strip() else []
        sector_blocks = parse_markdown(sector_text, "rotation") if sector_text.strip() else []
        items.append({
            "archive_date": archive_date,
            "review_status": row.get("review_status") or "",
            "market": {
                "source_length": len(market_text),
                "blocks": market_blocks,
                "warnings": inspect_blocks(market_blocks, market_text),
                "skip_apply": not market_blocks or row.get("market_sentiment_blocks_json"),
            },
            "rotation": {
                "source_length": len(sector_text),
                "blocks": sector_blocks,
                "warnings": inspect_blocks(sector_blocks, sector_text),
                "skip_apply": not sector_blocks or row.get("sector_rotation_blocks_json"),
            },
        })
    return {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "item_count": len(items),
        "items": items,
    }


def write_preview_markdown(preview: Dict[str, Any], output_path: Path) -> None:
    lines = ["# Review Note Blocks Migration Preview", ""]
    for item in preview["items"]:
        lines.append(f"## {item['archive_date']} ({item['review_status']})")
        for field in ("market", "rotation"):
            data = item[field]
            lines.append("")
            lines.append(f"### {field}")
            lines.append(f"- blocks: {len(data['blocks'])}")
            lines.append(f"- warnings: {len(data['warnings'])}")
            for warning in data["warnings"]:
                lines.append(f"  - {warning}")
            for section in data["blocks"]:
                lines.append(f"- {section['title']}")
                for child in section.get("children") or []:
                    body = str(child.get("body") or "").replace("\n", " ")[:100]
                    lines.append(f"  - {child['title']}: {body}")
        lines.append("")
    output_path.write_text("\n".join(lines), encoding="utf-8")


def write_update_sql(preview: Dict[str, Any], output_path: Path) -> int:
    statements = [
        "-- Generated by scripts/temporary/convert_review_notes_to_blocks.py",
        "-- Legacy market_sentiment / sector_rotation text is intentionally preserved.",
    ]
    count = 0
    for item in preview["items"]:
        archive_date = item["archive_date"]
        market_blocks = item["market"]["blocks"]
        sector_blocks = item["rotation"]["blocks"]
        if market_blocks and not item["market"]["skip_apply"]:
            statements.append(
                "UPDATE daily_review_archive "
                f"SET market_sentiment_blocks_json = {sql_literal(json.dumps(market_blocks, ensure_ascii=False, separators=(',', ':')))} "
                f"WHERE archive_date = {sql_literal(archive_date)} AND market_sentiment_blocks_json IS NULL;"
            )
            count += 1
        if sector_blocks and not item["rotation"]["skip_apply"]:
            statements.append(
                "UPDATE daily_review_archive "
                f"SET sector_rotation_blocks_json = {sql_literal(json.dumps(sector_blocks, ensure_ascii=False, separators=(',', ':')))} "
                f"WHERE archive_date = {sql_literal(archive_date)} AND sector_rotation_blocks_json IS NULL;"
            )
            count += 1
    output_path.write_text("\n".join(statements) + "\n", encoding="utf-8")
    return count


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-json", required=True, help="Wrangler D1 --json output containing review rows")
    parser.add_argument("--preview-json", default=".tests/review_note_blocks_migration_preview.json")
    parser.add_argument("--preview-md", default=".tests/review_note_blocks_migration_preview.md")
    parser.add_argument("--update-sql", default=".tests/review_note_blocks_migration_apply.sql")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    source_path = Path(args.source_json)
    preview_json = Path(args.preview_json)
    preview_md = Path(args.preview_md)
    update_sql = Path(args.update_sql)
    rows = extract_wranger_results(json.loads(source_path.read_text(encoding="utf-8")))
    preview = build_preview(rows)
    preview_json.parent.mkdir(parents=True, exist_ok=True)
    preview_json.write_text(json.dumps(preview, ensure_ascii=False, indent=2), encoding="utf-8")
    write_preview_markdown(preview, preview_md)
    sql_count = write_update_sql(preview, update_sql)
    warning_count = sum(
        len(item["market"]["warnings"]) + len(item["rotation"]["warnings"])
        for item in preview["items"]
    )
    print(f"Wrote preview JSON: {preview_json}")
    print(f"Wrote preview Markdown: {preview_md}")
    print(f"Wrote guarded update SQL: {update_sql} ({sql_count} statements)")
    print(f"Rows: {len(preview['items'])}, warnings: {warning_count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
