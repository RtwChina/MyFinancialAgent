"""
主入口脚本 - 运行所有采集任务
"""
import sys
from datetime import datetime

from config import ENABLE_REMOTE_WRITE
from cloudflare_ingest import is_remote_write_configured, send_news, send_news_analysis, send_prices
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


def run_news_collector():
    """运行新闻采集"""
    logger.info("开始执行新闻采集...")
    try:
        from collect_news_v3 import collect_all_news, export_to_excel as export_news, init_database as news_init_db, batch_insert_news, build_analysis_record
        # 采集新闻
        news_list, summary = collect_all_news()
        analysis_record = build_analysis_record(summary)

        if ENABLE_REMOTE_WRITE and is_remote_write_configured():
            remote_result = send_news(news_list)
            inserted_count = remote_result.get('inserted', 0)
            logger.info("Cloudflare 新闻数据库写入: 新增 %s 条", inserted_count)
            if analysis_record:
                send_news_analysis(analysis_record)
        else:
            news_init_db()
            inserted_count = batch_insert_news(news_list)
            logger.info(f"新闻数据库写入: 新增 {inserted_count} 条")
            if analysis_record:
                from db_utils import save_news_analysis
                save_news_analysis(analysis_record)
        # 导出 Excel
        filepath = export_news(news_list, summary)
        return filepath
    except Exception as e:
        logger.error(f"新闻采集失败: {str(e)}", exc_info=True)
        return None


def main():
    """主函数 - 运行所有采集任务"""
    logger.info("=" * 60)
    logger.info("股票数据自动化复盘系统 - 数据采集")
    logger.info(f"启动时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    logger.info("=" * 60)

    results = {}

    # 1. 运行价格采集
    print("\n[1/2] 正在采集股票价格数据...")
    prices_file = run_price_collector()
    results['prices'] = prices_file
    if prices_file:
        print(f"      ✓ 价格数据已保存: {prices_file}")
    else:
        print("      ✗ 价格采集失败")

    # 2. 运行新闻采集
    print("\n[2/2] 正在采集新闻数据...")
    news_file = run_news_collector()
    results['news'] = news_file
    if news_file:
        print(f"      ✓ 新闻数据已保存: {news_file}")
    else:
        print("      ✗ 新闻采集失败")

    # 汇总
    print("\n" + "=" * 60)
    print("采集任务完成!")
    print("=" * 60)

    success_count = sum(1 for v in results.values() if v is not None)
    print(f"成功: {success_count}/2 项任务")

    if all(v is not None for v in results.values()):
        print("\n输出文件:")
        print(f"  - 价格数据: {results['prices']}")
        print(f"  - 新闻数据: {results['news']}")
        return 0
    else:
        print("\n部分任务失败，请检查日志获取详细信息。")
        return 1


if __name__ == "__main__":
    sys.exit(main())
