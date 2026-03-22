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


# 回放数据默认根目录，可通过环境变量 REPLAY_ROOT 覆盖
DEFAULT_REPLAY_ROOT = Path("tests/cases/fixtures/replay")
# 合法枚举值集合，用于构建时校验，防止拼写错误的环境变量被静默接受
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
    def is_local_env(self) -> bool:
        """test 和 local 均视为本地环境，prod 不执行本地专属操作。"""
        return self.app_env in ("local", "test")

    @property
    def is_weekly_integration(self) -> bool:
        return self.test_mode == "integration_weekly"

    def is_historical_replay_run(self) -> bool:
        """判断本次执行是否为历史回放模式。
        纯 replay 模式直接返回 True；hybrid 模式下仅当 fake_now 与真实今天不同才视为回放。
        """
        if self.data_mode == "replay":
            return True
        if self.data_mode != "hybrid" or self.fake_now is None:
            return False
        # hybrid 模式：fake_now 与实际当天相同则视为"当日模拟"，不算历史回放
        real_today = datetime.now().astimezone().date()
        return self.fake_now.astimezone().date() != real_today


def _parse_fake_now(value: str | None) -> datetime | None:
    """将 FAKE_NOW 环境变量字符串解析为带时区的 datetime。
    若字符串不含时区信息，则自动附加本机本地时区，保持全链路时区一致。
    """
    if not value:
        return None
    parsed = datetime.fromisoformat(value)
    # 无时区信息时附加本地时区，避免与带时区的 datetime 做 naive/aware 混合比较
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

    # prod 环境强制锁定为真实数据模式，防止意外注入测试参数
    if resolved_app_env == "prod":
        resolved_test_mode = "none"
        resolved_data_mode = "live"
        resolved_fake_now = None

    # 有 fake_now 时使用固定时钟（回放/测试），否则使用系统时钟（生产）
    clock: Clock = FixedClock(resolved_fake_now) if resolved_fake_now else SystemClock()
    return ExecutionContext(
        app_env=resolved_app_env,
        test_mode=resolved_test_mode,
        data_mode=resolved_data_mode,
        fake_now=resolved_fake_now,
        replay_root=resolved_replay_root,
        clock=clock,
    )
