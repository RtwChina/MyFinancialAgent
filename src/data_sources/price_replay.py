"""Replay price-source implementation for weekly integration testing."""

from __future__ import annotations

import json
from pathlib import Path

from runtime.context import ExecutionContext


def _candidate_paths(context: ExecutionContext) -> list[Path]:
    """返回按优先级排列的 fixture 文件候选路径列表。

    优先使用精确命名文件（close.json），不存在时回退到通用文件（latest.json）。
    若 context 不具备 replay 所需字段则返回空列表。
    """
    if context.replay_root is None or context.fake_now is None:
        return []
    date_dir = context.replay_root / "prices" / context.fake_now.strftime("%Y-%m-%d")
    # close.json 为该日最终收盘价文件，latest.json 为通用回退
    return [
        date_dir / "close.json",
        date_dir / "latest.json",
    ]


def fetch_all_prices_replay(context: ExecutionContext) -> list[dict]:
    """从 replay fixture 文件中读取历史价格数据，供回放模式使用。"""
    for path in _candidate_paths(context):
        if path.exists():
            with path.open("r", encoding="utf-8") as handle:
                payload = json.load(handle)
            # 兼容两种 fixture 格式：{"items": [...]} 或直接 [...]
            return payload.get("items", []) if isinstance(payload, dict) else payload
    raise FileNotFoundError(
        f"No replay price fixture found for fake_now={context.fake_now} under replay_root={context.replay_root}"
    )
