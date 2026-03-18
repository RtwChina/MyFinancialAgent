"""Execution context builder for environment-aware task runs.

The context centralizes runtime mode, data-source mode, replay root, and the
clock instance so that task code can remain explicit without scattering
environment conditionals throughout the business flow.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from runtime.clock import Clock, FixedClock, SystemClock


DEFAULT_REPLAY_ROOT = Path("tests/cases/fixtures/replay")
VALID_APP_ENVS = {"local", "test", "prod"}
VALID_TEST_MODES = {"none", "integration_weekly"}
VALID_DATA_MODES = {"live", "replay", "hybrid"}


@dataclass(frozen=True)
class ExecutionContext:
    """Runtime envelope for one task execution.

    It tells downstream code what environment we are in, whether this run is a
    weekly integration simulation, and which clock/data-source mode should be
    used. It does not hold business data or persistence state.
    """

    app_env: str
    test_mode: str
    data_mode: str
    fake_now: datetime | None
    replay_root: Path | None
    clock: Clock

    @property
    def is_weekly_integration(self) -> bool:
        return self.test_mode == "integration_weekly"

    def is_historical_replay_run(self) -> bool:
        if self.data_mode == "replay":
            return True
        if self.data_mode != "hybrid" or self.fake_now is None:
            return False
        real_today = datetime.now().astimezone().date()
        return self.fake_now.astimezone().date() != real_today


def _parse_fake_now(value: str | None) -> datetime | None:
    if not value:
        return None
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        return parsed.astimezone()
    return parsed


def build_execution_context(
    *,
    app_env: str | None = None,
    test_mode: str | None = None,
    data_mode: str | None = None,
    fake_now: str | None = None,
    replay_root: str | None = None,
) -> ExecutionContext:
    """Build a validated execution context from explicit args or env vars."""

    resolved_app_env = (app_env or os.getenv("APP_ENV", "local")).strip().lower()
    resolved_test_mode = (test_mode or os.getenv("TEST_MODE", "none")).strip().lower()
    resolved_data_mode = (data_mode or os.getenv("DATA_MODE", "live")).strip().lower()
    resolved_fake_now = _parse_fake_now(fake_now or os.getenv("FAKE_NOW"))
    resolved_replay_root = Path(replay_root or os.getenv("REPLAY_ROOT", DEFAULT_REPLAY_ROOT.as_posix()))

    if resolved_app_env not in VALID_APP_ENVS:
        raise ValueError(f"Invalid APP_ENV: {resolved_app_env}")
    if resolved_test_mode not in VALID_TEST_MODES:
        raise ValueError(f"Invalid TEST_MODE: {resolved_test_mode}")
    if resolved_data_mode not in VALID_DATA_MODES:
        raise ValueError(f"Invalid DATA_MODE: {resolved_data_mode}")

    if resolved_app_env == "prod":
        resolved_test_mode = "none"
        resolved_data_mode = "live"
        resolved_fake_now = None

    clock: Clock = FixedClock(resolved_fake_now) if resolved_fake_now else SystemClock()
    return ExecutionContext(
        app_env=resolved_app_env,
        test_mode=resolved_test_mode,
        data_mode=resolved_data_mode,
        fake_now=resolved_fake_now,
        replay_root=resolved_replay_root,
        clock=clock,
    )
