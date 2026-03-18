"""Common types for news-source implementations."""

from __future__ import annotations

from typing import Protocol

from runtime.context import ExecutionContext


class NewsSource(Protocol):
    """Unified interface for news inputs before rule filtering and LLM steps."""

    def fetch_all(self, context: ExecutionContext) -> list[dict]:
        ...
