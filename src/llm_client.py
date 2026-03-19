from __future__ import annotations

import json
import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import requests

from config import LLM_API_KEY, LLM_BASE_URL, LLM_MODEL_ID


@dataclass
class LLMCallResult:
    """一次 LLM 调用的完整结果，包含成功/失败状态、耗时及原始文本。"""
    success: bool
    model: str
    base_url: str
    stream: bool
    status_code: Optional[int]
    elapsed_seconds: float
    first_chunk_seconds: Optional[float]   # 流式模式下首个 chunk 到达时间
    response_text: str
    response_chars: int
    prompt_chars: int
    system_chars: int
    user_chars: int
    prompt_preview: str                    # 仅取前 200 字符，用于日志快速预览
    error: str = ""


def _message_text_length(messages: List[Dict[str, Any]], role: str) -> int:
    """统计指定角色（system/user）的消息总字符数，用于记录 prompt 规模。"""
    return sum(len(str(message.get("content") or "")) for message in messages if message.get("role") == role)


def build_chat_url(base_url: str) -> str:
    """将 base_url 拼接为标准 OpenAI 兼容的 chat completions 端点地址。"""
    return f"{base_url.rstrip('/')}/chat/completions"


def extract_message_content(payload: Dict[str, Any]) -> str:
    """从非流式响应 JSON 中提取正文文本。
    content 字段可能是字符串（普通模型）或 list（多模态模型），统一处理。
    """
    choices = payload.get("choices") or []
    if not choices:
        return ""

    message = choices[0].get("message") or {}
    content = message.get("content", "")
    if isinstance(content, str):
        return content
    # 多模态模型返回 content 为 list，提取其中 type=text 的片段
    if isinstance(content, list):
        chunks: List[str] = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                text = item.get("text")
                if isinstance(text, str):
                    chunks.append(text)
        return "".join(chunks)
    return str(content or "")


def _extract_stream_content_line(line: str) -> str:
    """解析 SSE 流式响应的单行数据，返回当前 chunk 的文本增量。
    SSE 格式：每行以 'data: ' 开头，结束标志为 '[DONE]'。
    """
    if not line.startswith("data:"):
        return ""

    payload = line[5:].strip()
    # 跳过空行和流结束标志
    if not payload or payload == "[DONE]":
        return ""

    data = json.loads(payload)
    choices = data.get("choices") or []
    if not choices:
        return ""

    # 流式响应使用 delta 而非 message 字段
    delta = choices[0].get("delta") or {}
    content = delta.get("content", "")
    if isinstance(content, str):
        return content
    # 多模态模型的流式 content 同样可能为 list
    if isinstance(content, list):
        chunks: List[str] = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                text = item.get("text")
                if isinstance(text, str):
                    chunks.append(text)
        return "".join(chunks)
    return ""


class LLMClient:
    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        default_model: Optional[str] = None,
        timeout: int = 30,
        max_retries: int = 0,
        logger: Any = None,
    ) -> None:
        self.api_key = api_key or LLM_API_KEY
        self.base_url = (base_url or LLM_BASE_URL).rstrip("/")
        self.default_model = default_model or LLM_MODEL_ID
        self.timeout = timeout
        self.max_retries = max_retries
        self.logger = logger
        # 按模型累计调用统计
        self._stats: Dict[str, Dict[str, float]] = defaultdict(
            lambda: {"call_count": 0, "total_prompt_chars": 0, "total_response_chars": 0, "total_elapsed": 0.0}
        )

    def _record_stats(self, result: LLMCallResult) -> LLMCallResult:
        """更新按模型的累计统计并返回原始结果。"""
        s = self._stats[result.model]
        s["call_count"] += 1
        s["total_prompt_chars"] += result.prompt_chars
        s["total_response_chars"] += result.response_chars
        s["total_elapsed"] += result.elapsed_seconds
        # 每次调用完成后打印详细日志
        if self.logger:
            if result.success:
                self.logger.info(
                    "LLM 完成: model=%s, 耗时 %.1fs, prompt %s字, response %s字",
                    result.model,
                    result.elapsed_seconds,
                    result.prompt_chars,
                    result.response_chars,
                )
            else:
                self.logger.error(
                    "LLM 失败: model=%s, 耗时 %.1fs, error=%s",
                    result.model,
                    result.elapsed_seconds,
                    result.error,
                )
        return result

    def log_summary(self) -> None:
        """按模型分组输出 LLM 调用汇总。"""
        if not self.logger or not self._stats:
            return
        for model, s in self._stats.items():
            self.logger.info(
                "[LLM汇总] %s: 调用 %s次, prompt %.1fk字, response %.1fk字, 耗时 %.1fs",
                model,
                int(s["call_count"]),
                s["total_prompt_chars"] / 1000,
                s["total_response_chars"] / 1000,
                s["total_elapsed"],
            )

    def call_chat(
        self,
        messages: List[Dict[str, Any]],
        *,
        log_label: str = "LLM request",
        model: Optional[str] = None,
        max_tokens: int = 512,
        temperature: float = 0.2,
        stream: bool = False,
        timeout: Optional[int] = None,
        max_retries: Optional[int] = None,
        extra_payload: Optional[Dict[str, Any]] = None,
    ) -> LLMCallResult:
        model_name = model or self.default_model
        request_timeout = timeout if timeout is not None else self.timeout
        retries = max_retries if max_retries is not None else self.max_retries
        url = build_chat_url(self.base_url)
        payload: Dict[str, Any] = {
            "model": model_name,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "stream": stream,
        }
        if extra_payload:
            payload.update(extra_payload)

        system_chars = _message_text_length(messages, "system")
        user_chars = _message_text_length(messages, "user")
        # 仅截取 user 消息前 200 字符作为日志预览，避免打印过长 prompt
        prompt_preview = "\n".join(
            str(message.get("content") or "")[:200]
            for message in messages
            if message.get("role") == "user"
        )[:200]

        # 重试循环：attempt 从 0 开始，最多执行 retries+1 次
        for attempt in range(retries + 1):
            started = time.time()
            try:
                if self.logger:
                    self.logger.info(
                        "调用 LLM: %s (model=%s, timeout=%ss, retry=%s/%s, stream=%s, prompt_chars=%s)",
                        log_label,
                        model_name,
                        request_timeout,
                        attempt,
                        retries,
                        stream,
                        system_chars + user_chars,
                    )

                response = requests.post(
                    url,
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                    timeout=request_timeout,
                    stream=stream,
                )

                if not stream:
                    elapsed = time.time() - started
                    if response.ok:
                        response_json = response.json()
                        response_text = extract_message_content(response_json)
                        return self._record_stats(LLMCallResult(
                            success=True,
                            model=model_name,
                            base_url=self.base_url,
                            stream=False,
                            status_code=response.status_code,
                            elapsed_seconds=elapsed,
                            first_chunk_seconds=None,
                            response_text=response_text,
                            response_chars=len(response_text),
                            prompt_chars=system_chars + user_chars,
                            system_chars=system_chars,
                            user_chars=user_chars,
                            prompt_preview=prompt_preview,
                        ))

                    error_text = response.text[:500]
                    raise requests.HTTPError(error_text, response=response)

                response.raise_for_status()
                first_chunk_seconds: Optional[float] = None
                chunks: List[str] = []
                # 逐行读取 SSE 流，记录首个 chunk 耗时并拼接全部文本增量
                for raw_line in response.iter_lines(decode_unicode=True):
                    if not raw_line:
                        continue
                    if first_chunk_seconds is None:
                        first_chunk_seconds = time.time() - started
                    try:
                        content = _extract_stream_content_line(raw_line)
                    except json.JSONDecodeError:
                        content = ""
                    if content:
                        chunks.append(content)

                elapsed = time.time() - started
                response_text = "".join(chunks)
                return self._record_stats(LLMCallResult(
                    success=True,
                    model=model_name,
                    base_url=self.base_url,
                    stream=True,
                    status_code=response.status_code,
                    elapsed_seconds=elapsed,
                    first_chunk_seconds=first_chunk_seconds,
                    response_text=response_text,
                    response_chars=len(response_text),
                    prompt_chars=system_chars + user_chars,
                    system_chars=system_chars,
                    user_chars=user_chars,
                    prompt_preview=prompt_preview,
                ))

            except requests.exceptions.Timeout as exc:
                if self.logger:
                    self.logger.error("[%s] LLM超时: model=%s, timeout=%ss, retry=%s/%s, %s", log_label, model_name, request_timeout, attempt, retries, exc)
                # 仅在耗尽所有重试后才返回失败，否则继续下一次 attempt
                if attempt == retries:
                    return self._record_stats(LLMCallResult(
                        success=False,
                        model=model_name,
                        base_url=self.base_url,
                        stream=stream,
                        status_code=None,
                        elapsed_seconds=time.time() - started,
                        first_chunk_seconds=None,
                        response_text="",
                        response_chars=0,
                        prompt_chars=system_chars + user_chars,
                        system_chars=system_chars,
                        user_chars=user_chars,
                        prompt_preview=prompt_preview,
                        error=str(exc),
                    ))
            except requests.exceptions.RequestException as exc:
                # 尝试提取 HTTP 状态码；网络层异常（如 ConnectionError）无响应对象时置 None
                status_code = exc.response.status_code if getattr(exc, "response", None) is not None else None
                if self.logger:
                    self.logger.error("[%s] 请求失败: status=%s, %s", log_label, status_code, exc)
                if attempt == retries:
                    return self._record_stats(LLMCallResult(
                        success=False,
                        model=model_name,
                        base_url=self.base_url,
                        stream=stream,
                        status_code=status_code,
                        elapsed_seconds=time.time() - started,
                        first_chunk_seconds=None,
                        response_text="",
                        response_chars=0,
                        prompt_chars=system_chars + user_chars,
                        system_chars=system_chars,
                        user_chars=user_chars,
                        prompt_preview=prompt_preview,
                        error=str(exc),
                    ))
            except Exception as exc:
                if self.logger:
                    self.logger.error("[%s] 执行失败: %s", log_label, exc)
                return self._record_stats(LLMCallResult(
                    success=False,
                    model=model_name,
                    base_url=self.base_url,
                    stream=stream,
                    status_code=None,
                    elapsed_seconds=time.time() - started,
                    first_chunk_seconds=None,
                    response_text="",
                    response_chars=0,
                    prompt_chars=system_chars + user_chars,
                    system_chars=system_chars,
                    user_chars=user_chars,
                    prompt_preview=prompt_preview,
                    error=str(exc),
                ))

        # 理论上不可达：重试循环内部已处理所有路径，此处作为防御性兜底返回
        return self._record_stats(LLMCallResult(
            success=False,
            model=model_name,
            base_url=self.base_url,
            stream=stream,
            status_code=None,
            elapsed_seconds=0.0,
            first_chunk_seconds=None,
            response_text="",
            response_chars=0,
            prompt_chars=system_chars + user_chars,
            system_chars=system_chars,
            user_chars=user_chars,
            prompt_preview=prompt_preview,
            error="unexpected retry exit",
        ))
