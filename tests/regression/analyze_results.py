#!/usr/bin/env python3
"""回归测试结果分析脚本：加载最近一批 JSON 结果，输出策略对比表和分析报告。

用法:
    python tests/regression/analyze_results.py                  # 分析最近一批
    python tests/regression/analyze_results.py --batch=20260321_0901  # 指定批次
"""
import argparse
import glob
import json
import os
import sys
from collections import defaultdict
from datetime import datetime

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RESULTS_DIR = os.path.join(PROJECT_ROOT, "tests", "regression", "results")


def load_results(batch_ts: str = None) -> list:
    """加载指定批次的 JSON 结果，默认加载最近一批。"""
    pattern = os.path.join(RESULTS_DIR, "R*_*.json")
    files = glob.glob(pattern)
    if not files:
        print("错误: 未找到结果文件")
        sys.exit(1)

    # 按批次时间戳分组
    batches = defaultdict(list)
    for f in files:
        basename = os.path.basename(f)
        # 格式: R1_A_0.40_20260321_090100.json
        parts = basename.rsplit("_", 2)
        if len(parts) >= 3:
            ts = parts[-2] + "_" + parts[-1].replace(".json", "")
            batches[ts].append(f)

    if batch_ts:
        if batch_ts not in batches:
            print(f"错误: 批次 {batch_ts} 不存在。可用批次: {sorted(batches.keys())}")
            sys.exit(1)
        target_files = batches[batch_ts]
    else:
        # 最近一批
        latest_ts = sorted(batches.keys())[-1]
        target_files = batches[latest_ts]
        print(f"加载批次: {latest_ts} ({len(target_files)} 个文件)")

    results = []
    for f in sorted(target_files):
        with open(f, "r", encoding="utf-8") as fh:
            results.append(json.load(fh))
    return results


def format_pct(num, total):
    """格式化百分比。"""
    if total == 0:
        return "N/A"
    return f"{num/total*100:.0f}%"


def generate_comparison_table(results: list) -> str:
    """生成策略对比表。"""
    lines = []
    lines.append("## 策略对比表\n")
    lines.append("| Run | Strategy | Emb Thresh | Dyn Rules | Rule Out | Emb Filtered | LLM In | LLM Filtered | Final | Timeout(s) | Star FB |")
    lines.append("|-----|----------|-----------|-----------|----------|-------------|--------|-------------|-------|-----------|---------|")

    for r in results:
        run_id = r.get("run_id", "?")
        if not r.get("success"):
            lines.append(f"| {run_id} | N/A | N/A | FAILED | — | — | — | — | — | — | — |")
            continue

        params = r.get("params", {})
        funnel = r.get("funnel", {})
        timing = r.get("timing", {})

        strategy = params.get("strategy", "?")
        threshold = params.get("embedding_threshold", "?")
        dyn = r.get("dynamic_rules_status", "?")
        rule_out = funnel.get("rule_output", 0)
        emb_in = funnel.get("embedding_input", 0)
        emb_filt = funnel.get("embedding_filtered", 0)
        emb_pct = format_pct(emb_filt, emb_in)
        llm_in = funnel.get("llm_input", 0)
        llm_filt = funnel.get("llm_filtered", 0)
        llm_pct = format_pct(llm_filt, llm_in)
        final = funnel.get("final_count", 0)
        total_t = timing.get("total", 0)
        star_fb = "YES" if r.get("star_fallback_triggered") else "no"

        lines.append(f"| {run_id} | {strategy} | {threshold} | {dyn[:7]} | {rule_out} | {emb_filt} ({emb_pct}) | {llm_in} | {llm_filt} ({llm_pct}) | **{final}** | {total_t:.0f} | {star_fb} |")

    return "\n".join(lines)


def generate_star_analysis(results: list) -> str:
    """生成打星分布分析。"""
    lines = []
    lines.append("\n## 打星分布\n")

    for r in results:
        if not r.get("success"):
            continue
        run_id = r.get("run_id", "?")
        dist = r.get("star_distribution", {})
        total = sum(int(v) for v in dist.values())
        if total == 0:
            lines.append(f"### {run_id}: 无打星数据\n")
            continue

        lines.append(f"### {run_id} (共 {total} 条)")

        # 文本直方图
        max_count = max(int(v) for v in dist.values()) if dist else 1
        for star in ["5", "4", "3", "2", "1"]:
            count = int(dist.get(star, 0))
            pct = count / total * 100
            bar_len = int(count / max(max_count, 1) * 30)
            bar = "█" * bar_len
            lines.append(f"  {star}★ | {bar:<30} {count:>3} ({pct:.0f}%)")

        # 异常检测
        five_pct = int(dist.get("5", 0)) / total * 100
        four_five_pct = (int(dist.get("4", 0)) + int(dist.get("5", 0))) / total * 100
        warnings = []
        if five_pct > 40:
            warnings.append(f"5★占比 {five_pct:.0f}% > 40%")
        if four_five_pct > 60:
            warnings.append(f"4-5★占比 {four_five_pct:.0f}% > 60%")
        if int(dist.get("1", 0)) == 0 and int(dist.get("2", 0)) == 0:
            warnings.append("无 1-2★，区分度不足")

        if warnings:
            lines.append(f"  ⚠ 异常: {'; '.join(warnings)}")
        else:
            lines.append(f"  ✓ 分布正常")
        lines.append("")

    return "\n".join(lines)


def generate_english_analysis(results: list) -> str:
    """生成英文新闻分析。"""
    lines = []
    lines.append("\n## 英文新闻追踪\n")

    any_english = False
    for r in results:
        if not r.get("success"):
            continue
        run_id = r.get("run_id", "?")
        en = r.get("english_news", {})
        total = en.get("total", 0)
        if total > 0:
            any_english = True
            lines.append(f"- **{run_id}**: 采集 {total} → 规则 {en.get('rule_passed',0)} → Emb {en.get('embedding_passed',0)} → LLM保留 {en.get('llm_kept',0)} (最终保留率 {format_pct(en.get('llm_kept',0), total)})")
        else:
            lines.append(f"- **{run_id}**: 无英文新闻")

    if not any_english:
        lines.append("\n⚠ **全部 Run 均无英文新闻 — FINNHUB_API_KEY 可能未配置**")

    return "\n".join(lines)


def generate_empty_title_analysis(results: list) -> str:
    """生成空标题新闻分析。"""
    lines = []
    lines.append("\n## 空标题新闻追踪\n")

    for r in results:
        if not r.get("success"):
            continue
        run_id = r.get("run_id", "?")
        empty = r.get("empty_title", {})
        total = empty.get("total", 0)
        if total > 0:
            lines.append(f"- **{run_id}**: 采集 {total} → 规则 {empty.get('rule_passed',0)} → Emb {empty.get('embedding_passed',0)} → 最终 {empty.get('final_kept',0)}")
        else:
            lines.append(f"- **{run_id}**: 无空标题新闻")

    return "\n".join(lines)


def generate_embedding_comparison(results: list) -> str:
    """生成 Embedding 阈值对比。"""
    lines = []
    lines.append("\n## Embedding 阈值对比\n")

    by_threshold = defaultdict(list)
    for r in results:
        if not r.get("success"):
            continue
        threshold = r.get("params", {}).get("embedding_threshold", 0)
        by_threshold[threshold].append(r)

    for threshold in sorted(by_threshold.keys()):
        runs = by_threshold[threshold]
        lines.append(f"### 阈值 = {threshold}")
        for r in runs:
            funnel = r.get("funnel", {})
            emb_in = funnel.get("embedding_input", 0)
            emb_filt = funnel.get("embedding_filtered", 0)
            lines.append(f"  - {r['run_id']} (Strategy {r.get('params',{}).get('strategy','?')}): 输入 {emb_in}, 过滤 {emb_filt} ({format_pct(emb_filt, emb_in)})")
        lines.append("")

    # 跨阈值对比
    if len(by_threshold) >= 2:
        thresholds = sorted(by_threshold.keys())
        lines.append(f"### 对比: {thresholds[0]} vs {thresholds[1]}")
        for strategy in ["A", "B", "C"]:
            low = [r for r in by_threshold[thresholds[0]] if r.get("params", {}).get("strategy") == strategy]
            high = [r for r in by_threshold[thresholds[1]] if r.get("params", {}).get("strategy") == strategy]
            if low and high:
                low_f = low[0].get("funnel", {})
                high_f = high[0].get("funnel", {})
                low_pct = format_pct(low_f.get("embedding_filtered", 0), low_f.get("embedding_input", 1))
                high_pct = format_pct(high_f.get("embedding_filtered", 0), high_f.get("embedding_input", 1))
                lines.append(f"  - Strategy {strategy}: {thresholds[0]}→{low_pct}, {thresholds[1]}→{high_pct}")

    return "\n".join(lines)


def generate_recommendation(results: list) -> str:
    """基于结果生成推荐配置。"""
    lines = []
    lines.append("\n## 推荐配置\n")

    successful = [r for r in results if r.get("success")]
    if not successful:
        lines.append("无成功 Run，无法推荐。")
        return "\n".join(lines)

    # 评分维度：过滤率均衡性、LLM 超时、动态规则成功率
    scored = []
    for r in successful:
        funnel = r.get("funnel", {})
        # 三阶段过滤率
        rule_rate = funnel.get("rule_filtered", 0) / max(funnel.get("rule_input", 1), 1)
        emb_rate = funnel.get("embedding_filtered", 0) / max(funnel.get("embedding_input", 1), 1)
        llm_rate = funnel.get("llm_filtered", 0) / max(funnel.get("llm_input", 1), 1)
        # 均衡度（三阶段过滤率的标准差越小越好）
        rates = [rule_rate, emb_rate, llm_rate]
        mean_rate = sum(rates) / 3
        variance = sum((x - mean_rate) ** 2 for x in rates) / 3
        balance_score = 1 - variance  # 越大越好

        dyn_ok = 1 if r.get("dynamic_rules_status") == "success" else 0
        star_fb = 0 if r.get("star_fallback_triggered") else 1
        final = funnel.get("final_count", 0)

        total_score = balance_score * 0.3 + dyn_ok * 0.2 + star_fb * 0.2 + min(final / 50, 1) * 0.3

        scored.append((r, total_score, balance_score, final))

    scored.sort(key=lambda x: x[1], reverse=True)
    best = scored[0][0]

    lines.append(f"**推荐组合**: {best['run_id']} — Strategy {best.get('params',{}).get('strategy')} / Embedding {best.get('params',{}).get('embedding_threshold')}")
    lines.append("")
    lines.append("```")
    lines.append(f"RULE_ACTIVE_STRATEGY={best.get('params',{}).get('strategy')}")
    lines.append(f"EMBEDDING_SIMILARITY_THRESHOLD={best.get('params',{}).get('embedding_threshold')}")
    lines.append("LLM_BATCH_TIMEOUT=90")
    lines.append("LLM_RULES_TIMEOUT=120")
    lines.append("LLM_BATCH_SIZE=8")
    lines.append("LLM_MAX_WORKERS=3")
    lines.append("```")
    lines.append("")

    lines.append("### 排名")
    for i, (r, score, balance, final) in enumerate(scored):
        run_id = r.get("run_id", "?")
        p = r.get("params", {})
        marker = " ← 推荐" if i == 0 else ""
        lines.append(f"{i+1}. {run_id} (S={p.get('strategy')} T={p.get('embedding_threshold')}) — 综合分={score:.2f}, 均衡={balance:.2f}, 最终={final}条{marker}")

    return "\n".join(lines)


def generate_cot_samples(results: list) -> str:
    """展示 CoT 推理样本。"""
    lines = []
    lines.append("\n## CoT 推理样本\n")

    for r in results:
        if not r.get("success"):
            continue
        run_id = r.get("run_id", "?")
        samples = r.get("cot_samples", [])
        if not samples:
            continue
        lines.append(f"### {run_id}")
        for s in samples[:2]:
            lines.append(f"- **{s.get('stars',0)}★** [{s.get('source','')}] {s.get('title','')}")
            cot = s.get("cot_reasoning", "")[:200]
            if cot:
                lines.append(f"  > {cot}")
        lines.append("")

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="回归测试结果分析")
    parser.add_argument("--batch", type=str, default=None, help="指定批次时间戳")
    args = parser.parse_args()

    results = load_results(args.batch)
    print(f"已加载 {len(results)} 个 Run 结果\n")

    # 生成报告各部分
    report_parts = [
        f"# Pipeline 回归测试分析报告",
        f"\n> 生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        f"> 批次: {results[0].get('batch_ts', 'unknown') if results else 'unknown'}",
        f"> 成功: {sum(1 for r in results if r.get('success'))}/{len(results)}",
        "",
        generate_comparison_table(results),
        generate_star_analysis(results),
        generate_embedding_comparison(results),
        generate_english_analysis(results),
        generate_empty_title_analysis(results),
        generate_cot_samples(results),
        generate_recommendation(results),
    ]

    report = "\n".join(report_parts)

    # 输出到 stdout
    print(report)

    # 保存报告
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    report_path = os.path.join(RESULTS_DIR, f"analysis_{ts}.md")
    with open(report_path, "w", encoding="utf-8") as f:
        f.write(report)
    print(f"\n报告已保存: {report_path}")


if __name__ == "__main__":
    main()
