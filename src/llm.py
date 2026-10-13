"""Thin wrapper around the local Ollama runtime.

The official ``ollama`` Python client changed its return types across versions
(dicts in older releases, Pydantic models in newer ones). Everything here goes
through small accessors so both shapes work.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterator

from src import config


@dataclass
class LLMStatus:
    """Health snapshot shown in the UI."""

    online: bool
    models: list[str]
    error: str | None = None

    @property
    def label(self) -> str:
        if not self.online:
            return "Offline"
        return f"{len(self.models)} model(s)" if self.models else "No models"


# --------------------------------------------------------------------------
# Client / shape helpers
# --------------------------------------------------------------------------
def _client():
    import ollama  # imported lazily so the UI renders without Ollama running

    return ollama


def _as_dict(value: Any) -> dict:
    """Normalise a client response (dict or Pydantic model) into a plain dict."""
    if isinstance(value, dict):
        return value
    dump = getattr(value, "model_dump", None)
    if callable(dump):
        return dump()
    return {}


def _field(value: Any, key: str, default: Any = None) -> Any:
    if isinstance(value, dict):
        return value.get(key, default)
    return getattr(value, key, default)


def _content(part: Any) -> str:
    """Pull the assistant text out of a chat response chunk."""
    message = _field(part, "message")
    if message is None:
        return ""
    return str(_field(message, "content", "") or "")


# --------------------------------------------------------------------------
# Discovery
# --------------------------------------------------------------------------
def status() -> LLMStatus:
    """Check whether the local Ollama server is reachable and list models."""
    try:
        response = _client().list()
    except Exception as exc:  # noqa: BLE001 - reported to the user
        return LLMStatus(online=False, models=[], error=str(exc))

    raw = _field(response, "models", None)
    if raw is None:
        raw = _as_dict(response).get("models", [])

    names: list[str] = []
    for item in raw or []:
        name = _field(item, "model") or _field(item, "name")
        if name:
            names.append(str(name))

    return LLMStatus(online=True, models=sorted(set(names)))


def pick_default_model(models: list[str]) -> str:
    """Choose a sensible default from the installed models."""
    if not models:
        return config.DEFAULT_LLM_MODEL
    for candidate in (config.DEFAULT_LLM_MODEL, "llama3.2:latest", "llama3.2"):
        if candidate in models:
            return candidate
    # Prefer a general-purpose instruct model over an embedding model.
    usable = [m for m in models if "embed" not in m.lower()]
    return (usable or models)[0]


# --------------------------------------------------------------------------
# Generation
# --------------------------------------------------------------------------
def _options(temperature: float) -> dict:
    return {"temperature": temperature, "num_ctx": config.LLM_NUM_CTX}


def stream_chat(
    messages: list[dict],
    model: str,
    temperature: float = config.LLM_TEMPERATURE,
) -> Iterator[str]:
    """Yield response tokens from ``/api/chat`` as they are generated."""
    stream = _client().chat(
        model=model,
        messages=messages,
        stream=True,
        options=_options(temperature),
    )
    for part in stream:
        piece = _content(part)
        if piece:
            yield piece


def complete(
    messages: list[dict],
    model: str,
    temperature: float = config.LLM_TEMPERATURE,
    json_schema: dict | None = None,
) -> str:
    """Blocking variant of :func:`stream_chat`.

    When ``json_schema`` is supplied the request uses Ollama's structured-output
    mode, which constrains decoding to that schema so the reply is valid JSON.
    """
    kwargs: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "stream": False,
        "options": _options(temperature),
    }
    if json_schema is not None:
        kwargs["format"] = json_schema

    response = _client().chat(**kwargs)
    return _content(response)
