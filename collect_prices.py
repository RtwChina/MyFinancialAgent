"""
股票价格采集脚本
使用 yfinance 获取标的最近一个交易日的价格数据
支持数据库存储和去重
"""
import os
import sys
from datetime import datetime, timedelta
import pandas as pd
import yfinance as yf

from config import ALL_SYMBOLS, OUTPUT_DIR, ENABLE_REMOTE_WRITE, USE_DEMO_DATA
from cloudflare_ingest import CloudflareIngestError, is_remote_write_configured, send_prices
from demo_data import build_demo_prices_dataframe
from logger_utils import get_logger
from db_utils import init_database, batch_insert_prices

logger = get_logger("collect_prices")


def get_last_trading_day(symbol: str) -> datetime:
    """获取最近一个交易日"""
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
    try:
        logger.info(f"正在获取 {symbol} 的数据...")
        ticker = yf.Ticker(symbol)

        # 使用 period 参数避免时区问题
        hist = ticker.history(period='1wk')

        if hist.empty:
            logger.warning(f"标的 {symbol} 没有获取到数据")
            return None

        # 取最后一行数据（最近一个交易日）
        last_row = hist.iloc[-1]
        trading_date = hist.index[-1]

        # 安全获取日期字符串，避免夏令时问题
        k_date = trading_date.strftime('%Y-%m-%d')

        # 获取股票信息（可能失败，使用默认值）
        stock_name = symbol
        try:
            info = ticker.info
            stock_name = info.get('shortName', info.get('longName', symbol))
        except Exception as e:
            logger.warning(f"获取 {symbol} 信息失败，使用默认名称: {str(e)}")

        # 计算涨跌幅：相比前一日收盘价
        change_percent = None
        if len(hist) >= 2:
            prev_close = hist.iloc[-2]['Close']
            curr_close = last_row['Close']
            if pd.notna(prev_close) and pd.notna(curr_close) and prev_close != 0:
                change_percent = round(((curr_close - prev_close) / prev_close) * 100, 2)
        elif pd.notna(last_row['Close']) and pd.notna(last_row['Open']) and last_row['Open'] != 0:
            # 如果没有前一日数据，使用当日涨跌
            change_percent = round(((last_row['Close'] - last_row['Open']) / last_row['Open']) * 100, 2)

        data = {
            'k_date': k_date,
            'stock_code': symbol,
            'stock_name': stock_name,
            'symbol': symbol,
            'current_price': round(last_row['Close'], 4) if pd.notna(last_row['Close']) else None,
            'change_percent': change_percent,
            'volume': int(last_row['Volume']) if pd.notna(last_row['Volume']) else None,
            'captured_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        }

        logger.info(f"成功获取 {symbol} ({stock_name}) 价格: {data['current_price']}, 涨跌幅: {data['change_percent']}%")
        return data

    except Exception as e:
        import traceback
        logger.error(f"获取 {symbol} 数据时发生错误: {str(e)}")
        logger.debug(traceback.format_exc())
        return None


def collect_all_prices() -> pd.DataFrame:
    """收集所有标的价格数据"""
    if USE_DEMO_DATA:
        logger.info("当前启用 demo 数据模式，直接返回预置的一周收盘价格")
        return build_demo_prices_dataframe()

    all_data = []

    logger.info("=" * 50)
    logger.info("开始采集股票价格数据")
    logger.info(f"目标标的数量: {len(ALL_SYMBOLS)}")
    logger.info("=" * 50)

    for symbol in ALL_SYMBOLS:
        data = fetch_stock_data(symbol)
        if data:
            all_data.append(data)
        else:
            # 记录失败的标的
            all_data.append({
                'k_date': None,
                'stock_code': symbol,
                'stock_name': None,
                'symbol': symbol,
                'current_price': None,
                'change_percent': None,
                'volume': None,
                'captured_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            })

    df = pd.DataFrame(all_data)
    logger.info(f"价格数据采集完成，共获取 {len([d for d in all_data if d['current_price'] is not None])} 条有效数据")

    return df


def export_to_excel(df: pd.DataFrame, filename: str = None) -> str:
    """导出价格数据到 Excel"""
    if filename is None:
        filename = f"stock_prices_{datetime.now().strftime('%Y%m%d')}.xlsx"

    # 确保输出目录存在
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)

    filepath = os.path.join(OUTPUT_DIR, filename)
    df.to_excel(filepath, sheet_name='Prices', index=False)
    logger.info(f"价格数据已导出到: {filepath}")

    return filepath


def main():
    """主函数"""
    logger.info("=" * 60)
    logger.info("股票价格采集脚本启动")
    logger.info("=" * 60)

    try:
        # 收集价格数据
        prices_df = collect_all_prices()

        prices_list = prices_df.to_dict('records')
        if ENABLE_REMOTE_WRITE and is_remote_write_configured():
            remote_result = send_prices(prices_list)
            inserted_count = remote_result.get('inserted', 0)
            logger.info(
                "Cloudflare D1 写入完成: 新增 %s 条，跳过重复 %s 条",
                inserted_count,
                remote_result.get('ignored', 0),
            )
        else:
            init_database()
            inserted_count = batch_insert_prices(prices_list)
            logger.info(f"数据库写入完成: 新增 {inserted_count} 条，跳过重复 {len(prices_list) - inserted_count} 条")

        # 导出到 Excel
        filepath = export_to_excel(prices_df)

        # 打印汇总
        print("\n" + "=" * 60)
        print("价格采集汇总:")
        print("=" * 60)
        print(prices_df.to_string(index=False))
        print("=" * 60)
        print(f"数据已保存至: {filepath}")
        print(f"数据库新增: {inserted_count} 条")

        logger.info("股票价格采集脚本执行完成")
        return 0

    except CloudflareIngestError as e:
        logger.error(f"Cloudflare 写入失败: {str(e)}", exc_info=True)
        return 1
    except Exception as e:
        logger.error(f"脚本执行失败: {str(e)}", exc_info=True)
        return 1


if __name__ == "__main__":
    sys.exit(main())
