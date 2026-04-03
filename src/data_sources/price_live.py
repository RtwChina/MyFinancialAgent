"""Live price-source implementation backed by yfinance."""

from __future__ import annotations

import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pandas as pd
import yfinance as yf

from logger_utils import get_logger
from runtime.context import ExecutionContext
from symbol_registry import get_tracked_symbols, get_yahoo_symbol


logger = get_logger("price_live")
# 拉取单只标的时的最大重试次数及每次重试的基础等待秒数
PRICE_FETCH_RETRIES = 3
PRICE_FETCH_RETRY_DELAY = 1.0
# 并发拉取标的价格的最大线程数
PRICE_MAX_WORKERS = int(os.getenv("PRICE_MAX_WORKERS", "8"))

# 交易所收盘时间映射：yahoo_symbol 后缀 → (时区, 收盘小时, 收盘分钟)
# 未匹配到后缀时默认使用美股（ET 16:00）
_SUFFIX_EXCHANGE_CLOSE: dict[str, tuple[str, int, int]] = {
    ".SS": ("Asia/Shanghai",    15, 30),  # 上交所
    ".SZ": ("Asia/Shanghai",    15, 30),  # 深交所
    ".HK": ("Asia/Hong_Kong",   16,  0),  # 港交所
    ".KS": ("Asia/Seoul",       15, 30),  # 韩交所
    ".KQ": ("Asia/Seoul",       15, 30),  # 韩国创业板
    ".T":  ("Asia/Tokyo",       15, 30),  # 东交所
}
_SYMBOL_EXCHANGE_CLOSE: dict[str, tuple[str, int, int]] = {
    "^KS11":     ("Asia/Seoul",      15, 30),
    "^STOXX50E": ("Europe/Berlin",   17, 30),
    "^N225":     ("Asia/Tokyo",      15, 30),
    "3067.HK":   ("Asia/Hong_Kong",  16,  0),
}
_DEFAULT_EXCHANGE_CLOSE = ("America/New_York", 16, 0)


def _date_from_index(index_value) -> datetime.date:
    return index_value.date() if hasattr(index_value, "date") else index_value.to_pydatetime().date()


def _build_price_payload(
    *,
    system_symbol: str,
    yahoo_code: str,
    display_name: str,
    trading_date,
    last_row: pd.Series,
    hist: pd.DataFrame,
    captured_at: str,
) -> dict:
    k_date = trading_date.strftime("%Y-%m-%d")

    change_percent = None
    if len(hist) >= 2:
        prev_close = hist.iloc[-2]["Close"]
        curr_close = last_row["Close"]
        if pd.notna(prev_close) and pd.notna(curr_close) and prev_close != 0:
            change_percent = float(round(((curr_close - prev_close) / prev_close) * 100, 2))
    elif pd.notna(last_row["Close"]) and pd.notna(last_row["Open"]) and last_row["Open"] != 0:
        change_percent = float(round(((last_row["Close"] - last_row["Open"]) / last_row["Open"]) * 100, 2))

    current_price = float(round(last_row["Close"], 4)) if pd.notna(last_row["Close"]) else None

    return {
        "k_date": k_date,
        "stock_name": display_name,
        "symbol": system_symbol,
        "yahoo_symbol": yahoo_code,
        "current_price": current_price,
        "change_percent": change_percent,
        "volume": int(last_row["Volume"]) if pd.notna(last_row["Volume"]) else None,
        "captured_at": captured_at,
    }


def _resolve_exchange_close(yahoo_symbol: str) -> tuple[str, int, int]:
    """根据 yahoo_symbol 返回 (时区字符串, 收盘小时, 收盘分钟)。"""
    if yahoo_symbol in _SYMBOL_EXCHANGE_CLOSE:
        return _SYMBOL_EXCHANGE_CLOSE[yahoo_symbol]
    for suffix, info in _SUFFIX_EXCHANGE_CLOSE.items():
        if yahoo_symbol.endswith(suffix):
            return info
    return _DEFAULT_EXCHANGE_CLOSE


def _is_market_closed(candle_date, tz_str: str, close_hour: int, close_minute: int) -> bool:
    """
    判断 candle_date（date 对象）对应市场是否已经收盘。
    - candle_date < 今天（本地）→ 已收盘
    - candle_date == 今天（本地）→ 检查当前时间是否 >= 收盘时间
    - candle_date > 今天 → 保守视为已收盘
    """
    tz = ZoneInfo(tz_str)
    now_local = datetime.now(tz)
    today_local = now_local.date()
    if candle_date < today_local:
        return True
    if candle_date == today_local:
        close_dt = now_local.replace(hour=close_hour, minute=close_minute, second=0, microsecond=0)
        return now_local >= close_dt
    return True  # candle_date 在未来，保守处理


def fetch_stock_data_live(symbol_record: dict, context: ExecutionContext) -> dict | None:
    """symbol_record 来自 symbol_registry，包含 symbol / yahoo_symbol / display_name"""
    system_symbol = symbol_record["symbol"]
    yahoo_code = get_yahoo_symbol(symbol_record)
    display_name = symbol_record.get("display_name", system_symbol)

    last_error = None
    for attempt in range(1, PRICE_FETCH_RETRIES + 1):
        try:
            logger.info("正在获取 %s (%s) 的数据...", display_name, yahoo_code)
            ticker = yf.Ticker(yahoo_code)
            # 用明确的 start/end 日期范围拉取，避免 period="1wk" 数据缺失
            end_dt = context.clock.now().date() + timedelta(days=1)
            start_dt = end_dt - timedelta(days=10)
            hist = ticker.history(start=start_dt.isoformat(), end=end_dt.isoformat())
            if hist.empty:
                logger.warning("标的 %s 没有获取到数据", yahoo_code)
                return None

            # 取最后一根 K 线，若市场尚未收盘则回退到前一根完整 K 线
            last_row = hist.iloc[-1]
            trading_date = hist.index[-1]
            candle_date = _date_from_index(trading_date)
            tz_str, close_h, close_m = _resolve_exchange_close(yahoo_code)
            if not _is_market_closed(candle_date, tz_str, close_h, close_m):
                if len(hist) < 2:
                    logger.warning(
                        "%s (%s) 市场尚未收盘且无前日数据，跳过本次采集",
                        display_name, yahoo_code,
                    )
                    return None
                original_date = candle_date
                hist = hist.iloc[:-1]
                last_row = hist.iloc[-1]
                trading_date = hist.index[-1]
                candle_date = _date_from_index(trading_date)
                logger.warning(
                    "%s (%s) 市场尚未收盘（当日K线日期: %s），回退到前一交易日 %s",
                    display_name, yahoo_code, original_date, candle_date,
                )
            data = _build_price_payload(
                system_symbol=system_symbol,
                yahoo_code=yahoo_code,
                display_name=display_name,
                trading_date=trading_date,
                last_row=last_row,
                hist=hist,
                captured_at=context.clock.now().strftime("%Y-%m-%d %H:%M:%S"),
            )
            logger.info(
                "成功获取 %s (%s) 价格: %s, 涨跌幅: %s%%",
                display_name, yahoo_code, data["current_price"], data["change_percent"],
            )
            return data
        except Exception as exc:
            last_error = exc
            if attempt < PRICE_FETCH_RETRIES:
                logger.warning("获取 %s 数据失败，第 %s/%s 次重试: %s", yahoo_code, attempt, PRICE_FETCH_RETRIES, exc)
                # 指数退避：等待时间随重试次数线性增长，避免频繁冲击接口
                time.sleep(PRICE_FETCH_RETRY_DELAY * attempt)
            else:
                logger.error("获取 %s 数据时发生错误: %s", yahoo_code, exc)
    return None


def fetch_price_for_k_date_live(price_record: dict, context: ExecutionContext) -> dict | None:
    """按既定 k_date 重查 Yahoo，只有命中同一天且 Close 非空才返回。"""
    system_symbol = price_record["symbol"]
    yahoo_code = (price_record.get("yahoo_symbol") or system_symbol).strip()
    display_name = price_record.get("stock_name") or price_record.get("display_name") or system_symbol
    target_k_date = str(price_record["k_date"])
    target_date = datetime.strptime(target_k_date, "%Y-%m-%d").date()

    last_error = None
    for attempt in range(1, PRICE_FETCH_RETRIES + 1):
        try:
            logger.info("修复重查 %s (%s) %s 的 Yahoo 价格...", display_name, yahoo_code, target_k_date)
            ticker = yf.Ticker(yahoo_code)
            start_dt = target_date - timedelta(days=5)
            end_dt = target_date + timedelta(days=2)
            hist = ticker.history(start=start_dt.isoformat(), end=end_dt.isoformat())
            if hist.empty:
                logger.warning("修复重查 %s (%s) 失败: Yahoo 返回空数据", display_name, target_k_date)
                return None

            normalized_dates = [_date_from_index(index_value) for index_value in hist.index]
            target_positions = [idx for idx, date_value in enumerate(normalized_dates) if date_value == target_date]
            if not target_positions:
                logger.warning(
                    "修复跳过 %s (%s): Yahoo 未返回目标 k_date=%s",
                    display_name, yahoo_code, target_k_date,
                )
                return None

            target_idx = target_positions[-1]
            last_row = hist.iloc[target_idx]
            if pd.isna(last_row["Close"]):
                logger.warning(
                    "修复跳过 %s (%s): Yahoo 返回目标 k_date=%s 但 Close 为空",
                    display_name, yahoo_code, target_k_date,
                )
                return None

            hist_until_target = hist.iloc[:target_idx + 1]
            trading_date = hist.index[target_idx]
            data = _build_price_payload(
                system_symbol=system_symbol,
                yahoo_code=yahoo_code,
                display_name=display_name,
                trading_date=trading_date,
                last_row=last_row,
                hist=hist_until_target,
                captured_at=context.clock.now().strftime("%Y-%m-%d %H:%M:%S"),
            )
            if data["k_date"] != target_k_date or data["current_price"] is None:
                logger.warning(
                    "修复跳过 %s (%s): 返回数据不满足更新条件, target=%s actual=%s price=%s",
                    display_name, yahoo_code, target_k_date, data["k_date"], data["current_price"],
                )
                return None

            logger.info(
                "修复命中 %s (%s) %s: 价格=%s, 涨跌幅=%s%%",
                display_name, yahoo_code, target_k_date, data["current_price"], data["change_percent"],
            )
            return data
        except Exception as exc:
            last_error = exc
            if attempt < PRICE_FETCH_RETRIES:
                logger.warning(
                    "修复重查 %s (%s) %s 失败，第 %s/%s 次重试: %s",
                    display_name, yahoo_code, target_k_date, attempt, PRICE_FETCH_RETRIES, exc,
                )
                time.sleep(PRICE_FETCH_RETRY_DELAY * attempt)
            else:
                logger.error("修复重查 %s (%s) %s 时发生错误: %s", display_name, yahoo_code, target_k_date, exc)
    if last_error:
        logger.error("修复重查最终失败 %s (%s) %s: %s", display_name, yahoo_code, target_k_date, last_error)
    return None


def _make_placeholder(sym_record: dict, context: ExecutionContext) -> dict:
    """采集失败时的占位记录，保证下游能感知到该标的本次无数据。"""
    return {
        "k_date": None,
        "stock_name": sym_record.get("display_name"),
        "symbol": sym_record["symbol"],
        "yahoo_symbol": sym_record.get("yahoo_symbol"),
        "current_price": None,
        "change_percent": None,
        "volume": None,
        "captured_at": context.clock.now().strftime("%Y-%m-%d %H:%M:%S"),
    }


def fetch_all_prices_live(context: ExecutionContext) -> list[dict]:
    """Fetch current prices for all tracked symbols from yfinance (concurrent)."""
    tracked = get_tracked_symbols()
    logger.info(
        "========== 价格采集: %s 个标的, %s 并发 ==========",
        len(tracked), PRICE_MAX_WORKERS,
    )

    # 用 dict 保持与 tracked 列表相同的顺序
    results: dict[str, dict] = {}

    with ThreadPoolExecutor(max_workers=PRICE_MAX_WORKERS) as executor:
        future_to_record = {
            executor.submit(fetch_stock_data_live, rec, context): rec
            for rec in tracked
        }
        for future in as_completed(future_to_record):
            rec = future_to_record[future]
            try:
                data = future.result()
                results[rec["symbol"]] = data if data else _make_placeholder(rec, context)
            except Exception as exc:
                logger.error("并发采集 %s 异常: %s", rec["symbol"], exc)
                results[rec["symbol"]] = _make_placeholder(rec, context)

    # 按 tracked 原始顺序输出
    return [results[rec["symbol"]] for rec in tracked]
