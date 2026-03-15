"""
LLM benchmark harness for news-structuring prompts.

Records:
- model choice
- prompt variant and prompt length
- batch size
- stream on/off
- concurrency impact

Outputs JSON and Markdown reports into output/.
"""
from __future__ import annotations

import argparse
import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from config import (
    LLM_API_KEY,
    LLM_BASE_URL,
    LLM_BATCH_MODEL_ID,
    LLM_MODEL_ID,
    LLM_MODEL_OPTIONS,
    LLM_SUMMARY_MODEL_ID,
    OUTPUT_DIR,
)
from llm_client import LLMClient


SAMPLE_NEWS: List[Dict[str, Any]] = [
    {
        "news_hash": "sample-1",
        "time": "2026-03-15 09:00:00",
        "source": "sina",
        "title": "美联储官员暗示降息路径调整",
        "content": "美联储官员最新讲话引发美债收益率和标普500期货波动，市场重新评估流动性预期。",
    },
    {
        "news_hash": "sample-2",
        "time": "2026-03-15 09:05:00",
        "source": "cls_cn",
        "title": "伊朗相关局势升级推高油价",
        "content": "中东局势升级导致原油运输担忧升温，能源价格和全球风险偏好同步受影响。",
    },
    {
        "news_hash": "sample-3",
        "time": "2026-03-15 09:10:00",
        "source": "jin10",
        "title": "微软发布新 AI 产品",
        "content": "微软发布的新 AI 产品有望提振云计算和 AI 产业链情绪，带动科技股板块关注度。",
    },
    {
        "news_hash": "sample-4",
        "time": "2026-03-15 09:15:00",
        "source": "yahoo_finance",
        "title": "Micron 将公布财报与资本开支计划",
        "content": "市场关注 Micron 财报和资本开支指引，认为其将影响半导体设备与存储板块预期。",
    },
    {
        "news_hash": "sample-5",
        "time": "2026-03-15 09:20:00",
        "source": "sina",
        "title": "美元指数走强压制黄金",
        "content": "美元指数短线走强，黄金价格承压，投资者重新评估避险资产配置。",
    },
    {
        "news_hash": "sample-6",
        "time": "2026-03-15 09:25:00",
        "source": "cls_cn",
        "title": "分析师上调某消费股目标价",
        "content": "券商分析师上调某消费股目标价，但缺乏新的基本面信息增量。",
    },
]


SAMPLE_ENHANCED_NEWS: List[Dict[str, Any]] = [
    {
        "news_hash": "sample-1",
        "pub_date": "2026-03-13 10:00:00",
        "type": "macro",
        "importance_level": "high",
        "primary_symbol": None,
        "related_symbols": [],
        "title": "美联储官员暗示降息路径调整",
        "ai_summary": "美联储讲话引发市场对年内降息节奏重新定价。",
        "market_impact": "利率预期波动可能影响美债收益率和成长股估值。",
    },
    {
        "news_hash": "sample-2",
        "pub_date": "2026-03-13 11:00:00",
        "type": "market",
        "importance_level": "high",
        "primary_symbol": "GC=F",
        "related_symbols": ["GC=F", "DX-Y.NYB"],
        "title": "美元指数走强压制黄金",
        "ai_summary": "美元走强令黄金价格承压，避险资产配置再平衡。",
        "market_impact": "贵金属和美元相关资产短线波动加大。",
    },
    {
        "news_hash": "sample-3",
        "pub_date": "2026-03-13 13:00:00",
        "type": "symbol",
        "importance_level": "medium",
        "primary_symbol": "MU",
        "related_symbols": ["MU"],
        "title": "Micron 将公布财报与资本开支计划",
        "ai_summary": "市场关注美光财报和资本开支指引对半导体板块的影响。",
        "market_impact": "若指引超预期，可能带动存储和设备链预期修复。",
    },
]


@dataclass
class RunResult:
    suite: str
    model: str
    prompt_variant: str
    batch_size: int
    stream: bool
    concurrency: int
    success: bool
    status_code: Optional[int]
    elapsed_seconds: float
    first_chunk_seconds: Optional[float]
    prompt_chars: int
    system_chars: int
    user_chars: int
    prompt_preview: str
    response_chars: int
    error: str = ""


llm_client = LLMClient(
    api_key=LLM_API_KEY,
    base_url=LLM_BASE_URL,
    default_model=LLM_MODEL_ID,
)


def build_structured_prompt(items: List[Dict[str, Any]], long_content: bool = False) -> str:
    if long_content:
        expanded_items = []
        for item in items:
            expanded = dict(item)
            expanded["content"] = f"{item['content']} {item['content']} {item['content']}"
            expanded_items.append(expanded)
        items = expanded_items

    return (
        "请只输出 JSON，不要输出解释。格式如下：\n"
        "{\n"
        '  "items": [\n'
        "    {\n"
        '      "news_hash": "原样返回",\n'
        '      "keep": true,\n'
        '      "type": "macro|market|symbol",\n'
        '      "ai_summary": "一句中文摘要",\n'
        '      "market_impact": "一句中文说明",\n'
        '      "importance_level": "high|medium|low",\n'
        '      "primary_symbol": "MU 或 null",\n'
        '      "related_symbols": ["MU"]\n'
        "    }\n"
        "  ]\n"
        "}\n\n"
        f"{json.dumps({'items': items}, ensure_ascii=False)}"
    )


def build_daily_summary_prompt(items: List[Dict[str, Any]]) -> str:
    return (
        "请只输出 JSON。"
        '字段必须包含 "global_news"、"market_news"、"symbol_news"、"market_analysis"。'
        "其中前三个字段可以是字符串或字符串数组，market_analysis 必须是一段中文总结。\n\n"
        f"{json.dumps({'analysis_date': '2026-03-13', 'items': items}, ensure_ascii=False)}"
    )


def build_messages(batch_size: int, prompt_variant: str) -> List[Dict[str, str]]:
    items = SAMPLE_NEWS[:batch_size]
    if prompt_variant == "tiny_ok":
        return [
            {"role": "system", "content": "你是助手。"},
            {"role": "user", "content": "只回复OK"},
        ]
    if prompt_variant == "daily_summary":
        return [
            {
                "role": "system",
                "content": "你是一位金融复盘分析师，请基于输入新闻生成 JSON，总结全球、市场和标的影响。",
            },
            {"role": "user", "content": build_daily_summary_prompt(SAMPLE_ENHANCED_NEWS[:batch_size])},
        ]
    if prompt_variant == "structured_long":
        return [
            {"role": "system", "content": "你是金融新闻结构化助手，只输出 JSON。"},
            {"role": "user", "content": build_structured_prompt(items, long_content=True)},
        ]
    return [
        {"role": "system", "content": "你是金融新闻结构化助手，只输出 JSON。"},
        {"role": "user", "content": build_structured_prompt(items, long_content=False)},
    ]


def build_payload(model: str, batch_size: int, stream: bool, prompt_variant: str) -> Dict[str, Any]:
    return {
        "model": model,
        "messages": build_messages(batch_size, prompt_variant),
        "max_tokens": 256,
        "temperature": 0.2,
        "stream": stream,
    }


def call_completion(
    model: str,
    batch_size: int,
    stream: bool,
    timeout: int = 30,
    prompt_variant: str = "structured_short",
) -> RunResult:
    payload = build_payload(model, batch_size, stream, prompt_variant)
    llm_result = llm_client.call_chat(
        payload["messages"],
        log_label=f"benchmark:{model}:{prompt_variant}:batch{batch_size}",
        model=model,
        max_tokens=payload["max_tokens"],
        temperature=payload["temperature"],
        stream=stream,
        timeout=timeout,
    )
    return RunResult(
        suite="single",
        model=model,
        prompt_variant=prompt_variant,
        batch_size=batch_size,
        stream=stream,
        concurrency=1,
        success=llm_result.success,
        status_code=llm_result.status_code,
        elapsed_seconds=llm_result.elapsed_seconds,
        first_chunk_seconds=llm_result.first_chunk_seconds,
        prompt_chars=llm_result.prompt_chars,
        system_chars=llm_result.system_chars,
        user_chars=llm_result.user_chars,
        prompt_preview=llm_result.prompt_preview,
        response_chars=llm_result.response_chars,
        error=llm_result.error,
    )


def run_concurrency_case(
    model: str,
    batch_size: int,
    stream: bool,
    concurrency: int,
    timeout: int = 30,
    prompt_variant: str = "structured_short",
) -> Dict[str, Any]:
    started = time.time()
    results: List[RunResult] = []
    with ThreadPoolExecutor(max_workers=concurrency) as executor:
        futures = [
            executor.submit(call_completion, model, batch_size, stream, timeout, prompt_variant)
            for _ in range(concurrency)
        ]
        for future in as_completed(futures):
            results.append(future.result())

    wall_clock = time.time() - started
    successful = [result for result in results if result.success]

    return {
        "suite": "concurrency",
        "model": model,
        "prompt_variant": prompt_variant,
        "batch_size": batch_size,
        "stream": stream,
        "concurrency": concurrency,
        "wall_clock_seconds": round(wall_clock, 2),
        "success_count": len(successful),
        "avg_elapsed_seconds": round(sum(result.elapsed_seconds for result in results) / len(results), 2),
        "avg_first_chunk_seconds": (
            round(sum((result.first_chunk_seconds or 0) for result in successful) / len(successful), 2)
            if stream and successful else None
        ),
        "results": [asdict(result) for result in results],
    }


def run_quick_suite(models: List[str], timeout: int = 20) -> Dict[str, Any]:
    report: Dict[str, Any] = {
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "base_url": LLM_BASE_URL,
        "suite": "quick",
        "cases": [],
    }

    for model in models[:2]:
        for prompt_variant in ["tiny_ok", "structured_short", "daily_summary"]:
            result = call_completion(
                model=model,
                batch_size=2 if prompt_variant != "daily_summary" else 3,
                stream=False,
                timeout=timeout,
                prompt_variant=prompt_variant,
            )
            result.suite = "model_compare"
            report["cases"].append(asdict(result))

    batch_model = models[-1]

    for prompt_variant in ["structured_short", "structured_long"]:
        result = call_completion(
            model=batch_model,
            batch_size=2,
            stream=False,
            timeout=timeout,
            prompt_variant=prompt_variant,
        )
        result.suite = "prompt_length"
        report["cases"].append(asdict(result))

    for batch_size in [2, 4, 6]:
        result = call_completion(
            model=batch_model,
            batch_size=batch_size,
            stream=False,
            timeout=timeout,
            prompt_variant="structured_short",
        )
        result.suite = "batch_size"
        report["cases"].append(asdict(result))

    for stream in [False, True]:
        result = call_completion(
            model=batch_model,
            batch_size=2,
            stream=stream,
            timeout=timeout if not stream else max(timeout, 25),
            prompt_variant="structured_short",
        )
        result.suite = "stream_compare"
        report["cases"].append(asdict(result))

    for concurrency in [1, 2]:
        report["cases"].append(
            run_concurrency_case(
                model=batch_model,
                batch_size=2,
                stream=False,
                concurrency=concurrency,
                timeout=timeout,
                prompt_variant="structured_short",
            )
        )

    return report


def render_markdown_report(report: Dict[str, Any]) -> str:
    lines = [
        "# LLM Benchmark Report",
        "",
        f"- 生成时间: `{report['generated_at']}`",
        f"- Endpoint: `{report['base_url']}`",
        f"- Suite: `{report['suite']}`",
        "",
        "## Cases",
        "",
    ]

    for case in report["cases"]:
        if case.get("suite") == "concurrency":
            prompt_chars = case["results"][0]["prompt_chars"] if case.get("results") else "-"
            lines.extend([
                f"### concurrency: model=`{case['model']}` prompt=`{case['prompt_variant']}` concurrency=`{case['concurrency']}`",
                f"- prompt chars: `{prompt_chars}`",
                f"- wall clock: `{case['wall_clock_seconds']}s`",
                f"- avg elapsed: `{case['avg_elapsed_seconds']}s`",
                f"- success: `{case['success_count']}/{case['concurrency']}`",
                "",
            ])
            continue

        lines.extend([
            f"### {case['suite']}: model=`{case['model']}` prompt=`{case['prompt_variant']}` batch=`{case['batch_size']}` stream=`{case['stream']}`",
            f"- success: `{case['success']}`",
            f"- status: `{case['status_code']}`",
            f"- elapsed: `{round(case['elapsed_seconds'], 2)}s`",
            f"- first chunk: `{case['first_chunk_seconds']}`",
            f"- prompt chars: `{case['prompt_chars']}` (system `{case['system_chars']}`, user `{case['user_chars']}`)",
            f"- response chars: `{case['response_chars']}`",
            f"- prompt preview: `{case['prompt_preview'][:120]}`",
        ])
        if case.get("error"):
            lines.append(f"- error: `{case['error'][:200]}`")
        lines.append("")

    return "\n".join(lines)


def save_report(report: Dict[str, Any]) -> Dict[str, str]:
    output_dir = Path(OUTPUT_DIR)
    output_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    json_path = output_dir / f"llm_benchmark_{timestamp}.json"
    md_path = output_dir / f"llm_benchmark_{timestamp}.md"
    latest_json = output_dir / "llm_benchmark_latest.json"
    latest_md = output_dir / "llm_benchmark_latest.md"

    json_text = json.dumps(report, ensure_ascii=False, indent=2)
    md_text = render_markdown_report(report)

    json_path.write_text(json_text, encoding="utf-8")
    md_path.write_text(md_text, encoding="utf-8")
    latest_json.write_text(json_text, encoding="utf-8")
    latest_md.write_text(md_text, encoding="utf-8")

    return {
        "json_path": str(json_path),
        "md_path": str(md_path),
        "latest_json": str(latest_json),
        "latest_md": str(latest_md),
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Benchmark structured LLM news prompts.")
    parser.add_argument(
        "--models",
        nargs="+",
        default=LLM_MODEL_OPTIONS or [LLM_BATCH_MODEL_ID, LLM_SUMMARY_MODEL_ID, LLM_MODEL_ID],
        help="Models to compare. First is treated as baseline.",
    )
    parser.add_argument("--timeout", type=int, default=20)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    report = run_quick_suite(models=args.models, timeout=args.timeout)
    saved = save_report(report)
    print(json.dumps({"saved": saved}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
