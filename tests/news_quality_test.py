"""新闻源质量对比测试

本地 SQLite 数据库对比 Finnhub、AkShare 和当前数据源的新闻质量。
用法: python tests/news_quality_test.py [--sources current,finnhub,akshare]
"""

import argparse
import sqlite3
import sys
import os
import time
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

# 将 src 加入 path 以复用现有模块
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

BEIJING_TZ = ZoneInfo("Asia/Shanghai")
DB_PATH = Path(__file__).resolve().parent / "news_test.db"
FINNHUB_API_KEY = os.environ.get("FINNHUB_API_KEY", "")

# Finnhub 测试用的美股 symbol 列表
FINNHUB_SYMBOLS = ["AAPL", "MSFT", "GOOGL", "NVDA", "MU", "LITE"]
# AkShare 测试用的 A 股 symbol 列表
AKSHARE_SYMBOLS_EM = ["300059", "000001", "600519"]  # 东方财富 symbol


def init_db():
    """初始化本地对比数据库。"""
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS news_compare (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source TEXT NOT NULL,
            sub_source TEXT DEFAULT '',
            symbol TEXT DEFAULT '',
            title TEXT DEFAULT '',
            content TEXT DEFAULT '',
            content_length INTEGER DEFAULT 0,
            pub_time TEXT DEFAULT '',
            url TEXT DEFAULT '',
            fetched_at TEXT NOT NULL
        )
    """)
    conn.execute("DELETE FROM news_compare")
    conn.commit()
    return conn


def save_rows(conn: sqlite3.Connection, rows: list[dict]):
    """批量写入新闻记录。"""
    now = datetime.now(BEIJING_TZ).strftime("%Y-%m-%d %H:%M:%S")
    for r in rows:
        content = r.get("content", "")
        conn.execute(
            "INSERT INTO news_compare (source, sub_source, symbol, title, content, content_length, pub_time, url, fetched_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                r.get("source", ""),
                r.get("sub_source", ""),
                r.get("symbol", ""),
                r.get("title", ""),
                content,
                len(content),
                r.get("pub_time", ""),
                r.get("url", ""),
                now,
            ),
        )
    conn.commit()


# ── 当前数据源 ──────────────────────────────────────────────

def fetch_current_sources() -> list[dict]:
    """复用现有 news_live 模块抓取四个源。"""
    print("\n[当前源] 抓取中...")
    try:
        from data_sources.news_live import (
            fetch_sina_finance,
            fetch_cls_cn,
            fetch_yahoo_finance_news,
        )
    except ImportError as e:
        print(f"  导入失败: {e}")
        return []

    rows = []
    for name, fn in [("sina", fetch_sina_finance), ("cls_cn", fetch_cls_cn), ("yahoo", fetch_yahoo_finance_news)]:
        try:
            items = fn()
            for item in items:
                rows.append({
                    "source": "current",
                    "sub_source": name,
                    "title": item.get("title", ""),
                    "content": item.get("content", ""),
                    "pub_time": item.get("time", ""),
                    "url": item.get("url", ""),
                })
            print(f"  {name}: {len(items)} 条")
        except Exception as e:
            print(f"  {name} 失败: {e}")

    # jin10 需要 context，跳过
    print(f"  (jin10 需要 ExecutionContext，跳过)")
    return rows


# ── Finnhub ─────────────────────────────────────────────────

def fetch_finnhub_news() -> list[dict]:
    """通过 Finnhub API 抓取公司新闻和市场大盘新闻。"""
    print("\n[Finnhub] 抓取中...")
    try:
        import finnhub
    except ImportError:
        print("  finnhub-python 未安装")
        return []

    client = finnhub.Client(api_key=FINNHUB_API_KEY)
    today = datetime.now().strftime("%Y-%m-%d")
    week_ago = (datetime.now() - timedelta(days=3)).strftime("%Y-%m-%d")

    rows = []

    # 1. 市场大盘新闻
    try:
        general = client.general_news("general", min_id=0)
        for item in (general or []):
            rows.append({
                "source": "finnhub",
                "sub_source": "general",
                "symbol": "",
                "title": item.get("headline", ""),
                "content": item.get("summary", ""),
                "pub_time": datetime.fromtimestamp(item.get("datetime", 0), tz=BEIJING_TZ).strftime("%Y-%m-%d %H:%M:%S") if item.get("datetime") else "",
                "url": item.get("url", ""),
            })
        print(f"  general: {len(general or [])} 条")
    except Exception as e:
        print(f"  general 失败: {e}")

    # 2. 按 symbol 抓取公司新闻
    for sym in FINNHUB_SYMBOLS:
        try:
            news = client.company_news(sym, _from=week_ago, to=today)
            for item in (news or [])[:10]:  # 每个 symbol 最多 10 条
                rows.append({
                    "source": "finnhub",
                    "sub_source": "company",
                    "symbol": sym,
                    "title": item.get("headline", ""),
                    "content": item.get("summary", ""),
                    "pub_time": datetime.fromtimestamp(item.get("datetime", 0), tz=BEIJING_TZ).strftime("%Y-%m-%d %H:%M:%S") if item.get("datetime") else "",
                    "url": item.get("url", ""),
                })
            print(f"  {sym}: {len(news or [])} 条 (取前10)")
            time.sleep(0.5)  # 避免触发限频
        except Exception as e:
            print(f"  {sym} 失败: {e}")

    return rows


# ── AkShare ─────────────────────────────────────────────────

def fetch_akshare_news() -> list[dict]:
    """通过 AkShare 抓取 A 股相关新闻。"""
    print("\n[AkShare] 抓取中...")
    try:
        import akshare as ak
    except ImportError:
        print("  akshare 未安装")
        return []

    rows = []

    # 1. 财联社全球快讯 (stock_info_global_cls)
    try:
        df = ak.stock_info_global_cls()
        if df is not None and not df.empty:
            for _, row in df.iterrows():
                rows.append({
                    "source": "akshare",
                    "sub_source": "cls",
                    "title": str(row.get("标题", "")),
                    "content": str(row.get("内容", "")),
                    "pub_time": f"{row.get('发布日期', '')} {row.get('发布时间', '')}".strip(),
                })
            print(f"  财联社(cls): {len(df)} 条")
    except Exception as e:
        print(f"  财联社(cls)失败: {e}")

    # 2. 同花顺全球快讯 (stock_info_global_ths)
    try:
        df = ak.stock_info_global_ths()
        if df is not None and not df.empty:
            for _, row in df.iterrows():
                rows.append({
                    "source": "akshare",
                    "sub_source": "10jqka",
                    "title": str(row.get("标题", "")),
                    "content": str(row.get("内容", "")),
                    "pub_time": str(row.get("发布时间", "")),
                    "url": str(row.get("链接", "")),
                })
            print(f"  同花顺(10jqka): {len(df)} 条")
    except Exception as e:
        print(f"  同花顺(10jqka)失败: {e}")

    # 3. 财新 (stock_news_main_cx)
    try:
        df = ak.stock_news_main_cx()
        if df is not None and not df.empty:
            for _, row in df.iterrows():
                rows.append({
                    "source": "akshare",
                    "sub_source": "caixin",
                    "title": str(row.get("tag", "")),
                    "content": str(row.get("summary", "")),
                    "url": str(row.get("url", "")),
                })
            print(f"  财新(caixin): {len(df)} 条")
    except Exception as e:
        print(f"  财新(caixin)失败: {e}")

    # 4. 新浪全球快讯 (stock_info_global_sina)
    try:
        df = ak.stock_info_global_sina()
        if df is not None and not df.empty:
            for _, row in df.iterrows():
                rows.append({
                    "source": "akshare",
                    "sub_source": "sina",
                    "content": str(row.get("内容", "")),
                    "pub_time": str(row.get("时间", "")),
                })
            print(f"  新浪(sina): {len(df)} 条")
    except Exception as e:
        print(f"  新浪(sina)失败: {e}")

    # 5. 富途全球快讯 (stock_info_global_futu)
    try:
        df = ak.stock_info_global_futu()
        if df is not None and not df.empty:
            for _, row in df.iterrows():
                rows.append({
                    "source": "akshare",
                    "sub_source": "futu",
                    "title": str(row.get("标题", "")),
                    "content": str(row.get("内容", "")),
                    "pub_time": str(row.get("发布时间", "")),
                    "url": str(row.get("链接", "")),
                })
            print(f"  富途(futu): {len(df)} 条")
    except Exception as e:
        print(f"  富途(futu)失败: {e}")

    # 6. 东方财富全球快讯 (stock_info_global_em)
    try:
        df = ak.stock_info_global_em()
        if df is not None and not df.empty:
            for _, row in df.iterrows():
                rows.append({
                    "source": "akshare",
                    "sub_source": "eastmoney_global",
                    "title": str(row.get("标题", "")),
                    "content": str(row.get("摘要", "")),
                    "pub_time": str(row.get("发布时间", "")),
                    "url": str(row.get("链接", "")),
                })
            print(f"  东方财富全球(em): {len(df)} 条")
    except Exception as e:
        print(f"  东方财富全球(em)失败: {e}")

    # 7. 东方财富个股新闻
    for sym in AKSHARE_SYMBOLS_EM:
        try:
            df = ak.stock_news_em(symbol=sym)
            if df is not None and not df.empty:
                for _, row in df.head(10).iterrows():
                    rows.append({
                        "source": "akshare",
                        "sub_source": "eastmoney",
                        "symbol": sym,
                        "title": str(row.get("新闻标题", "")),
                        "content": str(row.get("新闻内容", "")),
                        "pub_time": str(row.get("发布时间", "")),
                        "url": str(row.get("新闻链接", "")),
                    })
                print(f"  东方财富 {sym}: {len(df)} 条 (取前10)")
            time.sleep(1)
        except Exception as e:
            print(f"  东方财富 {sym} 失败: {e}")

    return rows


# ── 对比报告 ────────────────────────────────────────────────

def print_report(conn: sqlite3.Connection):
    """打印对比报告。"""
    print("\n" + "=" * 70)
    print("新闻源质量对比报告")
    print("=" * 70)

    # 总览
    cur = conn.execute("""
        SELECT source, sub_source, COUNT(*) as cnt,
               ROUND(AVG(content_length)) as avg_len,
               MIN(content_length) as min_len,
               MAX(content_length) as max_len
        FROM news_compare
        GROUP BY source, sub_source
        ORDER BY source, sub_source
    """)
    print(f"\n{'源':<12} {'子源':<16} {'条数':>6} {'平均字数':>8} {'最短':>6} {'最长':>6}")
    print("-" * 60)
    for row in cur.fetchall():
        print(f"{row[0]:<12} {row[1]:<16} {row[2]:>6} {row[3]:>8.0f} {row[4]:>6} {row[5]:>6}")

    # 内容长度分布
    print(f"\n--- 内容长度分布 ---")
    cur = conn.execute("""
        SELECT source, sub_source,
               SUM(CASE WHEN content_length < 50 THEN 1 ELSE 0 END) as '<50',
               SUM(CASE WHEN content_length BETWEEN 50 AND 200 THEN 1 ELSE 0 END) as '50-200',
               SUM(CASE WHEN content_length BETWEEN 200 AND 500 THEN 1 ELSE 0 END) as '200-500',
               SUM(CASE WHEN content_length > 500 THEN 1 ELSE 0 END) as '>500'
        FROM news_compare
        GROUP BY source, sub_source
    """)
    print(f"\n{'源':<12} {'子源':<16} {'<50字':>6} {'50-200':>8} {'200-500':>8} {'>500字':>8}")
    print("-" * 62)
    for row in cur.fetchall():
        print(f"{row[0]:<12} {row[1]:<16} {row[2]:>6} {row[3]:>8} {row[4]:>8} {row[5]:>8}")

    # 每个源的样本
    print(f"\n--- 各源内容样本（前3条） ---")
    sources = conn.execute("SELECT DISTINCT source, sub_source FROM news_compare ORDER BY source, sub_source").fetchall()
    for src, sub in sources:
        print(f"\n[{src} / {sub}]")
        samples = conn.execute(
            "SELECT title, content, content_length, pub_time FROM news_compare WHERE source=? AND sub_source=? ORDER BY content_length DESC LIMIT 3",
            (src, sub),
        ).fetchall()
        for i, (title, content, clen, ptime) in enumerate(samples, 1):
            print(f"  {i}. [{clen}字] {ptime}")
            if title:
                print(f"     标题: {title[:80]}")
            preview = content[:150].replace("\n", " ")
            print(f"     内容: {preview}{'...' if len(content) > 150 else ''}")

    print(f"\n数据库位置: {DB_PATH}")
    print(f"总记录数: {conn.execute('SELECT COUNT(*) FROM news_compare').fetchone()[0]}")


def main():
    parser = argparse.ArgumentParser(description="新闻源质量对比测试")
    parser.add_argument("--sources", default="current,finnhub,akshare", help="要测试的源，逗号分隔")
    args = parser.parse_args()
    sources = [s.strip() for s in args.sources.split(",")]

    print(f"测试源: {sources}")
    print(f"数据库: {DB_PATH}")

    conn = init_db()

    if "current" in sources:
        rows = fetch_current_sources()
        save_rows(conn, rows)
        print(f"  共写入 {len(rows)} 条")

    if "finnhub" in sources:
        rows = fetch_finnhub_news()
        save_rows(conn, rows)
        print(f"  共写入 {len(rows)} 条")

    if "akshare" in sources:
        rows = fetch_akshare_news()
        save_rows(conn, rows)
        print(f"  共写入 {len(rows)} 条")

    print_report(conn)
    conn.close()


if __name__ == "__main__":
    main()
