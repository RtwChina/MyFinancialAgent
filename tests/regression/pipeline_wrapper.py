#!/usr/bin/env python3
"""Pipeline wrapper: 执行 collect_all_news() 并将完整结果序列化为 JSON 输出到 stdout。

被 run_pipeline_regression.py 通过 subprocess 调用，每组 Run 一个独立进程。
"""
import json
import os
import sys
import traceback

# 确保 src/ 在 import path 中
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(PROJECT_ROOT, "src"))
os.chdir(PROJECT_ROOT)

# 加载 .env（如果存在）
_env_path = os.path.join(PROJECT_ROOT, ".env")
if os.path.exists(_env_path):
    from dotenv import load_dotenv
    load_dotenv(_env_path, override=False)


def _serialize_news_item(news: dict) -> dict:
    """提取新闻条目中与回归测试相关的字段，避免序列化过大。"""
    return {
        "news_hash": news.get("news_hash", ""),
        "title": news.get("title", ""),
        "source": news.get("source", ""),
        "sub_source": news.get("sub_source", ""),
        "pub_date": news.get("pub_date", ""),
        "importance_stars": news.get("importance_stars"),
        "type": news.get("type", ""),
        "processing_status": news.get("processing_status", ""),
        "cot_reasoning": news.get("cot_reasoning", ""),
        "_scoring": news.get("_scoring", {}),
        "_embedding": news.get("_embedding", {}),
        "rule_passed": news.get("rule_passed"),
    }


def _detect_language(title: str) -> str:
    """简单检测标题语言：含中文字符→zh，否则→en。"""
    if not title:
        return "unknown"
    for ch in title:
        if "\u4e00" <= ch <= "\u9fff":
            return "zh"
    return "en"


def run():
    result = {
        "success": False,
        "error": None,
        "params": {
            "strategy": os.getenv("RULE_ACTIVE_STRATEGY", "A"),
            "embedding_threshold": float(os.getenv("EMBEDDING_SIMILARITY_THRESHOLD", "0.3")),
            "llm_batch_size": int(os.getenv("LLM_BATCH_SIZE", "8")),
            "llm_max_workers": int(os.getenv("LLM_MAX_WORKERS", "3")),
            "llm_batch_timeout": int(os.getenv("LLM_BATCH_TIMEOUT", "60")),
            "llm_rules_timeout": int(os.getenv("LLM_RULES_TIMEOUT", "60")),
        },
        "pipeline_trace": None,
        "funnel": {},
        "timing": {},
        "star_distribution": {"1": 0, "2": 0, "3": 0, "4": 0, "5": 0},
        "star_fallback_triggered": False,
        "english_news": {"total": 0, "rule_passed": 0, "embedding_passed": 0, "llm_kept": 0},
        "empty_title": {"total": 0, "rule_passed": 0, "embedding_passed": 0, "final_kept": 0},
        "dynamic_rules_status": "unknown",
        "dynamic_rules_detail": {},
        "cot_samples": [],
        "all_news_summary": [],
        "errors": [],
    }

    try:
        from collect_news_v3 import collect_all_news
        data = collect_all_news()

        trace = data.get("pipeline_trace", {})
        result["pipeline_trace"] = trace
        result["success"] = trace.get("status") == "completed"

        # --- 漏斗数据 ---
        result["funnel"] = {
            "fetched": trace.get("total_fetched", 0),
            "deduped": trace.get("total_deduped", 0),
            "rule_input": trace.get("total_deduped", 0),
            "rule_output": trace.get("rule_passed", 0),
            "rule_filtered": trace.get("rule_filtered", 0),
            "embedding_input": trace.get("embedding_input", 0),
            "embedding_output": trace.get("embedding_passed", 0),
            "embedding_filtered": trace.get("embedding_filtered", 0),
            "llm_input": trace.get("llm_input", 0),
            "llm_output": trace.get("llm_kept", 0),
            "llm_filtered": trace.get("llm_discarded", 0),
            "final_count": trace.get("final_count", 0),
        }

        result["timing"] = {
            "fetch": trace.get("fetch_duration", 0),
            "rule": trace.get("rule_duration", 0),
            "embedding": trace.get("embedding_duration", 0),
            "llm": trace.get("llm_duration", 0),
            "total": trace.get("total_duration", 0),
        }

        # --- 动态规则状态 ---
        screening_profile = data.get("screening_profile", {})
        dyn_status = screening_profile.get("dynamic_rules_status", "unknown")
        if dyn_status == "unknown":
            # 从 dynamic_keywords 推断
            dk = trace.get("dynamic_keywords", "{}")
            if isinstance(dk, str):
                import json as _json
                dk = _json.loads(dk)
            has_dynamic = any(len(v) > 0 for v in dk.values()) if isinstance(dk, dict) else False
            dyn_status = "success" if has_dynamic else "timeout_degraded"
        result["dynamic_rules_status"] = dyn_status
        result["dynamic_rules_detail"] = {
            "macro": len(screening_profile.get("macro_keywords", [])),
            "market": len(screening_profile.get("market_keywords", [])),
            "noise": len(screening_profile.get("noise_keywords", [])),
            "topics": len(screening_profile.get("focus_topics", [])),
        }

        # --- 所有新闻的语言和标题分析 ---
        screened = data.get("screened_news", [])      # rule passed
        rejected = data.get("rejected_news", [])      # rule/embedding/llm rejected
        processed = data.get("processed_news", [])    # LLM processed (kept + discarded)
        final = data.get("final_news", [])             # final kept

        all_news = screened + rejected
        # 去重（screened 和 rejected 可能有重叠，用 news_hash 去重）
        seen_hashes = set()
        unique_all = []
        for n in all_news:
            h = n.get("news_hash", id(n))
            if h not in seen_hashes:
                seen_hashes.add(h)
                unique_all.append(n)

        # 英文新闻追踪
        en_total = [n for n in unique_all if _detect_language(n.get("title", "")) == "en"]
        en_rule_passed = [n for n in en_total if n.get("rule_passed")]
        en_emb_passed = [n for n in en_rule_passed if n.get("_embedding", {}).get("decision") != "filter"]
        en_llm_kept = [n for n in final if _detect_language(n.get("title", "")) == "en"]
        result["english_news"] = {
            "total": len(en_total),
            "rule_passed": len(en_rule_passed),
            "embedding_passed": len(en_emb_passed),
            "llm_kept": len(en_llm_kept),
        }

        # 空标题新闻追踪
        empty_total = [n for n in unique_all if not (n.get("title") or "").strip()]
        empty_rule_passed = [n for n in empty_total if n.get("rule_passed")]
        empty_emb_passed = [n for n in empty_rule_passed if n.get("_embedding", {}).get("decision") != "filter"]
        empty_final = [n for n in final if not (n.get("title") or "").strip()]
        result["empty_title"] = {
            "total": len(empty_total),
            "rule_passed": len(empty_rule_passed),
            "embedding_passed": len(empty_emb_passed),
            "final_kept": len(empty_final),
        }

        # --- 打星分布 ---
        star_dist = {"1": 0, "2": 0, "3": 0, "4": 0, "5": 0}
        for n in processed:
            stars = n.get("importance_stars")
            if stars and 1 <= stars <= 5:
                star_dist[str(stars)] += 1
        result["star_distribution"] = star_dist
        result["star_fallback_triggered"] = bool(trace.get("star_fallback_triggered"))

        # --- CoT 样本 (top 3 by stars desc) ---
        cot_candidates = [
            n for n in processed
            if n.get("cot_reasoning") and n.get("importance_stars")
        ]
        cot_candidates.sort(key=lambda x: x.get("importance_stars", 0), reverse=True)
        for n in cot_candidates[:3]:
            result["cot_samples"].append({
                "title": n.get("title", "")[:100],
                "stars": n.get("importance_stars"),
                "cot_reasoning": n.get("cot_reasoning", "")[:500],
                "source": n.get("source", ""),
            })

        # --- 每条新闻摘要（用于对比分析）---
        for n in unique_all[:200]:  # 限制条数
            result["all_news_summary"].append({
                "hash": n.get("news_hash", "")[:12],
                "title": (n.get("title") or "")[:60],
                "source": n.get("source", ""),
                "lang": _detect_language(n.get("title", "")),
                "rule_passed": bool(n.get("rule_passed")),
                "emb_decision": n.get("_embedding", {}).get("decision", "N/A"),
                "emb_sim": n.get("_embedding", {}).get("similarity"),
                "stars": n.get("importance_stars"),
                "final": n.get("processing_status") == "llm_processed",
            })

    except Exception as exc:
        result["success"] = False
        result["error"] = f"{type(exc).__name__}: {exc}"
        result["errors"].append(traceback.format_exc())

    # 输出 JSON 到 stdout（日志走 stderr）
    print(json.dumps(result, ensure_ascii=False, default=str))


if __name__ == "__main__":
    run()
