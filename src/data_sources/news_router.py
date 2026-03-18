"""News-source router for live, replay, and hybrid execution modes."""

from __future__ import annotations

from runtime.context import ExecutionContext

from data_sources.news_replay import fetch_all_news_replay
from data_sources.news_live import fetch_all_news_live


def fetch_all_news(context: ExecutionContext) -> list[dict]:
    """Return raw news items from the source mode selected by execution context."""

    if context.data_mode == "replay":
        return fetch_all_news_replay(context)
    if context.data_mode == "hybrid" and context.is_historical_replay_run():
        return fetch_all_news_replay(context)
    return fetch_all_news_live(context)
