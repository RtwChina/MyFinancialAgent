"""Live news-source implementation backed by real third-party interfaces.

This module owns only raw input collection. It does not perform rule
screening, LLM enhancement, or persistence.
"""

from __future__ import annotations

import json
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from zoneinfo import ZoneInfo

import requests
import yfinance as yf
from bs4 import BeautifulSoup

from logger_utils import get_logger
from runtime.context import ExecutionContext


logger = get_logger("news_live")
# 模拟浏览器请求头，减少被反爬拦截的概率
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
}
# 国内新闻源时区（北京）与下游复盘窗口所用时区（纽约）
BEIJING_TZ = ZoneInfo("Asia/Shanghai")
REVIEW_TZ = ZoneInfo("America/New_York")


def _format_for_review_window(dt: datetime | None, *, assume_tz: ZoneInfo | None = None) -> str:
    """Normalize upstream timestamps into the review window timezone.

    The downstream summary window compares plain `YYYY-MM-DD HH:MM:SS` strings
    against NYSE-based review windows. Live source timestamps therefore need to
    be converted into the same timezone before entering the business pipeline.
    """

    if dt is None:
        return ""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=assume_tz or REVIEW_TZ)
    return dt.astimezone(REVIEW_TZ).strftime("%Y-%m-%d %H:%M:%S")


def fetch_sina_finance() -> list[dict]:
    """从新浪财经滚动接口抓取最新财经资讯。"""
    url = "https://feed.sina.com.cn/api/roll/get"
    # lid=2509 对应新浪财经滚动新闻频道
    params = {
        "pageid": "153",
        "lid": "2509",
        "k": "",
        "num": 50,
        "page": 1,
    }
    try:
        logger.info("正在抓取新浪财经...")
        resp = requests.get(url, headers=HEADERS, params=params, timeout=15)
        resp.raise_for_status()

        result = resp.json().get("result", {}).get("data", [])
        news_list: list[dict] = []
        for item in result:
            # ctime 可能以字符串形式返回，统一转为 int 再解析为带时区的 datetime
            timestamp = item.get("ctime", 0)
            if isinstance(timestamp, str):
                timestamp = int(timestamp)
            pub_time = datetime.fromtimestamp(timestamp, tz=BEIJING_TZ)
            news_list.append(
                {
                    "time": _format_for_review_window(pub_time),
                    "title": item.get("title", ""),
                    "content": item.get("intro", "") or item.get("title", ""),
                    "url": item.get("url", ""),
                    "source": "sina",
                }
            )
        logger.info("新浪财经: %s 条", len(news_list))
        return news_list
    except Exception as exc:
        logger.error("新浪财经失败: %s", exc)
        return []


def fetch_cls_cn() -> list[dict]:
    """从财联社电报页面抓取快讯列表。"""
    url = "https://www.cls.cn/telegraph"
    try:
        logger.info("正在抓取财联社...")
        resp = requests.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()

        # 财联社使用 Next.js 服务端渲染，数据内嵌在 <script type="application/json"> 中
        match = re.search(r'<script[^>]*type="application/json"[^>]*>(.+?)</script>', resp.text, re.DOTALL)
        if not match:
            return []

        # 沿 props -> initialState -> telegraph -> telegraphList 路径提取电报列表
        telegraph_list = (
            json.loads(match.group(1))
            .get("props", {})
            .get("initialState", {})
            .get("telegraph", {})
            .get("telegraphList", [])
        )
        news_list: list[dict] = []
        for item in telegraph_list:
            pub_time = datetime.fromtimestamp(item.get("ctime", 0), tz=BEIJING_TZ) if item.get("ctime") else None
            news_list.append(
                {
                    "time": _format_for_review_window(pub_time),
                    "title": item.get("title", ""),
                    "content": item.get("content", "")[:500],
                    "source": "cls_cn",
                }
            )
        logger.info("财联社: %s 条", len(news_list))
        return news_list
    except Exception as exc:
        logger.error("财联社失败: %s", exc)
        return []


def fetch_jin10(context: ExecutionContext) -> list[dict]:
    """从金十数据首页抓取快讯条目，需要 context.clock 来补全时间中缺少的日期部分。"""
    url = "https://www.jin10.com/"
    try:
        logger.info("正在抓取金十数据...")
        resp = requests.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        resp.encoding = "utf-8"

        soup = BeautifulSoup(resp.text, "html.parser")
        # 金十快讯条目的 DOM id 均以 "flash" 开头
        flash_items = soup.find_all(id=lambda value: value and value.startswith("flash"))

        news_list: list[dict] = []
        for item in flash_items:
            try:
                time_elem = item.select_one(".jin-flash_time, [class*='time']")
                pub_time_str = time_elem.get_text(strip=True) if time_elem else ""

                pub_time = None
                if pub_time_str and len(pub_time_str) == 8:
                    # 页面只展示 HH:MM:SS，需拼上当前北京日期才能构成完整 datetime
                    current = context.clock.now_in_tz("Asia/Shanghai")
                    parsed = datetime.strptime(
                        f"{current.strftime('%Y-%m-%d')} {pub_time_str}",
                        "%Y-%m-%d %H:%M:%S",
                    )
                    pub_time = parsed.replace(tzinfo=BEIJING_TZ)

                text = item.get_text(strip=True)
                content_elem = item.select_one(".jin-flash_content, [class*='content']")
                content = content_elem.get_text(strip=True) if content_elem else text.replace(pub_time_str, "").strip()
                # 清除金十页面固定出现的操作按钮文本噪声
                content = content.replace("分享收藏详情复制", "").strip()
                is_vip = bool(item.select_one(".vip, [class*='vip'], .lock")) or "VIP" in text

                if content and len(content) > 10:
                    news_list.append(
                        {
                            "time": _format_for_review_window(pub_time),
                            "title": "",
                            "content": content[:500],
                            "source": "jin10",
                            "is_vip": is_vip,
                        }
                    )
            except Exception:
                continue

        # 以内容前 50 字符作为去重键，过滤重复快讯
        seen: set[str] = set()
        unique_list: list[dict] = []
        for item in news_list:
            key = item["content"][:50]
            if key not in seen:
                seen.add(key)
                unique_list.append(item)

        logger.info("金十数据: %s 条", len(unique_list))
        return unique_list
    except Exception as exc:
        logger.error("金十数据失败: %s", exc)
        return []


def fetch_yahoo_finance_news() -> list[dict]:
    """从 Yahoo Finance 首页 HTML 和 yfinance SDK 双渠道抓取英文财经新闻。"""
    url = "https://finance.yahoo.com/"
    try:
        logger.info("正在抓取Yahoo财经...")
        resp = requests.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()

        soup = BeautifulSoup(resp.text, "html.parser")
        news_list: list[dict] = []

        # 第一渠道：从首页 HTML 中提取新闻链接（最多取前 30 条）
        news_links = soup.select('a[href*="/news/"], a[href*="news.yahoo.com"]')
        for link in news_links[:30]:
            title = link.get_text(strip=True)
            href = link.get("href", "")
            if title and len(title) > 10 and "news" in href.lower():
                news_list.append(
                    {
                        "time": "",
                        "title": title,
                        "content": title,
                        "url": href if href.startswith("http") else f"https://finance.yahoo.com{href}",
                        "source": "yahoo_finance",
                    }
                )

        # 第二渠道：通过 yfinance 获取标普 500 指数相关新闻，补充首页可能遗漏的条目
        try:
            yahoo_news = yf.Ticker("^GSPC").news
            if yahoo_news:
                for item in yahoo_news[:20]:
                    content = item.get("content", {})
                    title = content.get("title", "")
                    pub_date = content.get("pubDate", "")
                    pub_time = None
                    if pub_date:
                        try:
                            pub_time = datetime.fromisoformat(pub_date.replace("Z", "+00:00"))
                        except Exception:
                            pub_time = None
                    if title:
                        news_list.append(
                            {
                                "time": _format_for_review_window(pub_time),
                                "title": title,
                                "content": content.get("summary", title)[:500],
                                "url": content.get("canonicalUrl", {}).get("url", ""),
                                "source": "yahoo_finance",
                            }
                        )
        except Exception as exc:
            logger.warning("Yahoo yfinance 获取失败: %s", exc)

        # 以标题前 50 字符去重，合并两个渠道的结果
        seen: set[str] = set()
        unique_list: list[dict] = []
        for item in news_list:
            key = item.get("title", "")[:50]
            if key and key not in seen:
                seen.add(key)
                unique_list.append(item)

        logger.info("Yahoo财经: %s 条", len(unique_list))
        return unique_list
    except Exception as exc:
        logger.error("Yahoo财经失败: %s", exc)
        return []


def fetch_all_news_live(context: ExecutionContext) -> list[dict]:
    """Fetch all live news inputs in parallel.

    This keeps the existing four-source behavior unchanged while moving the
    source-selection decision outside the business pipeline.
    """

    all_news: list[dict] = []
    # 四个新闻源并发抓取，max_workers=4 与源数量对应，最大化利用 I/O 等待时间
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = {
            executor.submit(fetch_sina_finance): "sina",
            executor.submit(fetch_cls_cn): "cls_cn",
            executor.submit(fetch_jin10, context): "jin10",
            executor.submit(fetch_yahoo_finance_news): "yahoo",
        }
        # as_completed 保证先完成的任务优先处理，单源失败不阻塞其他源
        for future in as_completed(futures):
            source = futures[future]
            try:
                all_news.extend(future.result())
            except Exception as exc:
                logger.error("%s 采集失败: %s", source, exc)
    return all_news
