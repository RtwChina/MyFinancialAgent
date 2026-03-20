from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List

import pandas as pd

TRACKED_ORDER = [
    "MU",
    "LITE",
    "MSFT",
    "GOOGL",
    "VIX",
    "HSI",
    "GSPC",
    "SSE",
    "DXY",
    "GOLD",
]

# symbol -> yahoo_symbol mapping
YAHOO_SYMBOL_MAP = {
    "MU": "MU",
    "LITE": "LITE",
    "MSFT": "MSFT",
    "GOOGL": "GOOGL",
    "VIX": "^VIX",
    "HSI": "^HSI",
    "GSPC": "^GSPC",
    "SSE": "000001.SS",
    "DXY": "DX-Y.NYB",
    "GOLD": "GC=F",
}

SYMBOL_META = {
    "MU": {"name": "Micron Technology", "start": 109.2, "moves": [1.2, 2.4, -0.8, 3.1, 2.5], "volume": 38210000},
    "LITE": {"name": "Lumentum", "start": 57.8, "moves": [0.6, -0.4, 1.5, 0.8, 1.1], "volume": 3210000},
    "MSFT": {"name": "Microsoft", "start": 414.5, "moves": [0.9, 1.2, -0.7, -1.1, 0.4], "volume": 25400000},
    "GOOGL": {"name": "Alphabet", "start": 186.9, "moves": [1.1, 0.7, -0.6, 0.5, 0.8], "volume": 21800000},
    "VIX": {"name": "CBOE Volatility Index", "start": 19.8, "moves": [-1.5, 0.8, 1.1, 2.6, -0.4], "volume": 0},
    "HSI": {"name": "HANG SENG INDEX", "start": 24080.0, "moves": [0.6, -0.3, 0.9, 1.4, -0.7], "volume": 0},
    "GSPC": {"name": "S&P 500", "start": 5860.2, "moves": [0.5, 0.7, -0.4, -0.9, 0.2], "volume": 2850000000},
    "SSE": {"name": "SSE Composite Index", "start": 3335.4, "moves": [0.2, 0.4, -0.1, 0.3, 0.5], "volume": 1760000000},
    "DXY": {"name": "Dollar Index", "start": 103.1, "moves": [-0.2, -0.3, 0.4, 0.6, 0.3], "volume": 0},
    "GOLD": {"name": "Gold Futures", "start": 2928.5, "moves": [0.8, 0.6, 1.1, 0.7, -0.2], "volume": 162000},
}

DEMO_DATES = ["2026-03-09", "2026-03-10", "2026-03-11", "2026-03-12", "2026-03-13"]


def build_demo_prices_dataframe() -> pd.DataFrame:
    rows: List[Dict[str, Any]] = []
    for symbol in TRACKED_ORDER:
        meta = SYMBOL_META[symbol]
        price = meta["start"]
        previous_close = price
        for index, k_date in enumerate(DEMO_DATES):
            move = meta["moves"][index]
            current = round(previous_close * (1 + move / 100), 4)
            rows.append({
                "k_date": k_date,
                "stock_code": symbol,  # 兼容字段
                "stock_name": meta["name"],
                "symbol": symbol,
                "yahoo_symbol": YAHOO_SYMBOL_MAP.get(symbol),
                "current_price": current,
                "change_percent": round(move, 2),
                "volume": meta["volume"] + index * 17000 if meta["volume"] else 0,
                "captured_at": f"{k_date} 18:00:00",
            })
            previous_close = current
    return pd.DataFrame(rows)


def build_demo_news_feed() -> List[Dict[str, Any]]:
    return [
        {
            "time": "2026-03-10 08:20:00",
            "title": "美联储官员释放谨慎降息信号，美元走强",
            "content": "多位美联储官员强调通胀韧性仍在，市场下修二季度降息预期，美元指数回升，成长股承压。",
            "source": "demo_wire",
            "url": "https://demo.local/news/fed-dollar",
        },
        {
            "time": "2026-03-10 21:10:00",
            "title": "Micron 上调 HBM 出货指引，存储链预期升温",
            "content": "渠道消息称 Micron 将上调 HBM 与 DDR5 出货预期，带动存储、封装与服务器链景气度预期同步改善。",
            "source": "demo_wire",
            "url": "https://demo.local/news/mu-hbm",
        },
        {
            "time": "2026-03-11 07:40:00",
            "title": "中东航运再受扰动，油价和黄金同步走强",
            "content": "霍尔木兹海峡周边风险升温，原油和黄金快速上涨，全球风险资产短线承压，避险情绪回流。",
            "source": "demo_wire",
            "url": "https://demo.local/news/oil-gold",
        },
        {
            "time": "2026-03-11 19:30:00",
            "title": "微软宣布新一代企业 AI 服务定价方案",
            "content": "微软在企业 AI 服务中新增按调用量计费方案，利好云与软件收入弹性，但市场担忧企业开支审核趋严。",
            "source": "demo_wire",
            "url": "https://demo.local/news/msft-ai",
        },
        {
            "time": "2026-03-12 05:50:00",
            "title": "美国 10 年期国债收益率冲高，科技板块波动放大",
            "content": "收益率重回高位后，高估值科技股承压，纳指盘前波动显著放大，市场重新计价贴现率风险。",
            "source": "demo_wire",
            "url": "https://demo.local/news/us10y-tech",
        },
        {
            "time": "2026-03-12 22:05:00",
            "title": "谷歌加码 AI 搜索商业化，广告转化预期改善",
            "content": "谷歌宣布扩展 AI 搜索广告测试，市场预期搜索商业化效率改善，Alphabet 盘后走高。",
            "source": "demo_wire",
            "url": "https://demo.local/news/googl-search",
        },
        {
            "time": "2026-03-13 06:45:00",
            "title": "铜与黄金联动上行，资源股获得资金回流",
            "content": "铜价和金价同步走强，资源股与顺周期方向获得资金关注，市场风格从纯成长向均衡切换。",
            "source": "demo_wire",
            "url": "https://demo.local/news/copper-gold",
        },
        {
            "time": "2026-03-13 21:20:00",
            "title": "Lumentum 获得大型光模块订单，AI 网络链再获催化",
            "content": "Lumentum 获得头部客户新一轮光模块订单，AI 网络基础设施资本开支预期继续上修。",
            "source": "demo_wire",
            "url": "https://demo.local/news/lite-order",
        },
        {
            "time": "2026-03-14 10:30:00",
            "title": "美国零售销售略低于预期，市场重新博弈增长放缓",
            "content": "零售销售略低于预期后，市场重新讨论增长动能边际放缓，利率下行但风险偏好未明显修复。",
            "source": "demo_wire",
            "url": "https://demo.local/news/retail-sales",
        },
        {
            "time": "2026-03-15 18:10:00",
            "title": "周末中东局势再起波澜，周一全球市场或先计入避险交易",
            "content": "周末突发消息加剧中东不确定性，原油、黄金和美元可能在周一开盘前继续获得避险买盘。",
            "source": "demo_wire",
            "url": "https://demo.local/news/weekend-risk",
        },
    ]


def demo_generated_at() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")
