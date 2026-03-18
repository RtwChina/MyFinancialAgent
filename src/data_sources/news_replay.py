"""Replay news-source implementation for weekly integration testing.

Replay fixtures store standardized news items rather than raw HTTP payloads.
That keeps weekly system simulation stable and focused on task behavior.
"""

from __future__ import annotations

import json
from pathlib import Path

from runtime.context import ExecutionContext


def _candidate_paths(context: ExecutionContext) -> list[Path]:
    """返回按优先级排列的新闻 fixture 文件候选路径。

    优先匹配与 fake_now 时分对应的精确时间槽文件（如 09-30.json），
    不存在时回退到该日的通用文件（latest.json）。
    """
    if context.replay_root is None or context.fake_now is None:
        return []
    fake_now = context.fake_now
    date_dir = context.replay_root / "news" / fake_now.strftime("%Y-%m-%d")
    # slot 格式为 HH-MM，与 fixture 文件命名规范一致
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
            # 兼容两种 fixture 格式：{"items": [...]} 或直接 [...]
            return payload.get("items", []) if isinstance(payload, dict) else payload
    raise FileNotFoundError(
        f"No replay news fixture found for fake_now={context.fake_now} under replay_root={context.replay_root}"
    )
