"""Common types for price-source implementations."""

from __future__ import annotations

from typing import Protocol

from runtime.context import ExecutionContext


# 使用 Protocol 定义结构化子类型（structural subtyping），
# 而非继承，使 live / replay 实现解耦，只需满足接口即可
class PriceSource(Protocol):
    """Unified interface for price inputs before persistence."""

    def fetch_all(self, context: ExecutionContext) -> list[dict]:
        ...
