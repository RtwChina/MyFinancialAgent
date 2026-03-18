"""Common types for news-source implementations."""

from __future__ import annotations

from typing import Protocol

from runtime.context import ExecutionContext


# 与 PriceSource 同理，使用 Protocol 实现结构化接口，
# live / replay 实现无需显式继承，满足方法签名即可通过类型检查
class NewsSource(Protocol):
    """Unified interface for news inputs before rule filtering and LLM steps."""

    def fetch_all(self, context: ExecutionContext) -> list[dict]:
        ...
