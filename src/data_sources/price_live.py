"""Live price-source implementation backed by yfinance."""

from __future__ import annotations

import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import akshare as ak
import finnhub
import pandas as pd
import yfinance as yf

from config import FINNHUB_API_KEY
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
REPAIR_FALLBACK_AKSHARE = "akshare"
REPAIR_FALLBACK_FINNHUB = "finnhub"


def _find_symbol_record_by_yahoo(yahoo_symbol: str) -> dict | None:
    for record in get_tracked_symbols():
        if get_yahoo_symbol(record) == yahoo_symbol:
            return record
    return None


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


def _build_repair_payload(
    *,
    system_symbol: str,
    yahoo_code: str,
    display_name: str,
    k_date: str,
    current_price: float | None,
    change_percent: float | None,
    volume: int | None,
    captured_at: str,
) -> dict | None:
    if not k_date or current_price is None:
        return None
    return {
        "k_date": k_date,
        "stock_name": display_name,
        "symbol": system_symbol,
        "yahoo_symbol": yahoo_code,
        "current_price": float(current_price),
        "change_percent": float(change_percent) if change_percent is not None else None,
        "volume": int(volume) if volume is not None else None,
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


def resolve_repair_fallback_source(price_record: dict) -> str:
    yahoo_code = (price_record.get("yahoo_symbol") or "").strip().upper()
    if yahoo_code.endswith(".SS") or yahoo_code.endswith(".SZ"):
        return REPAIR_FALLBACK_AKSHARE
    return REPAIR_FALLBACK_FINNHUB


def _is_mainland_index(price_record: dict) -> bool:
    yahoo_code = (price_record.get("yahoo_symbol") or "").strip().upper()
    system_symbol = str(price_record.get("symbol") or "").strip().upper()
    display_name = str(price_record.get("stock_name") or price_record.get("display_name") or "")
    return system_symbol in {"SSE", "HSI"} or "指数" in display_name or yahoo_code in {"000001.SS", "399001.SZ"}


def _is_mainland_etf(price_record: dict) -> bool:
    yahoo_code = (price_record.get("yahoo_symbol") or "").strip().upper()
    base_code = yahoo_code.split(".", 1)[0]
    display_name = str(price_record.get("stock_name") or price_record.get("display_name") or "")
    return base_code.startswith(("15", "16", "50", "51", "56", "58")) or "ETF" in display_name.upper()


def _sina_etf_symbol(yahoo_code: str) -> str:
    code = yahoo_code.split(".", 1)[0]
    suffix = yahoo_code.upper().split(".", 1)[1] if "." in yahoo_code else ""
    exchange_prefix = "sz" if suffix == "SZ" else "sh"
    return f"{exchange_prefix}{code}"


def _normalize_sina_etf_history(df: pd.DataFrame) -> pd.DataFrame:
    if df is None or df.empty:
        return df
    normalized = df.rename(columns={
        "date": "日期",
        "close": "收盘",
        "volume": "成交量",
    }).copy()
    if "日期" in normalized.columns:
        normalized["日期"] = normalized["日期"].astype(str)
        normalized = normalized.sort_values("日期")
    if "收盘" in normalized.columns:
        close_values = pd.to_numeric(normalized["收盘"], errors="coerce")
        previous_close = close_values.shift(1)
        normalized["涨跌幅"] = ((close_values - previous_close) / previous_close * 100).round(2)
    return normalized


def _normalize_eastmoney_history(df: pd.DataFrame) -> pd.DataFrame:
    if df is None or df.empty:
        return df
    normalized = df.copy()
    if "成交量" in normalized.columns:
        volume_values = pd.to_numeric(normalized["成交量"], errors="coerce")
        normalized["成交量"] = (volume_values * 100).round().astype("Int64")
    return normalized


def _get_finnhub_client() -> finnhub.Client | None:
    if not FINNHUB_API_KEY:
        logger.warning("[Finnhub] FINNHUB_API_KEY 未配置，跳过 repair fallback")
        return None
    return finnhub.Client(api_key=FINNHUB_API_KEY)


def _pick_finnhub_fetcher(yahoo_code: str) -> tuple[str, str] | None:
    upper_code = yahoo_code.upper()
    if upper_code.endswith(".HK"):
        return ("stock", yahoo_code)
    if upper_code.endswith(".SS") or upper_code.endswith(".SZ"):
        return None
    if upper_code.endswith("-USD"):
        # 保守起见，crypto 代码映射先不猜交易所，避免错源写回
        return None
    if upper_code.endswith("=X") or upper_code.endswith("=F") or upper_code.startswith("^"):
        return None
    return ("stock", yahoo_code)


def _finnhub_payload_from_candles(
    *,
    candles: dict,
    price_record: dict,
    target_k_date: str,
    source_label: str,
    context: ExecutionContext,
) -> dict | None:
    status = candles.get("s")
    if status != "ok":
        logger.warning(
            "修复跳过 %s (%s): %s 返回状态=%s",
            price_record.get("stock_name") or price_record.get("symbol"),
            price_record.get("yahoo_symbol") or price_record.get("symbol"),
            source_label,
            status,
        )
        return None

    timestamps = candles.get("t") or []
    closes = candles.get("c") or []
    opens = candles.get("o") or []
    volumes = candles.get("v") or []
    if not timestamps or not closes:
        return None

    target_date = datetime.strptime(target_k_date, "%Y-%m-%d").date()
    matched_idx = None
    for idx, ts in enumerate(timestamps):
        candle_date = datetime.fromtimestamp(ts, tz=ZoneInfo("UTC")).date()
        if candle_date == target_date:
            matched_idx = idx
    if matched_idx is None:
        logger.warning(
            "修复跳过 %s (%s): %s 未返回目标 k_date=%s",
            price_record.get("stock_name") or price_record.get("symbol"),
            price_record.get("yahoo_symbol") or price_record.get("symbol"),
            source_label,
            target_k_date,
        )
        return None

    current_price = closes[matched_idx]
    if current_price is None:
        logger.warning(
            "修复跳过 %s (%s): %s 返回目标 k_date=%s 但价格为空",
            price_record.get("stock_name") or price_record.get("symbol"),
            price_record.get("yahoo_symbol") or price_record.get("symbol"),
            source_label,
            target_k_date,
        )
        return None

    change_percent = None
    if matched_idx >= 1 and closes[matched_idx - 1]:
        prev_close = closes[matched_idx - 1]
        if prev_close:
            change_percent = round(((current_price - prev_close) / prev_close) * 100, 2)
    elif matched_idx < len(opens) and opens[matched_idx]:
        open_price = opens[matched_idx]
        if open_price:
            change_percent = round(((current_price - open_price) / open_price) * 100, 2)

    volume = None
    if matched_idx < len(volumes):
        volume = volumes[matched_idx]

    display_name = price_record.get("stock_name") or price_record.get("display_name") or price_record.get("symbol")
    return _build_repair_payload(
        system_symbol=price_record["symbol"],
        yahoo_code=(price_record.get("yahoo_symbol") or price_record["symbol"]).strip(),
        display_name=display_name,
        k_date=target_k_date,
        current_price=current_price,
        change_percent=change_percent,
        volume=volume,
        captured_at=context.clock.now().strftime("%Y-%m-%d %H:%M:%S"),
    )


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
            start_dt = target_date - timedelta(days=5)
            end_dt = target_date + timedelta(days=2)
            logger.info(
                "修复重查 %s (%s) %s 的 Yahoo 价格... window=%s~%s",
                display_name, yahoo_code, target_k_date, start_dt.isoformat(), end_dt.isoformat(),
            )
            ticker = yf.Ticker(yahoo_code)
            hist = ticker.history(start=start_dt.isoformat(), end=end_dt.isoformat())
            if hist.empty:
                logger.warning("修复重查 %s (%s) 失败: Yahoo 返回空数据 target=%s", display_name, yahoo_code, target_k_date)
                return None

            normalized_dates = [_date_from_index(index_value) for index_value in hist.index]
            target_positions = [idx for idx, date_value in enumerate(normalized_dates) if date_value == target_date]
            if not target_positions:
                logger.warning(
                    "修复跳过 %s (%s): Yahoo 未返回目标 k_date=%s available=%s",
                    display_name, yahoo_code, target_k_date,
                    ",".join(str(date_value) for date_value in normalized_dates[-3:]),
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


def fetch_price_for_k_date_akshare(price_record: dict, context: ExecutionContext) -> dict | None:
    """按目标 k_date 查询中国市场 AKShare 日线，仅命中同日且价格非空时返回。"""
    system_symbol = price_record["symbol"]
    yahoo_code = (price_record.get("yahoo_symbol") or system_symbol).strip()
    display_name = price_record.get("stock_name") or price_record.get("display_name") or system_symbol
    target_k_date = str(price_record["k_date"])
    target_date = datetime.strptime(target_k_date, "%Y-%m-%d").date()
    code = yahoo_code.split(".", 1)[0]
    start_date = (target_date - timedelta(days=5)).strftime("%Y%m%d")
    end_date = (target_date + timedelta(days=2)).strftime("%Y%m%d")

    is_index = _is_mainland_index(price_record)
    is_etf = _is_mainland_etf(price_record)
    source_kind = "index" if is_index else "etf" if is_etf else "stock"
    if is_index:
        sources = [(
            "东方财富指数",
            lambda: _normalize_eastmoney_history(
                ak.index_zh_a_hist(symbol=code, period="daily", start_date=start_date, end_date=end_date),
            ),
        )]
    elif is_etf:
        sources = [
            (
                "东方财富ETF",
                lambda: _normalize_eastmoney_history(
                    ak.fund_etf_hist_em(symbol=code, period="daily", start_date=start_date, end_date=end_date, adjust=""),
                ),
            ),
            (
                "新浪ETF",
                lambda: _normalize_sina_etf_history(ak.fund_etf_hist_sina(symbol=_sina_etf_symbol(yahoo_code))),
            ),
        ]
    else:
        sources = [(
            "东方财富A股",
            lambda: _normalize_eastmoney_history(
                ak.stock_zh_a_hist(symbol=code, period="daily", start_date=start_date, end_date=end_date, adjust=""),
            ),
        )]

    df = None
    source_name = None
    last_error = None
    for candidate_source_name, fetcher in sources:
        for attempt in range(1, PRICE_FETCH_RETRIES + 1):
            try:
                logger.info(
                    "修复重查 %s (%s) %s 的 AKShare 价格... kind=%s source=%s window=%s~%s",
                    display_name, yahoo_code, target_k_date, source_kind, candidate_source_name, start_date, end_date,
                )
                fetched = fetcher()
                rows = 0 if fetched is None else len(fetched)
                if fetched is None or fetched.empty:
                    logger.warning(
                        "修复跳过 %s (%s): AKShare %s 返回空数据",
                        display_name, yahoo_code, candidate_source_name,
                    )
                    break
                if "日期" in fetched.columns and fetched["日期"].astype(str).eq(target_k_date).any():
                    df = fetched
                    source_name = candidate_source_name
                    break
                available_dates = fetched["日期"].astype(str).tail(3).tolist() if "日期" in fetched.columns else []
                logger.warning(
                    "修复跳过 %s (%s): AKShare %s 未返回目标 k_date=%s available=%s rows=%s",
                    display_name, yahoo_code, candidate_source_name, target_k_date, ",".join(available_dates), rows,
                )
                break
            except Exception as exc:
                last_error = exc
                if attempt < PRICE_FETCH_RETRIES:
                    logger.warning(
                        "修复重查 %s (%s) %s 的 AKShare %s 价格失败，第 %s/%s 次重试: %s",
                        display_name, yahoo_code, target_k_date, candidate_source_name, attempt, PRICE_FETCH_RETRIES, exc,
                    )
                    time.sleep(PRICE_FETCH_RETRY_DELAY * attempt)
                else:
                    logger.error(
                        "修复重查 %s (%s) %s 的 AKShare %s 价格失败: %s",
                        display_name, yahoo_code, target_k_date, candidate_source_name, exc,
                    )
        if df is not None:
            break

    if df is None:
        if last_error:
            logger.error("修复重查最终失败 %s (%s) %s 的 AKShare 价格: %s", display_name, yahoo_code, target_k_date, last_error)
        return None

    try:
        logger.info(
            "AKShare 修复数据返回: symbol=%s yahoo=%s k_date=%s kind=%s source=%s rows=%s",
            system_symbol, yahoo_code, target_k_date, source_kind, source_name, 0 if df is None else len(df),
        )
        target_rows = df[df["日期"].astype(str) == target_k_date]
        row = target_rows.iloc[-1]
        close_value = row.get("收盘")
        if pd.isna(close_value):
            logger.warning("修复跳过 %s (%s): AKShare 返回目标 k_date=%s 但价格为空", display_name, yahoo_code, target_k_date)
            return None

        volume_value = row.get("成交量")
        change_percent = row.get("涨跌幅")
        data = _build_repair_payload(
            system_symbol=system_symbol,
            yahoo_code=yahoo_code,
            display_name=display_name,
            k_date=target_k_date,
            current_price=float(close_value),
            change_percent=float(change_percent) if pd.notna(change_percent) else None,
            volume=int(volume_value) if pd.notna(volume_value) else None,
            captured_at=context.clock.now().strftime("%Y-%m-%d %H:%M:%S"),
        )
        logger.info(
            "修复命中 %s (%s) %s: 来源=AKShare/%s 价格=%s, 涨跌幅=%s%%",
            display_name, yahoo_code, target_k_date, source_name, data["current_price"], data["change_percent"],
        )
        return data
    except Exception as exc:
        logger.error("修复重查 %s (%s) %s 的 AKShare 价格失败: %s", display_name, yahoo_code, target_k_date, exc)
        return None


def fetch_price_for_k_date_finnhub(price_record: dict, context: ExecutionContext) -> dict | None:
    """按目标 k_date 查询 Finnhub 国际链路价格，仅命中同日且价格非空时返回。"""
    system_symbol = price_record["symbol"]
    yahoo_code = (price_record.get("yahoo_symbol") or system_symbol).strip()
    display_name = price_record.get("stock_name") or price_record.get("display_name") or system_symbol
    target_k_date = str(price_record["k_date"])
    target_date = datetime.strptime(target_k_date, "%Y-%m-%d").date()

    client = _get_finnhub_client()
    if client is None:
        return None
    fetcher = _pick_finnhub_fetcher(yahoo_code)
    if fetcher is None:
        logger.warning("修复跳过 %s (%s): Finnhub 暂不支持该代码模式", display_name, yahoo_code)
        return None

    source_type, finnhub_symbol = fetcher
    start_ts = int(datetime.combine(target_date - timedelta(days=5), datetime.min.time(), tzinfo=ZoneInfo("UTC")).timestamp())
    end_ts = int(datetime.combine(target_date + timedelta(days=2), datetime.min.time(), tzinfo=ZoneInfo("UTC")).timestamp())

    try:
        logger.info(
            "修复重查 %s (%s) %s 的 Finnhub 价格... type=%s symbol=%s window=%s~%s",
            display_name, yahoo_code, target_k_date, source_type, finnhub_symbol, start_ts, end_ts,
        )
        if source_type == "stock":
            candles = client.stock_candles(finnhub_symbol, "D", start_ts, end_ts)
        else:
            logger.warning("修复跳过 %s (%s): Finnhub source_type=%s 未实现", display_name, yahoo_code, source_type)
            return None
        data = _finnhub_payload_from_candles(
            candles=candles,
            price_record=price_record,
            target_k_date=target_k_date,
            source_label="Finnhub",
            context=context,
        )
        if data:
            logger.info(
                "修复命中 %s (%s) %s: 来源=Finnhub 价格=%s, 涨跌幅=%s%%",
                display_name, yahoo_code, target_k_date, data["current_price"], data["change_percent"],
            )
        return data
    except Exception as exc:
        logger.error("修复重查 %s (%s) %s 的 Finnhub 价格失败: %s", display_name, yahoo_code, target_k_date, exc)
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
