"""Replay price-source implementation for weekly integration testing."""

from __future__ import annotations

import json
from pathlib import Path

from runtime.context import ExecutionContext


def _candidate_paths(context: ExecutionContext) -> list[Path]:
    if context.replay_root is None or context.fake_now is None:
        return []
    date_dir = context.replay_root / "prices" / context.fake_now.strftime("%Y-%m-%d")
    return [
        date_dir / "close.json",
        date_dir / "latest.json",
    ]


def fetch_all_prices_replay(context: ExecutionContext) -> list[dict]:
    for path in _candidate_paths(context):
        if path.exists():
            with path.open("r", encoding="utf-8") as handle:
                payload = json.load(handle)
            return payload.get("items", []) if isinstance(payload, dict) else payload
    raise FileNotFoundError(
        f"No replay price fixture found for fake_now={context.fake_now} under replay_root={context.replay_root}"
    )
