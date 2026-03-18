"""Common types for price-source implementations."""

from __future__ import annotations

from typing import Protocol

from runtime.context import ExecutionContext


class PriceSource(Protocol):
    """Unified interface for price inputs before persistence."""

    def fetch_all(self, context: ExecutionContext) -> list[dict]:
        ...
