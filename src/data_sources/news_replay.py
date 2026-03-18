"""Replay news-source implementation for weekly integration testing.

Replay fixtures store standardized news items rather than raw HTTP payloads.
That keeps weekly system simulation stable and focused on task behavior.
"""

from __future__ import annotations

import json
from pathlib import Path

from runtime.context import ExecutionContext


def _candidate_paths(context: ExecutionContext) -> list[Path]:
    if context.replay_root is None or context.fake_now is None:
        return []
    fake_now = context.fake_now
    date_dir = context.replay_root / "news" / fake_now.strftime("%Y-%m-%d")
    slot = fake_now.strftime("%H-%M")
    return [
        date_dir / f"{slot}.json",
        date_dir / "latest.json",
    ]


def fetch_all_news_replay(context: ExecutionContext) -> list[dict]:
    """Load replay news from standardized fixture files for the fake timestamp."""

    for path in _candidate_paths(context):
        if path.exists():
            with path.open("r", encoding="utf-8") as handle:
                payload = json.load(handle)
            return payload.get("items", []) if isinstance(payload, dict) else payload
    raise FileNotFoundError(
        f"No replay news fixture found for fake_now={context.fake_now} under replay_root={context.replay_root}"
    )
