"""News-source router for live, replay, and hybrid execution modes."""

from __future__ import annotations

from runtime.context import ExecutionContext

from data_sources.news_replay import fetch_all_news_replay
from data_sources.news_live import fetch_all_news_live


def fetch_all_news(context: ExecutionContext) -> list[dict]:
    """根据执行上下文的 data_mode 分发到对应新闻数据源。

    - replay：完全使用 fixture 文件，适用于集成测试回放
    - hybrid + 历史回放：同样走 fixture，避免对历史日期调用实时接口
    - 其他（live）：并发拉取四个真实新闻源
    """
    if context.data_mode == "replay":
        return fetch_all_news_replay(context)
    # hybrid 模式下若当前运行的是历史日期，也应使用 replay 数据而非实时接口
    if context.data_mode == "hybrid" and context.is_historical_replay_run():
        return fetch_all_news_replay(context)
    return fetch_all_news_live(context)
