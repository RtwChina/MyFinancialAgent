"""
股票价格采集脚本
使用 yfinance 获取标的最近一个交易日的价格数据
支持数据库存储和去重
"""
import sys
from datetime import datetime, timedelta
import pandas as pd

from config import ALL_SYMBOLS, ENABLE_REMOTE_WRITE
from cloudflare_ingest import CloudflareIngestError, is_remote_write_configured, send_prices
from data_sources.price_router import fetch_all_prices
from logger_utils import get_logger
from db_utils import init_database, batch_insert_prices
from runtime.context import ExecutionContext, build_execution_context

logger = get_logger("collect_prices")


def get_last_trading_day(symbol: str) -> datetime:
    """获取最近一个交易日"""
    import yfinance as yf
    ticker = yf.Ticker(symbol)
    # 获取最近7天的历史数据，确保包含至少一个交易日
    end_date = datetime.now()
    start_date = end_date - timedelta(days=7)
    hist = ticker.history(start=start_date, end=end_date)
    if hist.empty:
        return None
    return hist.index[-1].to_pydatetime()


def fetch_stock_data(symbol: str) -> dict:
    """获取单个标的的价格数据"""
    raise NotImplementedError("fetch_stock_data 已由 data_sources.price_live 接管，请改用 collect_all_prices(context)")


def collect_all_prices(context: ExecutionContext | None = None) -> pd.DataFrame:
    """收集所有标的价格数据"""
    context = context or build_execution_context()
    all_data = fetch_all_prices(context)

    df = pd.DataFrame(all_data)
    # current_price 为 None 表示该标的当日无行情数据（停牌或接口异常）
    valid_count = len([d for d in all_data if d["current_price"] is not None])
    logger.info("价格数据采集完成，共获取 %s 条有效数据", valid_count)

    return df



def main():
    """主函数"""
    context = build_execution_context()
    logger.info("========== 价格采集启动 ==========")

    try:
        prices_df = collect_all_prices(context)

        prices_list = prices_df.to_dict('records')
        if ENABLE_REMOTE_WRITE and is_remote_write_configured():
            remote_result = send_prices(prices_list)
            inserted_count = remote_result.get('inserted', 0)
            logger.info(
                "Cloudflare D1 写入完成: 新增 %s 条, 跳过重复 %s 条",
                inserted_count,
                remote_result.get('ignored', 0),
            )
        else:
            init_database()
            inserted_count = batch_insert_prices(prices_list)
            logger.info("数据库写入完成: 新增 %s 条, 跳过重复 %s 条", inserted_count, len(prices_list) - inserted_count)

        logger.info("股票价格采集脚本执行完成")
        return 0

    except CloudflareIngestError as e:
        logger.error("[写入D1] Cloudflare写入失败: %s", e, exc_info=True)
        return 1
    except Exception as e:
        logger.error("脚本执行失败: %s", e, exc_info=True)
        return 1


if __name__ == "__main__":
    sys.exit(main())
