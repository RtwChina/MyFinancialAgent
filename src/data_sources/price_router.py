"""Price-source router for live, replay, and hybrid execution modes."""

from __future__ import annotations

from runtime.context import ExecutionContext

from data_sources.price_live import fetch_all_prices_live
from data_sources.price_replay import fetch_all_prices_replay


def fetch_all_prices(context: ExecutionContext) -> list[dict]:
    if context.data_mode == "replay":
        return fetch_all_prices_replay(context)
    if context.data_mode == "hybrid" and context.is_historical_replay_run():
        return fetch_all_prices_replay(context)
    return fetch_all_prices_live(context)
