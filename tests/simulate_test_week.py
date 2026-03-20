from __future__ import annotations

import argparse
import json
import os
import random
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

import pandas as pd

os.environ.setdefault("SKIP_LLM", "true")

from collect_news_v3 import build_daily_summary_record, get_analysis_window, get_latest_closed_trading_day, load_news_for_summary, subtract_trading_days
from db_utils import batch_insert_prices, initialize_archive_record, rebuild_database, save_news_analysis, upsert_news_batch
from demo_data import SYMBOL_META, TRACKED_ORDER, YAHOO_SYMBOL_MAP

OUTPUT_DIR = Path("output")

MACRO_TEMPLATES = [
    {
        "title": "美联储官员释放偏鹰信号，美元与长端利率同步走高",
        "content": "多位美联储官员强调通胀仍具韧性，市场下调短期降息预期，美元指数和10年期美债收益率联动上行。",
        "type": "macro",
        "stars": (4, 5),
        "symbols": ["DX-Y.NYB", "^GSPC"],
        "impact": "美元走强与贴现率上升压制成长资产风险偏好。",
    },
    {
        "title": "中东局势再起波澜，油价与黄金获得避险买盘",
        "content": "中东风险事件升温，原油与黄金同步上涨，全球风险资产短线承压，市场避险交易明显回流。",
        "type": "macro",
        "stars": (4, 5),
        "symbols": ["GC=F", "^VIX"],
        "impact": "大宗商品和避险资产走强，权益市场波动率可能放大。",
    },
    {
        "title": "美国零售销售低于预期，市场重新交易增长放缓",
        "content": "美国零售销售与可选消费数据略低于预期，利率预期回落，但市场对盈利周期的担忧上升。",
        "type": "macro",
        "stars": (3, 4),
        "symbols": ["^GSPC", "DX-Y.NYB"],
        "impact": "增长预期回落利好利率敏感资产，但压制顺周期板块。",
    },
    {
        "title": "美国10年期国债收益率回落，科技成长板块估值压力缓解",
        "content": "长端利率回落后，高估值科技板块迎来估值修复，AI 和软件龙头盘前情绪改善。",
        "type": "macro",
        "stars": (3, 4),
        "symbols": ["^GSPC", "MSFT", "GOOGL"],
        "impact": "利率回落改善成长股估值框架，纳指风格可能重新占优。",
    },
]

MARKET_TEMPLATES = [
    {
        "title": "标普500逼近阶段高位，风险偏好延续修复",
        "content": "权重科技和金融板块同步走强，标普500 再度逼近阶段高位，市场对软着陆交易重新升温。",
        "type": "market",
        "stars": (3, 4),
        "symbols": ["^GSPC", "^VIX"],
        "impact": "指数走强通常伴随波动率回落，风险偏好改善。",
    },
    {
        "title": "VIX 回落到阶段低位，短线情绪转向乐观",
        "content": "波动率指标连续回落，表明避险需求下降，风险偏好修复对 AI、半导体和可选消费形成支撑。",
        "type": "market",
        "stars": (3, 4),
        "symbols": ["^VIX", "^GSPC"],
        "impact": "风险偏好回暖有利于高 Beta 板块继续获得增量资金。",
    },
    {
        "title": "资金从防御转向周期与资源，市场风格趋于均衡",
        "content": "盘面显示资源、工业与金融板块获得回补，市场风格从单一成长切换到更均衡的结构。",
        "type": "market",
        "stars": (3, 4),
        "symbols": ["GC=F", "^GSPC"],
        "impact": "板块轮动加快，单边抱团交易的持续性下降。",
    },
    {
        "title": "半导体指数走强，AI 基建链景气度预期继续上修",
        "content": "半导体与光模块板块联动上涨，AI 基建需求被市场再次计价，带动相关高弹性资产走强。",
        "type": "market",
        "stars": (3, 5),
        "symbols": ["MU", "LITE", "^GSPC"],
        "impact": "AI 资本开支相关链条继续获得相对收益。",
    },
]

SYMBOL_TEMPLATES = {
    "MU": [
        {
            "title": "Micron 上调 HBM 与 DDR5 出货指引，存储链景气度继续抬升",
            "content": "渠道反馈显示 Micron 将上调 HBM 与 DDR5 出货预期，服务器与封装链订单能见度同步延长。",
            "impact": "有利于存储链与 AI 服务器链条的景气预期继续修复。",
        },
        {
            "title": "Micron 数据中心客户追加订单，市场上修全年 ASP 预期",
            "content": "多家云客户追加内存与 HBM 采购计划，市场重新评估 Micron 全年 ASP 和利润弹性。",
            "impact": "订单与价格双升改善 Micron 业绩弹性。",
        },
    ],
    "LITE": [
        {
            "title": "Lumentum 获得新一轮光模块订单，AI 网络链再获催化",
            "content": "Lumentum 获得头部客户新增光模块订单，市场上修 AI 网络基础设施资本开支预期。",
            "impact": "光模块与 AI 网络链条继续受益于资本开支扩张。",
        },
        {
            "title": "Lumentum 管理层强调光通信需求持续，交付节奏超预期",
            "content": "管理层表示头部客户需求稳定提升，光通信产品交付节奏快于此前预期。",
            "impact": "需求确认改善市场对后续季度收入节奏的判断。",
        },
    ],
    "MSFT": [
        {
            "title": "微软上调企业 AI 服务定价，云业务商业化效率改善",
            "content": "微软在企业 AI 服务中推出更细化的定价结构，市场认为商业化效率和毛利率改善空间扩大。",
            "impact": "利好 Azure 与企业软件收入质量，强化 AI 商业化叙事。",
        },
        {
            "title": "微软披露更多 AI Agent 场景，企业客户采用率继续爬升",
            "content": "微软在企业开发者大会上披露更多 AI Agent 应用场景，客户采用率和调用量保持增长。",
            "impact": "企业级 AI 渗透率提升，有助于提高长期收入弹性。",
        },
    ],
    "GOOGL": [
        {
            "title": "谷歌加码 AI 搜索商业化，广告转化预期改善",
            "content": "谷歌扩展 AI 搜索广告测试范围，市场预期搜索货币化效率提升，广告 ROI 进一步改善。",
            "impact": "搜索商业化改善有助于缓解市场对流量价值稀释的担忧。",
        },
        {
            "title": "谷歌云 AI 产品订单增长，市场重新关注利润率弹性",
            "content": "谷歌云的 AI 产品订单与续约率持续提升，市场对云业务利润率弹性更为乐观。",
            "impact": "云业务订单改善有助于提升估值稳定性。",
        },
    ],
}

NOISE_TEMPLATES = [
    {
        "title": "分析师上调某科技股目标价，维持买入评级",
        "content": "投行分析师发布研报，上调目标价并维持买入评级，短线交易者关注股价弹性。",
    },
    {
        "title": "盘前异动：部分中小盘个股成交量放大",
        "content": "多只中小盘个股盘前异动，成交量短时放大，但暂无明确基本面催化。",
    },
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="模拟最近 5 个交易日的 2 小时新闻任务与收盘汇总任务。")
    parser.add_argument("--days", type=int, default=5, help="模拟最近几个交易日，默认 5。")
    parser.add_argument("--news-interval-hours", type=int, default=2, help="新闻任务间隔小时数，默认 2。")
    parser.add_argument("--seed", type=int, default=20260315, help="随机种子，默认 20260315。")
    parser.add_argument("--rebuild-db", action="store_true", help="运行前重建本地 SQLite。")
    parser.add_argument(
        "--report-path",
        default=str(OUTPUT_DIR / "test_week_simulation_report.json"),
        help="模拟报告输出路径。",
    )
    return parser.parse_args()


def get_recent_trade_dates(days: int) -> List[str]:
    latest = get_latest_closed_trading_day()
    dates = [latest]
    current = latest
    for _ in range(days - 1):
        current = subtract_trading_days(current, 1)
        dates.append(current)
    return sorted(dates)


def build_prices_for_trade_dates(trade_dates: List[str]) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for symbol in TRACKED_ORDER:
        meta = SYMBOL_META[symbol]
        previous_close = meta["start"]
        moves = meta["moves"]
        for index, trade_date in enumerate(trade_dates):
            move = moves[index % len(moves)]
            current = round(previous_close * (1 + move / 100), 4)
            rows.append({
                "k_date": trade_date,
                "stock_code": symbol,  # 兼容字段
                "stock_name": meta["name"],
                "symbol": symbol,
                "yahoo_symbol": YAHOO_SYMBOL_MAP.get(symbol),
                "current_price": current,
                "change_percent": round(move, 2),
                "volume": meta["volume"] + index * 17000 if meta["volume"] else 0,
                "captured_at": f"{trade_date} 18:00:00",
            })
            previous_close = current
    return rows


def build_news_slots(trade_date: str, interval_hours: int) -> List[str]:
    previous_trade = subtract_trading_days(trade_date, 1)
    previous_slots = [f"{previous_trade} {hour:02d}:00:00" for hour in range(18, 24, interval_hours)]
    current_slots = [f"{trade_date} {hour:02d}:00:00" for hour in range(0, 16, interval_hours)]
    return previous_slots + current_slots


def build_news_item(trade_date: str, slot_time: str, slot_index: int, item_index: int, rng: random.Random) -> Dict[str, Any]:
    category = rng.choices(
        population=["macro", "market", "symbol", "noise"],
        weights=[0.3, 0.25, 0.35, 0.10],
        k=1,
    )[0]
    event_id = f"{trade_date.replace('-', '')}-{slot_index:02d}-{item_index:02d}"
    source = f"demo_slot_{slot_index:02d}"
    minute = rng.choice([5, 12, 18, 26, 33, 41, 48, 54])
    timestamp = f"{slot_time[:14]}{minute:02d}:00"

    if category == "symbol":
        symbol = rng.choice(["MU", "LITE", "MSFT", "GOOGL"])
        template = rng.choice(SYMBOL_TEMPLATES[symbol])
        stars = rng.randint(3, 5)
        return {
            "pub_date": timestamp,
            "title": f"{template['title']} #{event_id}",
            "content": template["content"],
            "url": f"https://demo.local/sim/{symbol.lower()}-{event_id}",
            "source": source,
            "type": "symbol",
            "rule_passed": 1,
            "rule_score": round(rng.uniform(6.2, 10.8), 2),
            "rule_reason": f"涉及跟踪标的 {symbol}",
            "processing_status": "llm_processed",
            "ai_summary": template["title"],
            "market_impact": template["impact"],
            "importance_level": "high" if stars >= 4 else "medium",
            "importance_stars": stars,
            "primary_symbol": symbol,
            "related_symbols": [symbol],
            "is_relevant_to_review": 1,
        }

    if category == "market":
        template = rng.choice(MARKET_TEMPLATES)
        stars = rng.randint(*template["stars"])
        return {
            "pub_date": timestamp,
            "title": f"{template['title']} #{event_id}",
            "content": template["content"],
            "url": f"https://demo.local/sim/market-{event_id}",
            "source": source,
            "type": "market",
            "rule_passed": 1,
            "rule_score": round(rng.uniform(5.5, 9.8), 2),
            "rule_reason": f"市场主线命中 {', '.join(template['symbols'][:2])}",
            "processing_status": "llm_processed",
            "ai_summary": template["title"],
            "market_impact": template["impact"],
            "importance_level": "high" if stars >= 4 else "medium",
            "importance_stars": stars,
            "primary_symbol": template["symbols"][0],
            "related_symbols": template["symbols"],
            "is_relevant_to_review": 1,
        }

    if category == "noise":
        template = rng.choice(NOISE_TEMPLATES)
        return {
            "pub_date": timestamp,
            "title": f"{template['title']} #{event_id}",
            "content": template["content"],
            "url": f"https://demo.local/sim/noise-{event_id}",
            "source": source,
            "type": "market",
            "rule_passed": 0,
            "rule_score": round(rng.uniform(0.5, 2.4), 2),
            "rule_reason": "噪音样本，用于模拟小时任务中的低价值新闻",
            "processing_status": "llm_discarded",
            "ai_summary": "",
            "market_impact": "",
            "importance_level": "low",
            "importance_stars": 0,
            "primary_symbol": None,
            "related_symbols": [],
            "is_relevant_to_review": 0,
        }

    template = rng.choice(MACRO_TEMPLATES)
    stars = rng.randint(*template["stars"])
    return {
        "pub_date": timestamp,
        "title": f"{template['title']} #{event_id}",
        "content": template["content"],
        "url": f"https://demo.local/sim/macro-{event_id}",
        "source": source,
        "type": "macro",
        "rule_passed": 1,
        "rule_score": round(rng.uniform(7.2, 11.5), 2),
        "rule_reason": f"宏观主线命中 {', '.join(template['symbols'][:2])}",
        "processing_status": "llm_processed",
        "ai_summary": template["title"],
        "market_impact": template["impact"],
        "importance_level": "high" if stars >= 4 else "medium",
        "importance_stars": stars,
        "primary_symbol": template["symbols"][0],
        "related_symbols": template["symbols"],
        "is_relevant_to_review": 1,
    }


def build_news_batches(trade_dates: List[str], interval_hours: int, seed: int) -> List[Dict[str, Any]]:
    batches: List[Dict[str, Any]] = []
    for day_index, trade_date in enumerate(trade_dates):
        slots = build_news_slots(trade_date, interval_hours)
        for slot_index, slot_time in enumerate(slots):
            rng = random.Random(f"{seed}:{trade_date}:{slot_index}")
            batch_size = rng.randint(1, 3)
            items = [
                build_news_item(trade_date, slot_time, slot_index, item_index, rng)
                for item_index in range(batch_size)
            ]
            batches.append({
                "trade_date": trade_date,
                "slot_time": slot_time,
                "batch_no": day_index * 100 + slot_index,
                "items": items,
            })
    return batches


def insert_daily_prices(prices: List[Dict[str, Any]], trade_date: str) -> int:
    day_prices = [item for item in prices if item["k_date"] == trade_date]
    return batch_insert_prices(day_prices)


def simulate_week(days: int, interval_hours: int, seed: int, rebuild_db_first: bool) -> Dict[str, Any]:
    if rebuild_db_first:
        rebuild_database()

    trade_dates = get_recent_trade_dates(days)
    prices = build_prices_for_trade_dates(trade_dates)
    batches = build_news_batches(trade_dates, interval_hours, seed)

    report: Dict[str, Any] = {
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "seed": seed,
        "trade_dates": trade_dates,
        "news_interval_hours": interval_hours,
        "hourly_runs": [],
        "close_runs": [],
    }

    batches_by_day: Dict[str, List[Dict[str, Any]]] = {trade_date: [] for trade_date in trade_dates}
    for batch in batches:
        batches_by_day[batch["trade_date"]].append(batch)

    for trade_date in trade_dates:
        day_batches = batches_by_day[trade_date]
        for batch in day_batches:
            stats = upsert_news_batch(batch["items"])
            report["hourly_runs"].append({
                "trade_date": trade_date,
                "slot_time": batch["slot_time"],
                "batch_no": batch["batch_no"],
                "generated_items": len(batch["items"]),
                "inserted": stats["inserted"],
                "updated": stats["updated"],
                "ignored": stats["ignored"],
            })

        inserted_prices = insert_daily_prices(prices, trade_date)
        summary_news = load_news_for_summary(trade_date, use_remote=False)
        summary_record = build_daily_summary_record(summary_news, trade_date)
        save_news_analysis(summary_record)
        initialize_archive_record(trade_date)
        report["close_runs"].append({
            "trade_date": trade_date,
            "inserted_prices": inserted_prices,
            "summary_news_count": len(summary_news),
            "market_analysis": summary_record.get("market_analysis"),
        })

    return report


def main() -> None:
    args = parse_args()
    report = simulate_week(
        days=args.days,
        interval_hours=args.news_interval_hours,
        seed=args.seed,
        rebuild_db_first=args.rebuild_db,
    )
    report_path = Path(args.report_path)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print("=" * 60)
    print("TEST 周度模拟完成")
    print("=" * 60)
    print(f"交易日: {', '.join(report['trade_dates'])}")
    print(f"新闻任务批次: {len(report['hourly_runs'])}")
    print(f"收盘汇总任务批次: {len(report['close_runs'])}")
    print(f"报告输出: {report_path}")


if __name__ == "__main__":
    main()
