"""
主入口脚本 - 运行所有采集任务
"""
import argparse
import sys
from datetime import datetime

from config import ENABLE_REMOTE_WRITE, USE_DEMO_DATA
from cloudflare_ingest import is_remote_write_configured, send_prices
from logger_utils import get_logger
from db_utils import init_database

logger = get_logger("main")


def run_price_collector():
    """运行价格采集"""
    logger.info("开始执行价格采集...")
    try:
        from collect_prices import collect_all_prices, export_to_excel, batch_insert_prices
        prices_df = collect_all_prices()

        prices_list = prices_df.to_dict('records')
        if ENABLE_REMOTE_WRITE and is_remote_write_configured():
            remote_result = send_prices(prices_list)
            inserted_count = remote_result.get('inserted', 0)
            logger.info("Cloudflare 价格数据库写入: 新增 %s 条", inserted_count)
        else:
            init_database()
            inserted_count = batch_insert_prices(prices_list)
            logger.info(f"价格数据库写入: 新增 {inserted_count} 条")

        filepath = export_to_excel(prices_df)
        return filepath
    except Exception as e:
        logger.error(f"价格采集失败: {str(e)}", exc_info=True)
        return None


def run_news_collector(collect_fresh_news: bool = True, persist_summary: bool = True):
    """运行新闻采集"""
    logger.info("开始执行新闻采集...")
    try:
        from collect_news_v3 import run_news_pipeline

        result = run_news_pipeline(
            collect_fresh_news=collect_fresh_news,
            persist_summary=persist_summary,
        )
        logger.info(
            "新闻流程完成: 分析日 %s, 有效新闻 %s 条, 新增 %s 条, 写入 summary=%s",
            result.get("analysis_date"),
            result.get("news_count"),
            result.get("inserted_count"),
            result.get("persisted_summary"),
        )
        return result.get("filepath")
    except Exception as e:
        logger.error(f"新闻采集失败: {str(e)}", exc_info=True)
        return None


def run_full_pipeline():
    """完整手动模式：价格 + 新鲜新闻 + 日期级 summary"""
    results = {}

    print("\n[1/2] 正在采集股票价格数据...")
    prices_file = run_price_collector()
    results["prices"] = prices_file
    if prices_file:
        print(f"      ✓ 价格数据已保存: {prices_file}")
    else:
        print("      ✗ 价格采集失败")

    print("\n[2/2] 正在采集新闻数据...")
    news_file = run_news_collector(collect_fresh_news=True, persist_summary=True)
    results["news"] = news_file
    if news_file:
        print(f"      ✓ 新闻数据已保存: {news_file}")
    else:
        print("      ✗ 新闻采集失败")
    return results


def run_hourly_news_job():
    """每小时任务：只采集新闻，不写 news_analysis"""
    print("\n[Hourly] 正在执行小时新闻任务...")
    news_file = run_news_collector(collect_fresh_news=True, persist_summary=False)
    return {"news": news_file}


def run_close_summary_job():
    """收盘后任务：存价格 + 汇总最近交易日到上一交易日之间的新闻"""
    print("\n[Close] 正在执行收盘后汇总任务...")
    prices_file = run_price_collector()
    news_file = run_news_collector(collect_fresh_news=False, persist_summary=True)
    return {"prices": prices_file, "news": news_file}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="My Financial Agent 任务入口")
    parser.add_argument(
        "mode",
        nargs="?",
        default="full",
        choices=["full", "hourly-news", "close-summary"],
        help="full=手动全量，hourly-news=每小时新闻采集，close-summary=收盘后价格+日期汇总",
    )
    return parser.parse_args()


def main():
    """主函数 - 运行所有采集任务"""
    args = parse_args()
    logger.info("=" * 60)
    logger.info("股票数据自动化复盘系统 - 数据采集")
    logger.info(f"启动时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    logger.info("运行模式: %s (demo=%s)", args.mode, USE_DEMO_DATA)
    logger.info("=" * 60)

    if args.mode == "hourly-news":
        results = run_hourly_news_job()
    elif args.mode == "close-summary":
        results = run_close_summary_job()
    else:
        results = run_full_pipeline()

    # 汇总
    print("\n" + "=" * 60)
    print("采集任务完成!")
    print("=" * 60)

    success_count = sum(1 for v in results.values() if v is not None)
    print(f"成功: {success_count}/2 项任务")

    if all(v is not None for v in results.values()):
        print("\n输出文件:")
        if "prices" in results:
            print(f"  - 价格数据: {results['prices']}")
        if "news" in results:
            print(f"  - 新闻数据: {results['news']}")
        return 0
    else:
        print("\n部分任务失败，请检查日志获取详细信息。")
        return 1


if __name__ == "__main__":
    sys.exit(main())
