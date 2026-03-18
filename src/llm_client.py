from __future__ import annotations

import json
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import requests

from config import LLM_API_KEY, LLM_BASE_URL, LLM_MODEL_ID


@dataclass
class LLMCallResult:
    success: bool
    model: str
    base_url: str
    stream: bool
    status_code: Optional[int]
    elapsed_seconds: float
    first_chunk_seconds: Optional[float]
    response_text: str
    response_chars: int
    prompt_chars: int
    system_chars: int
    user_chars: int
    prompt_preview: str
    error: str = ""


def _message_text_length(messages: List[Dict[str, Any]], role: str) -> int:
    return sum(len(str(message.get("content") or "")) for message in messages if message.get("role") == role)


def build_chat_url(base_url: str) -> str:
    return f"{base_url.rstrip('/')}/chat/completions"


def extract_message_content(payload: Dict[str, Any]) -> str:
    choices = payload.get("choices") or []
    if not choices:
        return ""

    message = choices[0].get("message") or {}
    content = message.get("content", "")
    if isinstance(content, str):
        return content
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
    if not line.startswith("data:"):
        return ""

    payload = line[5:].strip()
    if not payload or payload == "[DONE]":
        return ""

    data = json.loads(payload)
    choices = data.get("choices") or []
    if not choices:
        return ""

    delta = choices[0].get("delta") or {}
    content = delta.get("content", "")
    if isinstance(content, str):
        return content
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
        prompt_preview = "\n".join(
            str(message.get("content") or "")[:200]
            for message in messages
            if message.get("role") == "user"
        )[:200]

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
                        return LLMCallResult(
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
                        )

                    error_text = response.text[:500]
                    raise requests.HTTPError(error_text, response=response)

                response.raise_for_status()
                first_chunk_seconds: Optional[float] = None
                chunks: List[str] = []
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
                return LLMCallResult(
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
                )

            except requests.exceptions.Timeout as exc:
                if self.logger:
                    self.logger.warning("%s 超时: %s", log_label, exc)
                if attempt == retries:
                    return LLMCallResult(
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
                    )
            except requests.exceptions.RequestException as exc:
                status_code = exc.response.status_code if getattr(exc, "response", None) is not None else None
                if self.logger:
                    self.logger.error("%s 请求失败: %s", log_label, exc)
                if attempt == retries:
                    return LLMCallResult(
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
                    )
            except Exception as exc:
                if self.logger:
                    self.logger.error("%s 执行失败: %s", log_label, exc)
                return LLMCallResult(
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
                )

        return LLMCallResult(
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
        )
