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
        return self.now().astimezone(ZoneInfo(tz_name))


class SystemClock(Clock):
    """Runtime clock for normal production and development execution."""

    def now(self) -> datetime:
        return datetime.now().astimezone()


@dataclass(frozen=True)
class FixedClock(Clock):
    """Deterministic clock for integration replay and virtual-time execution."""

    fixed_now: datetime

    def now(self) -> datetime:
        return self.fixed_now
