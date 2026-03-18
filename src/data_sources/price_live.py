"""Live price-source implementation backed by yfinance."""

from __future__ import annotations

import time
from datetime import timedelta

import pandas as pd
import yfinance as yf

from logger_utils import get_logger
from runtime.context import ExecutionContext
from symbol_registry import get_tracked_symbols, get_yahoo_symbol


logger = get_logger("price_live")
# 拉取单只标的时的最大重试次数及每次重试的基础等待秒数
PRICE_FETCH_RETRIES = 3
PRICE_FETCH_RETRY_DELAY = 1.0


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
            # 拉取最近一周 K 线；若无数据则直接放弃该标的
            hist = ticker.history(period="1wk")
            if hist.empty:
                logger.warning("标的 %s 没有获取到数据", yahoo_code)
                return None

            # 取最后一根 K 线作为当日收盘数据
            last_row = hist.iloc[-1]
            trading_date = hist.index[-1]
            k_date = trading_date.strftime("%Y-%m-%d")

            stock_name = display_name
            try:
                info = ticker.info
                stock_name = info.get("shortName", info.get("longName", display_name))
            except Exception as exc:
                logger.warning("获取 %s 信息失败，使用默认名称: %s", yahoo_code, exc)

            # 优先用前一日收盘价计算涨跌幅；若只有一根 K 线则退而以开盘价估算
            change_percent = None
            if len(hist) >= 2:
                prev_close = hist.iloc[-2]["Close"]
                curr_close = last_row["Close"]
                if pd.notna(prev_close) and pd.notna(curr_close) and prev_close != 0:
                    change_percent = round(((curr_close - prev_close) / prev_close) * 100, 2)
            elif pd.notna(last_row["Close"]) and pd.notna(last_row["Open"]) and last_row["Open"] != 0:
                change_percent = round(((last_row["Close"] - last_row["Open"]) / last_row["Open"]) * 100, 2)

            data = {
                "k_date": k_date,
                "stock_code": system_symbol,   # 系统标识（非 yahoo code）
                "stock_name": stock_name,
                "symbol": system_symbol,        # stock_raw.symbol 存系统标识
                "current_price": round(last_row["Close"], 4) if pd.notna(last_row["Close"]) else None,
                "change_percent": change_percent,
                "volume": int(last_row["Volume"]) if pd.notna(last_row["Volume"]) else None,
                "captured_at": context.clock.now().strftime("%Y-%m-%d %H:%M:%S"),
            }
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


def fetch_all_prices_live(context: ExecutionContext) -> list[dict]:
    """Fetch current prices for all tracked symbols from yfinance."""
    tracked = get_tracked_symbols()
    all_data: list[dict] = []
    logger.info("=" * 50)
    logger.info("开始采集股票价格数据（从标的表动态读取）")
    logger.info("目标标的数量: %s", len(tracked))
    logger.info("=" * 50)

    for sym_record in tracked:
        data = fetch_stock_data_live(sym_record, context)
        if data:
            all_data.append(data)
        else:
            # 采集失败时仍插入占位记录，保证下游能感知到该标的本次无数据
            all_data.append({
                "k_date": None,
                "stock_code": sym_record["symbol"],
                "stock_name": sym_record.get("display_name"),
                "symbol": sym_record["symbol"],
                "current_price": None,
                "change_percent": None,
                "volume": None,
                "captured_at": context.clock.now().strftime("%Y-%m-%d %H:%M:%S"),
            })
    return all_data
