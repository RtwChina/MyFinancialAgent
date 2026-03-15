"""
新闻采集脚本 v3.0
整合: 新浪财经、财联社、金十数据、Yahoo财经美股首页
优化: LLM超时处理、重试机制、降级策略、数据库存储
注意: 新闻数据持续积累不做删除，复盘时根据时间范围查询
"""
import json
import re
import os
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests
import yfinance as yf
import pandas as pd
import pandas_market_calendars as mcal
import pytz

from config import (
    OUTPUT_DIR,
    LLM_API_KEY, LLM_BASE_URL, LLM_MODEL_ID,
    ENABLE_REMOTE_WRITE,
)
from cloudflare_ingest import CloudflareIngestError, is_remote_write_configured, send_news, send_news_analysis
from logger_utils import get_logger
from db_utils import init_database, batch_insert_news, save_news_analysis

logger = get_logger("collect_news_v3")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
}

# ========== 可配置参数 ==========
LLM_TIMEOUT = int(os.getenv("LLM_TIMEOUT", "120"))  # LLM 超时时间(秒)
LLM_MAX_RETRIES = int(os.getenv("LLM_MAX_RETRIES", "2"))  # 最大重试次数
LLM_MAX_WORKERS = int(os.getenv("LLM_MAX_WORKERS", "2"))  # 并发数降低，避免超时
SKIP_LLM = os.getenv("SKIP_LLM", "false").lower() == "true"  # 跳过 LLM 分析开关


# ========== 数据源1: 新浪财经 ==========
def fetch_sina_finance() -> list:
    """抓取新浪财经快讯（不筛选时间，全部采集）"""
    url = "https://feed.sina.com.cn/api/roll/get"
    params = {
        'pageid': '153',
        'lid': '2509',
        'k': '',
        'num': 50,
        'page': 1,
    }
    try:
        logger.info("正在抓取新浪财经...")
        resp = requests.get(url, headers=HEADERS, params=params, timeout=15)
        resp.raise_for_status()

        data = resp.json()
        result = data.get('result', {}).get('data', [])

        news_list = []
        for item in result:
            timestamp = item.get('ctime', 0)
            if isinstance(timestamp, str):
                timestamp = int(timestamp)
            pub_time = datetime.fromtimestamp(timestamp)

            news_list.append({
                'time': pub_time.strftime('%Y-%m-%d %H:%M:%S'),
                'title': item.get('title', ''),
                'content': item.get('intro', '') or item.get('title', ''),
                'url': item.get('url', ''),
                'source': 'sina',
            })

        logger.info(f"新浪财经: {len(news_list)} 条")
        return news_list

    except Exception as e:
        logger.error(f"新浪财经失败: {str(e)}")
        return []


# ========== 数据源2: 财联社 ==========
def fetch_cls_cn() -> list:
    """抓取财联社电报（不筛选时间，全部采集）"""
    url = "https://www.cls.cn/telegraph"
    try:
        logger.info("正在抓取财联社...")
        resp = requests.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()

        pattern = r'<script[^>]*type="application/json"[^>]*>(.+?)</script>'
        match = re.search(pattern, resp.text, re.DOTALL)

        if not match:
            return []

        data = json.loads(match.group(1))
        telegraph_list = data.get('props', {}).get('initialState', {}).get('telegraph', {}).get('telegraphList', [])

        news_list = []
        for item in telegraph_list:
            pub_time = datetime.fromtimestamp(item.get('ctime', 0)) if item.get('ctime') else None

            news_list.append({
                'time': pub_time.strftime('%Y-%m-%d %H:%M:%S') if pub_time else '',
                'title': item.get('title', ''),
                'content': item.get('content', '')[:500],
                'source': 'cls_cn',
            })

        logger.info(f"财联社: {len(news_list)} 条")
        return news_list

    except Exception as e:
        logger.error(f"财联社失败: {str(e)}")
        return []


# ========== 数据源3: 金十数据 ==========
def fetch_jin10() -> list:
    """抓取金十数据快讯（不筛选时间，全部采集）"""
    from bs4 import BeautifulSoup

    url = "https://www.jin10.com/"
    try:
        logger.info("正在抓取金十数据...")
        resp = requests.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        resp.encoding = 'utf-8'

        soup = BeautifulSoup(resp.text, 'html.parser')
        flash_items = soup.find_all(id=lambda x: x and x.startswith('flash'))

        news_list = []
        for item in flash_items:
            try:
                # 提取时间
                time_elem = item.select_one('.jin-flash_time, [class*="time"]')
                pub_time_str = time_elem.get_text(strip=True) if time_elem else ''

                # 解析时间 (格式 HH:MM:SS，需要加上日期)
                pub_time = None
                if pub_time_str and len(pub_time_str) == 8:
                    today = datetime.now()
                    pub_time = datetime.strptime(f"{today.strftime('%Y-%m-%d')} {pub_time_str}", '%Y-%m-%d %H:%M:%S')

                # 提取内容
                text = item.get_text(strip=True)
                content_elem = item.select_one('.jin-flash_content, [class*="content"]')
                content = content_elem.get_text(strip=True) if content_elem else text.replace(pub_time_str, '').strip()
                content = content.replace('分享收藏详情复制', '').strip()

                is_vip = bool(item.select_one('.vip, [class*="vip"], .lock')) or 'VIP' in text

                if content and len(content) > 10:
                    news_list.append({
                        'time': pub_time.strftime('%Y-%m-%d %H:%M:%S') if pub_time else pub_time_str,
                        'title': '',
                        'content': content[:500],
                        'source': 'jin10',
                        'is_vip': is_vip,
                    })
            except:
                continue

        # 去重
        seen = set()
        unique_list = []
        for item in news_list:
            key = item['content'][:50]
            if key not in seen:
                seen.add(key)
                unique_list.append(item)

        logger.info(f"金十数据: {len(unique_list)} 条")
        return unique_list

    except Exception as e:
        logger.error(f"金十数据失败: {str(e)}")
        return []


# ========== 数据源4: Yahoo财经美股首页 ==========
def fetch_yahoo_finance_news() -> list:
    """抓取Yahoo财经美股首页新闻（不筛选时间，全部采集）"""
    url = "https://finance.yahoo.com/"
    try:
        logger.info("正在抓取Yahoo财经...")
        resp = requests.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()

        soup = __import__('bs4').BeautifulSoup(resp.text, 'html.parser')

        news_list = []

        # 方法1: 查找新闻链接
        news_links = soup.select('a[href*="/news/"], a[href*="news.yahoo.com"]')

        for link in news_links[:30]:
            title = link.get_text(strip=True)
            href = link.get('href', '')

            if title and len(title) > 10 and 'news' in href.lower():
                news_list.append({
                    'time': '',
                    'title': title,
                    'content': title,
                    'url': href if href.startswith('http') else f"https://finance.yahoo.com{href}",
                    'source': 'yahoo_finance',
                })

        # 方法2: 使用 yfinance 获取新闻
        try:
            sp500 = yf.Ticker('^GSPC')
            yahoo_news = sp500.news

            if yahoo_news:
                for item in yahoo_news[:20]:
                    content = item.get('content', {})
                    title = content.get('title', '')
                    pub_date = content.get('pubDate', '')

                    # 解析时间
                    pub_time = None
                    if pub_date:
                        try:
                            pub_time = datetime.fromisoformat(pub_date.replace('Z', '+00:00')).replace(tzinfo=None)
                        except:
                            pass

                    if title:
                        news_list.append({
                            'time': pub_time.strftime('%Y-%m-%d %H:%M:%S') if pub_time else pub_date,
                            'title': title,
                            'content': content.get('summary', title)[:500],
                            'url': content.get('canonicalUrl', {}).get('url', ''),
                            'source': 'yahoo_finance',
                        })
        except Exception as e:
            logger.warning(f"Yahoo yfinance 获取失败: {str(e)}")

        # 去重
        seen = set()
        unique_list = []
        for item in news_list:
            key = item.get('title', '')[:50]
            if key and key not in seen:
                seen.add(key)
                unique_list.append(item)

        logger.info(f"Yahoo财经: {len(unique_list)} 条")
        return unique_list

    except Exception as e:
        logger.error(f"Yahoo财经失败: {str(e)}")
        return []


def merge_and_deduplicate(all_news: list) -> list:
    """合并去重"""
    seen = set()
    unique_list = []

    for news in all_news:
        # 用标题+内容前50字符作为去重key
        key = (news.get('title', '') + news.get('content', ''))[:80]

        if key not in seen:
            seen.add(key)
            unique_list.append(news)

    # 按时间排序
    unique_list.sort(key=lambda x: x.get('time', ''), reverse=True)

    return unique_list


# ========== 重要新闻筛选规则 ==========
IMPORTANT_KEYWORDS = [
    # 政策与宏观
    "美联储", "Fed", "利率", "降息", "加息", "通胀", "CPI", "PPI",
    "关税", "贸易", "制裁", "政策", "刺激", "QE",
    # 市场重要事件
    "财报", "盈利", "业绩", "暴雷", "回购", "分红",
    "收购", "合并", "IPO",
    # 地缘政治
    "战争", "冲突", "伊朗", "以色列", "中东", "俄乌",
    # 指数
    "标普", "纳斯达克", "道琼斯", "S&P", "Nasdaq", "Dow",
    # AI与科技
    "AI", "人工智能", "芯片", "半导体", "NVIDIA", "英伟达", "微软", "谷歌",
]

FILTER_OUT_KEYWORDS = ["分析师", "评级", "目标价"]


def filter_important_news(news_list: list, max_count: int = 20) -> list:
    """用规则筛选重要新闻"""
    scored_news = []

    for news in news_list:
        title = news.get('title', '') or ''
        content = news.get('content', '') or ''
        text = f"{title} {content}".lower()

        score = 0
        for keyword in IMPORTANT_KEYWORDS:
            if keyword.lower() in text:
                score += 1

        for filter_word in FILTER_OUT_KEYWORDS:
            if filter_word in text:
                score -= 0.5

        if score > 0:
            news['_score'] = score
            scored_news.append(news)

    scored_news.sort(key=lambda x: x.get('_score', 0), reverse=True)
    result = scored_news[:max_count]

    # 清理临时字段
    for news in result:
        news.pop('_score', None)

    return result


# ========== LLM 分析 (优化版) ==========
def _call_llm_api_with_retry(news_list: list, news_type: str, retry_count: int = 0) -> tuple:
    """
    调用 LLM API 分析新闻，支持重试

    Returns:
        tuple: (success: bool, result: dict)
    """
    try:
        news_content = "\n\n".join([
            f"【{n.get('title', '无标题') or n.get('content', '无内容')[:50]}】\n来源: {n.get('source', '未知')}\n时间: {n.get('time', '未知')}\n{n.get('content', '')[:200]}"
            for n in news_list[:15]
        ])

        prompt = f"""你是一位专业的金融分析师。请分析以下{news_type}，完成两个任务：

## 任务1：筛选重要新闻
从以下新闻中筛选出：
1. **全球重大新闻**：影响全球经济的重大事件（如战争、重大政策、自然灾害等）
2. **股票市场重大新闻**：直接影响股市的新闻（如美联储政策、重要财报、监管变化等）

请列出筛选出的重要新闻标题，并简述其对市场的影响。

## 任务2：市场分析
1. 主要事件概述（列出最重要的3-5个事件）
2. 对相关股票/板块的影响分析
3. 市场情绪判断
4. 投资建议（如有）

---

{news_content}

---

请用中文回复，保持简洁专业。格式如下：

### 全球重大新闻
- [标题] 影响分析

### 股票市场重大新闻
- [标题] 影响分析

### 市场分析
1. 主要事件概述
2. 影响分析
3. 市场情绪
4. 投资建议"""

        headers = {
            "Authorization": f"Bearer {LLM_API_KEY}",
            "Content-Type": "application/json"
        }

        payload = {
            "model": LLM_MODEL_ID,
            "messages": [
                {"role": "system", "content": "你是一位专业的金融分析师，擅长筛选重要新闻并分析对股市的影响。"},
                {"role": "user", "content": prompt}
            ],
            "max_tokens": 2000,
            "temperature": 0.7
        }

        logger.info(f"调用 LLM API 进行新闻筛选和分析 (超时: {LLM_TIMEOUT}s, 重试: {retry_count}/{LLM_MAX_RETRIES})...")

        response = requests.post(
            f"{LLM_BASE_URL}/chat/completions",
            headers=headers,
            json=payload,
            timeout=LLM_TIMEOUT
        )
        response.raise_for_status()

        result = response.json()
        summary = result['choices'][0]['message']['content']

        logger.info("LLM 分析成功")
        return True, {
            'summary': summary,
            'important_news_count': summary.count('### 全球重大新闻') + summary.count('### 股票市场重大新闻')
        }

    except requests.exceptions.Timeout:
        logger.warning(f"LLM API 超时 (超时设置: {LLM_TIMEOUT}s)")
        if retry_count < LLM_MAX_RETRIES:
            logger.info(f"准备重试 ({retry_count + 1}/{LLM_MAX_RETRIES})...")
            return _call_llm_api_with_retry(news_list, news_type, retry_count + 1)
        return False, {}

    except requests.exceptions.RequestException as e:
        logger.error(f"LLM API 请求失败: {str(e)}")
        if retry_count < LLM_MAX_RETRIES:
            logger.info(f"准备重试 ({retry_count + 1}/{LLM_MAX_RETRIES})...")
            return _call_llm_api_with_retry(news_list, news_type, retry_count + 1)
        return False, {}

    except Exception as e:
        logger.error(f"LLM 分析失败: {str(e)}")
        return False, {}


def _parse_llm_output(summary: str) -> dict:
    """解析 LLM 输出，提取全球重大新闻、股票市场重大新闻、市场分析"""
    result = {
        'global_news': '',
        'market_news': '',
        'market_analysis': ''
    }

    try:
        # 提取全球重大新闻
        global_match = re.search(
            r'###\s*全球重大新闻\s*\n([\s\S]*?)(?=###\s*股票市场重大新闻|###\s*市场分析|$)',
            summary
        )
        if global_match:
            result['global_news'] = global_match.group(1).strip()

        # 提取股票市场重大新闻
        market_match = re.search(
            r'###\s*股票市场重大新闻\s*\n([\s\S]*?)(?=###\s*市场分析|###\s*全球重大新闻|$)',
            summary
        )
        if market_match:
            result['market_news'] = market_match.group(1).strip()

        # 提取市场分析
        analysis_match = re.search(
            r'###\s*市场分析\s*\n([\s\S]*?)$',
            summary
        )
        if analysis_match:
            result['market_analysis'] = analysis_match.group(1).strip()

    except Exception as e:
        logger.warning(f"解析 LLM 输出失败: {str(e)}")

    return result


def build_analysis_record(summary: str) -> dict:
    """根据 LLM 输出或规则输出构造分析记录"""
    if not summary:
        return {}

    parsed = _parse_llm_output(summary)
    analysis_date = get_latest_closed_trading_day()
    return {
        'analysis_date': analysis_date,
        'global_news': parsed['global_news'],
        'market_news': parsed['market_news'],
        'market_analysis': parsed['market_analysis'],
        'raw_summary': summary,
    }


def get_latest_closed_trading_day() -> str:
    """按 NYSE 日历计算最近一个已收盘交易日"""
    ny_tz = pytz.timezone('America/New_York')
    now_ny = datetime.now(ny_tz)
    nyse = mcal.get_calendar('NYSE')
    schedule = nyse.schedule(start_date=now_ny.date() - pd.Timedelta(days=10), end_date=now_ny.date())
    closed_sessions = schedule[schedule['market_close'] <= now_ny]

    if closed_sessions.empty:
        return now_ny.strftime('%Y-%m-%d')

    latest_close = closed_sessions.iloc[-1].name
    return latest_close.strftime('%Y-%m-%d')


def analyze_with_llm(news_list: list, news_type: str) -> str:
    """
    用 LLM 分析新闻

    优化策略:
    1. 支持 SKIP_LLM 跳过
    2. 超时重试机制
    3. 失败时使用规则筛选结果作为降级
    4. 保存分析结果到数据库
    """
    if SKIP_LLM:
        logger.info("SKIP_LLM=true, 跳过 LLM 分析")
        return _generate_rule_based_summary(news_list)

    if not news_list:
        return ""

    # 先筛选重要新闻
    important_news = filter_important_news(news_list, max_count=15)
    if not important_news:
        important_news = news_list[:10]

    logger.info(f"筛选出 {len(important_news)} 条重要新闻进行 LLM 分析")

    # 调用 LLM
    success, result = _call_llm_api_with_retry(important_news, news_type)

    if success:
        return result.get('summary', '')
    else:
        # 降级: 使用规则生成摘要
        logger.warning("LLM 分析失败，使用规则生成摘要作为降级")
        return _generate_rule_based_summary(important_news)


def _generate_rule_based_summary(news_list: list) -> str:
    """基于规则生成新闻摘要 (降级方案)"""
    if not news_list:
        return ""

    # 按关键词分类
    categories = {
        "政策与宏观": [],
        "市场事件": [],
        "地缘政治": [],
        "科技与AI": [],
    }

    policy_keywords = ["美联储", "Fed", "利率", "降息", "加息", "通胀", "CPI", "政策", "关税"]
    market_keywords = ["财报", "盈利", "业绩", "回购", "分红", "收购", "IPO"]
    geo_keywords = ["战争", "冲突", "中东", "俄乌", "伊朗", "以色列"]
    tech_keywords = ["AI", "人工智能", "芯片", "半导体", "NVIDIA", "英伟达", "微软", "谷歌"]

    for news in news_list:
        text = f"{news.get('title', '')} {news.get('content', '')}"

        if any(kw in text for kw in policy_keywords):
            categories["政策与宏观"].append(news)
        elif any(kw in text for kw in market_keywords):
            categories["市场事件"].append(news)
        elif any(kw in text for kw in geo_keywords):
            categories["地缘政治"].append(news)
        elif any(kw in text for kw in tech_keywords):
            categories["科技与AI"].append(news)

    # 生成摘要
    summary_parts = ["【基于规则生成的新闻摘要】\n"]

    for category, items in categories.items():
        if items:
            summary_parts.append(f"\n### {category}")
            for item in items[:3]:
                title = item.get('title', '') or item.get('content', '')[:50]
                source = item.get('source', '未知')
                summary_parts.append(f"- [{source}] {title}")

    return "\n".join(summary_parts)


# ========== 主函数 ==========
def collect_all_news() -> tuple:
    """收集所有新闻（不筛选时间，持续积累）"""
    logger.info("=" * 60)
    logger.info("开始采集新闻 (v3.0 - 持续积累模式)")
    logger.info(f"配置: LLM_TIMEOUT={LLM_TIMEOUT}s, LLM_MAX_RETRIES={LLM_MAX_RETRIES}, SKIP_LLM={SKIP_LLM}")
    logger.info("=" * 60)

    all_news = []

    # 并发采集四个数据源
    print("\n正在采集新闻...")

    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = {
            executor.submit(fetch_sina_finance): 'sina',
            executor.submit(fetch_cls_cn): 'cls_cn',
            executor.submit(fetch_jin10): 'jin10',
            executor.submit(fetch_yahoo_finance_news): 'yahoo',
        }

        for future in as_completed(futures):
            source = futures[future]
            try:
                news = future.result()
                all_news.extend(news)
                print(f"  ✓ {source}: {len(news)} 条")
            except Exception as e:
                logger.error(f"{source} 采集失败: {str(e)}")
                print(f"  ✗ {source}: 失败")

    # 合并去重
    unique_news = merge_and_deduplicate(all_news)
    logger.info(f"合并去重后: {len(unique_news)} 条")

    # LLM 分析
    print(f"\n正在分析 {len(unique_news)} 条新闻...")
    summary = analyze_with_llm(unique_news, "综合财经新闻")

    return unique_news, summary


def export_to_excel(news_list: list, summary: str) -> str:
    """导出到 Excel"""
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)

    filepath = f"{OUTPUT_DIR}/news_v3_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"

    with pd.ExcelWriter(filepath, engine='openpyxl') as writer:
        df_news = pd.DataFrame(news_list)
        df_news.to_excel(writer, sheet_name='News', index=False)

        df_summary = pd.DataFrame({'类型': ['综合分析'], 'AI总结': [summary]})
        df_summary.to_excel(writer, sheet_name='AI_Summary', index=False)

    logger.info(f"数据已导出: {filepath}")
    return filepath


def main():
    """主函数"""
    logger.info("=" * 60)
    logger.info("新闻采集脚本 v3.0 启动")
    logger.info("=" * 60)

    try:
        # 采集新闻
        news_list, summary = collect_all_news()
        analysis_record = build_analysis_record(summary)

        if ENABLE_REMOTE_WRITE and is_remote_write_configured():
            remote_result = send_news(news_list)
            inserted_count = remote_result.get('inserted', 0)
            logger.info(
                "Cloudflare D1 新闻写入完成: 新增 %s 条，跳过重复 %s 条",
                inserted_count,
                remote_result.get('ignored', 0),
            )
            if analysis_record:
                send_news_analysis(analysis_record)
        else:
            init_database()
            inserted_count = batch_insert_news(news_list)
            logger.info(f"数据库写入完成: 新增 {inserted_count} 条，跳过重复 {len(news_list) - inserted_count} 条")
            if analysis_record:
                save_news_analysis(analysis_record)

        # 导出到 Excel
        filepath = export_to_excel(news_list, summary)

        print("\n" + "=" * 60)
        print("采集完成!")
        print("=" * 60)
        print(f"新闻总数: {len(news_list)} 条")
        print(f"数据库新增: {inserted_count} 条")
        print(f"输出文件: {filepath}")

        if summary:
            print("\n【AI 分析摘要】")
            print(summary[:500] + "..." if len(summary) > 500 else summary)

        logger.info("新闻采集脚本执行完成")
        return 0

    except CloudflareIngestError as e:
        logger.error(f"Cloudflare 写入失败: {str(e)}", exc_info=True)
        return 1
    except Exception as e:
        logger.error(f"执行失败: {str(e)}", exc_info=True)
        return 1


if __name__ == "__main__":
    import sys
    sys.exit(main())
