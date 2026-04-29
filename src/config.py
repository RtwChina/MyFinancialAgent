"""
配置文件 - 存储 API 密钥和配置信息
"""
import os
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

# LLM API 配置
LLM_API_KEY = os.getenv("LLM_API_KEY", "")
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1")
LLM_MODEL_ID = os.getenv("LLM_MODEL_ID", "qwen3.5-plus")
LLM_RULES_MODEL_ID = os.getenv("LLM_RULES_MODEL_ID", LLM_MODEL_ID)
# 批量结构化任务使用轻量模型以降低成本；兼容旧环境变量名 LLM_STRUCTURED_MODEL_ID
LLM_BATCH_MODEL_ID = os.getenv("LLM_BATCH_MODEL_ID", os.getenv("LLM_STRUCTURED_MODEL_ID", "qwen3.5-flash"))
# 摘要任务模型；兼容新的日期级日总结环境变量名
LLM_SUMMARY_MODEL_ID = os.getenv("LLM_SUMMARY_MODEL_ID", os.getenv("LLM_DAILY_SUMMARY_MODEL_ID", LLM_MODEL_ID))
# 汇总所有实际用到的模型 ID（去重、保序），供 benchmark 等工具遍历
_llm_model_options: list[str] = []
for item in os.getenv("LLM_MODEL_OPTIONS", f"{LLM_RULES_MODEL_ID},{LLM_BATCH_MODEL_ID},{LLM_SUMMARY_MODEL_ID}").split(","):
    normalized = item.strip()
    if normalized and normalized not in _llm_model_options:
        _llm_model_options.append(normalized)
LLM_MODEL_OPTIONS = _llm_model_options

# Tavily API 配置 (用于新闻搜索)
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "")

# 股票标的配置
STOCK_SYMBOLS = [
    # 个股
    "MU",      # 美光科技
    "LITE",    # Lumentum
    "MSFT",    # 微软
    "GOOGL",   # 谷歌
]

INDEX_SYMBOLS = [
    # 指数/大宗
    "^VIX",        # 恐慌指数
    "^HSI",        # 恒指
    "^GSPC",       # 标普500
    "000001.SS",   # 上证指数
    "DX-Y.NYB",    # 美元指数
    "GC=F",        # 黄金期货
]

# 所有标的
ALL_SYMBOLS = STOCK_SYMBOLS + INDEX_SYMBOLS

# 数据库路径
DB_PATH = os.getenv("DB_PATH", "output/financial_data.db")

# 日志配置
LOG_FILE = "logs/collector.log"
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

# 输出目录
OUTPUT_DIR = "output"

# 存储与写入模式：DB_BACKEND 控制后端类型，ENABLE_REMOTE_WRITE 决定是否推送到 Cloudflare D1
DB_BACKEND = os.getenv("DB_BACKEND", "local").lower()
ENABLE_REMOTE_WRITE = os.getenv("ENABLE_REMOTE_WRITE", "false").lower() == "true"

# Cloudflare / Workers API 配置
INGEST_API_BASE_URL = os.getenv("INGEST_API_BASE_URL", "").rstrip("/")
INGEST_API_TOKEN = os.getenv("INGEST_API_TOKEN", "")

# Finnhub API Key（用于英文财经新闻采集）
FINNHUB_API_KEY = os.getenv("FINNHUB_API_KEY", "")
