#!/usr/bin/env python3
"""回归测试执行脚本：驱动 6 组参数矩阵，每组用独立子进程运行 pipeline。

用法:
    python tests/regression/run_pipeline_regression.py              # 全部 6 组
    python tests/regression/run_pipeline_regression.py --only=R1,R4  # 仅 R1 和 R4
"""
import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WRAPPER_SCRIPT = os.path.join(PROJECT_ROOT, "tests", "regression", "pipeline_wrapper.py")
RESULTS_DIR = os.path.join(PROJECT_ROOT, "tests", "regression", "results")
PYTHON = sys.executable  # 使用当前 Python 解释器

# ===== 参数矩阵 =====
# 固定参数
FIXED_PARAMS = {
    "LLM_BATCH_SIZE": "8",
    "LLM_MAX_WORKERS": "3",
    "LLM_BATCH_TIMEOUT": "90",
    "LLM_RULES_TIMEOUT": "120",
    "ENABLE_REMOTE_WRITE": "false",  # 回归测试不写远程
    "SKIP_LLM": "false",            # 强制不跳过 LLM
}

# 变量参数矩阵
RUN_MATRIX = [
    {"id": "R1", "RULE_ACTIVE_STRATEGY": "A", "EMBEDDING_SIMILARITY_THRESHOLD": "0.40", "note": "Baseline"},
    {"id": "R2", "RULE_ACTIVE_STRATEGY": "B", "EMBEDDING_SIMILARITY_THRESHOLD": "0.40", "note": "BM25 vs 线性"},
    {"id": "R3", "RULE_ACTIVE_STRATEGY": "C", "EMBEDDING_SIMILARITY_THRESHOLD": "0.40", "note": "标题加权"},
    {"id": "R4", "RULE_ACTIVE_STRATEGY": "A", "EMBEDDING_SIMILARITY_THRESHOLD": "0.50", "note": "高阈值 Baseline"},
    {"id": "R5", "RULE_ACTIVE_STRATEGY": "B", "EMBEDDING_SIMILARITY_THRESHOLD": "0.50", "note": "高阈值 + BM25"},
    {"id": "R6", "RULE_ACTIVE_STRATEGY": "C", "EMBEDDING_SIMILARITY_THRESHOLD": "0.50", "note": "高阈值 + 标题加权"},
]

RUN_INTERVAL_SEC = 10  # Run 之间间隔


def run_single(run_config: dict, batch_ts: str) -> dict:
    """执行单组 Run，返回结果 dict。"""
    run_id = run_config["id"]
    strategy = run_config["RULE_ACTIVE_STRATEGY"]
    threshold = run_config["EMBEDDING_SIMILARITY_THRESHOLD"]

    print(f"\n{'='*60}")
    print(f"  {run_id}: Strategy={strategy}  Embedding={threshold}  ({run_config['note']})")
    print(f"{'='*60}")

    # 构建环境变量
    env = os.environ.copy()
    env.update(FIXED_PARAMS)
    env["RULE_ACTIVE_STRATEGY"] = strategy
    env["EMBEDDING_SIMILARITY_THRESHOLD"] = threshold

    start_time = time.time()
    try:
        proc = subprocess.run(
            [PYTHON, WRAPPER_SCRIPT],
            capture_output=True,
            text=True,
            timeout=900,  # 单组最多 15 分钟（Finnhub 加入后数据量翻倍）
            env=env,
            cwd=PROJECT_ROOT,
        )

        elapsed = round(time.time() - start_time, 1)

        # 解析 stdout JSON
        stdout = proc.stdout.strip()
        stderr_tail = (proc.stderr or "")[-2000:]  # 保留最后 2000 字符日志

        if proc.returncode != 0:
            print(f"  ✗ {run_id} 子进程退出码 {proc.returncode} (耗时 {elapsed}s)")
            return {
                "run_id": run_id,
                "batch_ts": batch_ts,
                "success": False,
                "params": {"strategy": strategy, "embedding_threshold": float(threshold)},
                "error": f"Exit code {proc.returncode}",
                "errors": [stderr_tail],
                "subprocess_elapsed": elapsed,
            }

        # 尝试从 stdout 中提取最后一行 JSON（日志可能混入 stdout）
        result = None
        for line in reversed(stdout.split("\n")):
            line = line.strip()
            if line.startswith("{"):
                try:
                    result = json.loads(line)
                    break
                except json.JSONDecodeError:
                    continue

        if result is None:
            print(f"  ✗ {run_id} 无法解析 stdout JSON (耗时 {elapsed}s)")
            return {
                "run_id": run_id,
                "batch_ts": batch_ts,
                "success": False,
                "params": {"strategy": strategy, "embedding_threshold": float(threshold)},
                "error": "Failed to parse stdout JSON",
                "errors": [stdout[-1000:], stderr_tail],
                "subprocess_elapsed": elapsed,
            }

        # 注入 meta 信息
        result["run_id"] = run_id
        result["batch_ts"] = batch_ts
        result["subprocess_elapsed"] = elapsed
        result["stderr_tail"] = stderr_tail

        # 打印摘要
        funnel = result.get("funnel", {})
        stars = result.get("star_distribution", {})
        en = result.get("english_news", {})
        empty = result.get("empty_title", {})
        dyn = result.get("dynamic_rules_status", "?")

        print(f"  ✓ {run_id} 完成 (耗时 {elapsed}s)")
        print(f"    漏斗: {funnel.get('fetched',0)}→{funnel.get('deduped',0)}→规则{funnel.get('rule_output',0)}→Emb{funnel.get('embedding_output',0)}→LLM{funnel.get('llm_output',0)}→最终{funnel.get('final_count',0)}")
        print(f"    打星: {stars}  兜底={result.get('star_fallback_triggered', False)}")
        print(f"    英文: {en.get('total',0)}条(最终{en.get('llm_kept',0)})  空标题: {empty.get('total',0)}条(最终{empty.get('final_kept',0)})")
        print(f"    动态规则: {dyn}")

        return result

    except subprocess.TimeoutExpired:
        elapsed = round(time.time() - start_time, 1)
        print(f"  ✗ {run_id} 超时 (>{elapsed}s)")
        return {
            "run_id": run_id,
            "batch_ts": batch_ts,
            "success": False,
            "params": {"strategy": strategy, "embedding_threshold": float(threshold)},
            "error": "Subprocess timeout (>600s)",
            "errors": [],
            "subprocess_elapsed": elapsed,
        }
    except Exception as exc:
        elapsed = round(time.time() - start_time, 1)
        print(f"  ✗ {run_id} 异常: {exc} (耗时 {elapsed}s)")
        return {
            "run_id": run_id,
            "batch_ts": batch_ts,
            "success": False,
            "params": {"strategy": strategy, "embedding_threshold": float(threshold)},
            "error": str(exc),
            "errors": [],
            "subprocess_elapsed": elapsed,
        }


def main():
    parser = argparse.ArgumentParser(description="Pipeline 回归测试")
    parser.add_argument("--only", type=str, default=None, help="仅运行指定 Run，如 --only=R1,R4")
    args = parser.parse_args()

    # 筛选 Run
    runs = RUN_MATRIX
    if args.only:
        selected = set(args.only.upper().split(","))
        runs = [r for r in RUN_MATRIX if r["id"] in selected]
        if not runs:
            print(f"错误: --only={args.only} 未匹配到任何 Run (可选: R1-R6)")
            sys.exit(1)

    os.makedirs(RESULTS_DIR, exist_ok=True)

    batch_ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    print(f"Pipeline 回归测试 — {len(runs)} 组 Run")
    print(f"批次: {batch_ts}")
    print(f"固定参数: {FIXED_PARAMS}")
    print(f"Python: {PYTHON}")

    results = []
    for i, run_config in enumerate(runs):
        result = run_single(run_config, batch_ts)
        results.append(result)

        # 保存单个结果
        fname = f"{run_config['id']}_{run_config['RULE_ACTIVE_STRATEGY']}_{run_config['EMBEDDING_SIMILARITY_THRESHOLD']}_{batch_ts}.json"
        fpath = os.path.join(RESULTS_DIR, fname)
        with open(fpath, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2, default=str)
        print(f"    → 结果已保存: {fpath}")

        # Run 间间隔（最后一组不等）
        if i < len(runs) - 1:
            print(f"\n  等待 {RUN_INTERVAL_SEC}s (防 rate limit)...")
            time.sleep(RUN_INTERVAL_SEC)

    # 汇总
    print(f"\n{'='*60}")
    print(f"  全部完成 — {sum(1 for r in results if r.get('success'))}/{len(results)} 成功")
    print(f"{'='*60}")

    # 保存汇总
    summary_path = os.path.join(RESULTS_DIR, f"batch_summary_{batch_ts}.json")
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump({
            "batch_ts": batch_ts,
            "total_runs": len(results),
            "successful": sum(1 for r in results if r.get("success")),
            "fixed_params": FIXED_PARAMS,
            "results": results,
        }, f, ensure_ascii=False, indent=2, default=str)
    print(f"汇总已保存: {summary_path}")


if __name__ == "__main__":
    main()
