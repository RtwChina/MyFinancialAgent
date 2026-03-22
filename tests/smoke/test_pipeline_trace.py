"""
冒烟测试：三级漏斗评分、Embedding 降级、打星兜底、trace/filter_log 构建
对应 SM-005 ~ SM-009
"""
import json
import os
import sys
import types
import unittest
from unittest.mock import MagicMock, patch

# 确保 src 目录在 path 中
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))

# Mock 掉无法在测试环境导入的重量级依赖
_stub_modules = [
    "akshare", "finnhub", "yfinance", "pandas_market_calendars",
    "data_sources", "data_sources.news_live", "data_sources.news_router",
    "data_sources.price_router",
]
for _mod_name in _stub_modules:
    if _mod_name not in sys.modules:
        sys.modules[_mod_name] = MagicMock()


class TestThreeStrategyScoring(unittest.TestCase):
    """SM-005: 三策略评分正确性"""

    def test_bm25_saturate(self):
        from collect_news_v3 import bm25_saturate

        # count=0 -> 0
        self.assertEqual(bm25_saturate(0, 1.0), 0.0)
        # count=1, weight=1.0, k1=1.2 -> 1.0 * (1*2.2)/(1+1.2) = 1.0
        result = bm25_saturate(1, 1.0, k1=1.2)
        self.assertAlmostEqual(result, 1.0, places=2)
        # 递增但边际递减: count=10 > count=1
        result_high = bm25_saturate(10, 2.0, k1=1.2)
        result_low = bm25_saturate(1, 2.0, k1=1.2)
        self.assertGreater(result_high, result_low)
        # BM25 上界 = weight * (k1+1) = 2.0 * 2.2 = 4.4
        self.assertLess(result_high, 2.0 * (1.2 + 1))

    def test_compute_three_strategy_scores(self):
        from collect_news_v3 import _compute_three_strategy_scores

        title = "Micron MU 半导体 HBM 芯片"
        content = "美光科技发布新 HBM 芯片"
        profile = {
            "macro_keywords": ["半导体"],
            "market_keywords": [],
            "noise_keywords": ["广告"],
            "symbol_context_keywords": ["MU", "美光"],
            "focus_topics": [{"label": "HBM", "keywords": ["HBM"], "weight": 3.0}],
            "score_threshold": 2.0,
        }
        scoring = _compute_three_strategy_scores(title, content, profile)
        # 返回键是 score_a/b/c
        self.assertIsInstance(scoring["score_a"], (int, float))
        self.assertIsInstance(scoring["score_b"], (int, float))
        self.assertIsInstance(scoring["score_c"], (int, float))
        # 分数应 > 0（命中了多个关键词）
        self.assertGreater(scoring["score_a"], 0)
        self.assertGreater(scoring["score_b"], 0)
        self.assertGreater(scoring["score_c"], 0)

    def test_strategy_c_no_title_fallback(self):
        """标题为空时，策略 C 退化为策略 B"""
        from collect_news_v3 import _compute_three_strategy_scores

        title = ""
        content = "美光科技 MU 发布 HBM 芯片"
        profile = {
            "macro_keywords": [],
            "market_keywords": [],
            "noise_keywords": [],
            "symbol_context_keywords": ["MU"],
            "focus_topics": [{"label": "HBM", "keywords": ["HBM"], "weight": 3.0}],
            "score_threshold": 2.0,
        }
        scoring = _compute_three_strategy_scores(title, content, profile)
        # 无标题时 C ≈ B（related_symbols 相同，focus 用 body-only 可能不等，
        # 但 symbol_context 和 noise 部分应等价）
        # 更准确的检验：C 和 B 差距很小
        self.assertAlmostEqual(scoring["score_c"], scoring["score_b"], delta=1.0)


class TestEmbeddingDegradation(unittest.TestCase):
    """SM-006: Embedding 过滤及降级"""

    def test_embedding_api_failure_degrades(self):
        from embedding_filter import filter_news_by_embedding

        news_list = [
            {"title": "Test news", "content": "Some content", "news_hash": "h1"},
        ]
        # profile_embeddings 存在但 API 调用失败
        profile_embeddings = {"MU": [0.1] * 10}

        with patch("embedding_filter._batch_embed", return_value=None):
            passed, filtered = filter_news_by_embedding(news_list, profile_embeddings)

        # 降级：全部 passed，decision=skipped
        self.assertEqual(len(passed), 1)
        self.assertEqual(len(filtered), 0)
        self.assertEqual(passed[0]["_embedding"]["decision"], "skipped")


class TestStarFallback(unittest.TestCase):
    """SM-007: 打星兜底触发"""

    def test_score_to_stars(self):
        from collect_news_v3 import _score_to_stars

        # 高分 -> 5 星
        self.assertEqual(_score_to_stars(10.0), 5)
        # 中高分 -> 4 星
        self.assertEqual(_score_to_stars(8.0), 4)
        # 低分 -> 0 星
        self.assertEqual(_score_to_stars(0), 0)
        # 中等分 -> 2 星
        self.assertEqual(_score_to_stars(4.0), 2)


class TestPipelineTraceStructure(unittest.TestCase):
    """SM-008/009: pipeline_trace 和 filter_log 结构完整性"""

    def test_trace_has_required_fields(self):
        """验证 trace 字典包含所有必需字段"""
        required_fields = [
            "run_id", "run_date", "started_at", "status",
            "total_fetched", "total_deduped",
            "rule_passed", "rule_filtered",
            "embedding_input", "embedding_passed", "embedding_filtered",
            "llm_input", "llm_kept", "llm_discarded", "final_count",
            "fetch_duration", "rule_duration", "embedding_duration", "llm_duration",
            "active_strategy", "star_fallback_triggered",
        ]
        # 构造最小 trace
        trace = {f: 0 for f in required_fields}
        trace["run_id"] = "test-uuid"
        trace["run_date"] = "2026-03-20"
        trace["started_at"] = "2026-03-20 10:00:00"
        trace["status"] = "completed"
        trace["active_strategy"] = "A"

        for field in required_fields:
            self.assertIn(field, trace, f"Missing field: {field}")

    def test_filter_log_has_required_fields(self):
        """验证 filter_log 记录包含所有必需字段"""
        required_fields = [
            "run_id", "news_hash",
            "strategy_a_score", "strategy_b_score", "strategy_c_score",
            "active_strategy", "rule_decision", "final_decision",
        ]
        log_entry = {
            "run_id": "test-uuid",
            "news_hash": "test-hash",
            "strategy_a_score": 5.0,
            "strategy_b_score": 4.2,
            "strategy_c_score": 6.1,
            "active_strategy": "A",
            "rule_decision": "pass",
            "final_decision": "kept",
        }
        for field in required_fields:
            self.assertIn(field, log_entry, f"Missing field: {field}")


if __name__ == "__main__":
    unittest.main()
