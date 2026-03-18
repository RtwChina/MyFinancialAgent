"""
日志工具模块
"""
import os
import logging
from config import LOG_FILE, LOG_LEVEL


def setup_logger(name: str) -> logging.Logger:
    """设置并返回日志记录器"""
    # 确保日志目录存在
    log_dir = os.path.dirname(LOG_FILE)
    if log_dir and not os.path.exists(log_dir):
        os.makedirs(log_dir)

    # 创建日志记录器
    logger = logging.getLogger(name)
    logger.setLevel(getattr(logging, LOG_LEVEL.upper(), logging.INFO))

    # Python logging 使用单例模式，同名 logger 多次调用时会重复追加 handler，此处提前返回避免重复输出
    if logger.handlers:
        return logger

    # 文件处理器：记录所有级别（DEBUG+），便于排查问题
    file_handler = logging.FileHandler(LOG_FILE, encoding='utf-8')
    file_handler.setLevel(logging.DEBUG)

    # 控制台处理器：只输出 INFO+，减少终端噪音
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)

    # 日志格式
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    file_handler.setFormatter(formatter)
    console_handler.setFormatter(formatter)

    logger.addHandler(file_handler)
    logger.addHandler(console_handler)

    return logger


def get_logger(name: str) -> logging.Logger:
    """获取已配置的日志记录器"""
    return setup_logger(name)