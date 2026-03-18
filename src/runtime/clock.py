"""Centralized time primitives for application runtime.

This module exists to prevent business code from scattering direct
`datetime.now()` calls across the project. Production uses `SystemClock`;
tests can supply `FixedClock` to simulate historical execution windows.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from zoneinfo import ZoneInfo


class Clock:
    """Small clock interface shared by production and integration tests."""

    def now(self) -> datetime:
        raise NotImplementedError

    def today(self) -> date:
        return self.now().date()

    def now_in_tz(self, tz_name: str) -> datetime:
        # 将当前时刻转换为指定时区，用于处理不同市场的交易时间判断
        return self.now().astimezone(ZoneInfo(tz_name))


class SystemClock(Clock):
    """Runtime clock for normal production and development execution."""

    def now(self) -> datetime:
        return datetime.now(tz=ZoneInfo("Asia/Shanghai"))


@dataclass(frozen=True)
class FixedClock(Clock):
    """Deterministic clock for integration replay and virtual-time execution."""

    fixed_now: datetime  # 固定时间点，整个回放周期内保持不变

    def now(self) -> datetime:
        return self.fixed_now
