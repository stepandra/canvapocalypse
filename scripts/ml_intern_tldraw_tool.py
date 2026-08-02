"""Three built-in ML-Intern tools for the local native-tldraw capability bridge.

Copy this module into ``agent/tools/`` in the ML-Intern checkout. In
``agent/core/tools.py``, import ``create_tldraw_canvas_tools`` and extend the
list returned by ``create_builtin_tools()`` with
``create_tldraw_canvas_tools(ToolSpec)``. The module deliberately does not
import ML-Intern core, so it can be syntax-tested and inspected independently.
"""

from __future__ import annotations

import asyncio
import json
import math
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

DEFAULT_BRIDGE_URL = "http://127.0.0.1:5176/ml-intern/canvas-tool"
DEFAULT_TIMEOUT_SECONDS = 120
CAPABILITY_IDS = (
    "canvas.inspect",
    "canvas.shape.basic",
    "canvas.layout",
    "canvas.native-assets",
    "canvas.workflow",
    "canvas.result.read",
)


def create_tldraw_canvas_tools(tool_spec_type: type) -> list[Any]:
    """Return exactly three small ``ToolSpec`` objects without importing core."""

    return [
        tool_spec_type(
            name="tldraw_capabilities",
            description=(
                "Discover the compact native-tldraw capability IDs for this local "
                "session. Call this before describing or executing a capability."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "canvasBinding": {
                        "type": "string",
                        "description": (
                            "Optional binding reported by the target canvas widget. "
                            "Required only when multiple canvas tabs are active."
                        ),
                    }
                },
                "additionalProperties": False,
            },
            handler=tldraw_capabilities_handler,
        ),
        tool_spec_type(
            name="tldraw_describe_capability",
            description=(
                "Hydrate the bounded input contract for one discovered native-tldraw "
                "capability. This never mutates the canvas."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "manifestId": {"type": "string"},
                    "binding": {"type": "string"},
                    "capabilityId": {
                        "type": "string",
                        "description": "One ID returned by tldraw_capabilities.",
                    },
                },
                "required": ["manifestId", "binding", "capabilityId"],
                "additionalProperties": False,
            },
            handler=tldraw_describe_capability_handler,
        ),
        tool_spec_type(
            name="tldraw_execute",
            description=(
                "Queue one manifest-bound native-tldraw operation against an explicit "
                "selection or bounded area and wait for a compact validated receipt."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "manifestId": {"type": "string"},
                    "binding": {"type": "string"},
                    "capabilityId": {
                        "type": "string",
                        "description": "The one hydrated native-tldraw capability ID.",
                    },
                    "instruction": {
                        "type": "string",
                        "description": "One concise bounded inspection or mutation.",
                        "maxLength": 8000,
                    },
                    "context": {
                        "type": "string",
                        "enum": ["selection", "selection-or-area"],
                    },
                    "bounds": {
                        "type": "object",
                        "description": (
                            "Optional explicit tldraw page bounds. Use only with "
                            "selection-or-area when no canvas selection is available."
                        ),
                        "properties": {
                            "x": {"type": "number"},
                            "y": {"type": "number"},
                            "w": {"type": "number", "exclusiveMinimum": 0},
                            "h": {"type": "number", "exclusiveMinimum": 0},
                        },
                        "required": ["x", "y", "w", "h"],
                        "additionalProperties": False,
                    },
                    "idempotencyKey": {
                        "type": "string",
                        "description": "Optional stable operation key for safe retry.",
                        "maxLength": 96,
                    },
                },
                "required": [
                    "manifestId",
                    "binding",
                    "capabilityId",
                    "instruction",
                    "context",
                ],
                "additionalProperties": False,
            },
            handler=tldraw_execute_handler,
        ),
    ]


async def tldraw_capabilities_handler(
    arguments: dict[str, Any],
) -> tuple[str, bool]:
    """Discover IDs plus a short-lived manifest binding; no schemas."""

    try:
        canvas_binding = str(arguments.get("canvasBinding", "")).strip()
        query = (
            f"?canvasBinding={urllib.parse.quote(canvas_binding)}"
            if canvas_binding
            else ""
        )
        result = await asyncio.to_thread(
            _json_request, f"{_bridge_url()}/capabilities{query}"
        )
        return json.dumps(result, ensure_ascii=False), True
    except Exception as error:  # ML-Intern expects failures as tool output.
        return f"tldraw_capabilities failed: {error}", False


async def tldraw_describe_capability_handler(
    arguments: dict[str, Any],
) -> tuple[str, bool]:
    """Hydrate one capability schema from the short-lived manifest."""

    try:
        payload = _validate_manifest_arguments(arguments)
        capability_id = str(arguments.get("capabilityId", "")).strip()
        if capability_id not in CAPABILITY_IDS:
            raise ValueError(
                "capabilityId is not in the discovered native-tldraw allowlist"
            )
        result = await asyncio.to_thread(
            _json_request,
            f"{_bridge_url()}/capabilities/describe",
            method="POST",
            payload={**payload, "capabilityId": capability_id},
        )
        return json.dumps(result, ensure_ascii=False), True
    except Exception as error:
        return f"tldraw_describe_capability failed: {error}", False


async def tldraw_execute_handler(
    arguments: dict[str, Any],
) -> tuple[str, bool]:
    """Queue one request and wait for the browser-side compact receipt."""

    try:
        result = await asyncio.to_thread(_execute_and_wait, arguments)
        return json.dumps(result, ensure_ascii=False), result.get(
            "status"
        ) == "succeeded"
    except Exception as error:
        return f"tldraw_execute failed: {error}", False


def _execute_and_wait(arguments: dict[str, Any]) -> dict[str, Any]:
    manifest = _validate_manifest_arguments(arguments)
    capability_id = str(arguments.get("capabilityId", "")).strip()
    if capability_id not in CAPABILITY_IDS:
        raise ValueError(
            "capabilityId is not in the discovered native-tldraw allowlist"
        )
    instruction = str(arguments.get("instruction", "")).strip()
    if not instruction:
        raise ValueError("instruction is required")
    if len(instruction) > 8000:
        raise ValueError("instruction exceeds 8000 characters")
    context = arguments.get("context")
    if context not in {"selection", "selection-or-area"}:
        raise ValueError("context must be selection or selection-or-area")
    bounds = _validate_requested_bounds(arguments.get("bounds"), context)
    idempotency_key = arguments.get("idempotencyKey")
    if idempotency_key is not None:
        idempotency_key = str(idempotency_key).strip()
        if not idempotency_key or len(idempotency_key) > 96:
            raise ValueError("idempotencyKey must contain 1..96 characters")

    queued = _json_request(
        f"{_bridge_url()}/execute",
        method="POST",
        payload={
            **manifest,
            "capabilityId": capability_id,
            "instruction": instruction,
            "context": context,
            **({"bounds": bounds} if bounds else {}),
            **({"idempotencyKey": idempotency_key} if idempotency_key else {}),
        },
    )
    if queued.get("status") in {"succeeded", "failed"}:
        return _terminal_result(queued)

    request_id = queued["id"]
    deadline = time.monotonic() + DEFAULT_TIMEOUT_SECONDS
    while time.monotonic() < deadline:
        status = _json_request(
            f"{_bridge_url()}/status?requestId={urllib.parse.quote(request_id)}"
        )["request"]
        if status["status"] in {"succeeded", "failed"}:
            return _terminal_result(status)
        time.sleep(0.75)
    raise TimeoutError("browser did not return a canvas receipt within 120 seconds")


def _terminal_result(request: dict[str, Any]) -> dict[str, Any]:
    return {
        "requestId": request["id"],
        "status": request["status"],
        "capabilityId": request["capabilityId"],
        "summary": request.get("summary", ""),
    }


def _validate_manifest_arguments(arguments: dict[str, Any]) -> dict[str, str]:
    manifest_id = str(arguments.get("manifestId", "")).strip()
    binding = str(arguments.get("binding", "")).strip()
    if not manifest_id:
        raise ValueError("manifestId is required; call tldraw_capabilities again")
    if not binding:
        raise ValueError("binding is required; call tldraw_capabilities again")
    return {"manifestId": manifest_id, "binding": binding}


def _validate_requested_bounds(value: Any, context: str) -> dict[str, float] | None:
    if value is None:
        return None
    if context != "selection-or-area":
        raise ValueError("bounds require context=selection-or-area")
    if not isinstance(value, dict) or set(value) != {"x", "y", "w", "h"}:
        raise ValueError("bounds must contain exactly x, y, w, and h")
    if any(
        isinstance(value[key], bool) or not isinstance(value[key], (int, float))
        for key in ("x", "y", "w", "h")
    ):
        raise ValueError("bounds values must be numbers")
    bounds = {key: float(value[key]) for key in ("x", "y", "w", "h")}
    if any(not math.isfinite(bounds[key]) for key in ("x", "y", "w", "h")):
        raise ValueError("bounds values must be finite")
    if bounds["w"] <= 0 or bounds["h"] <= 0:
        raise ValueError("bounds width and height must be positive")
    if abs(bounds["x"]) > 10_000_000 or abs(bounds["y"]) > 10_000_000:
        raise ValueError("bounds coordinates exceed the supported page range")
    if (
        bounds["w"] > 8_192
        or bounds["h"] > 8_192
        or bounds["w"] * bounds["h"] > 16_777_216
    ):
        raise ValueError("bounds exceed the maximum bounded context area")
    return bounds


def _bridge_url() -> str:
    return _normalize_loopback_url(
        os.environ.get("ML_INTERN_TLDRAW_BRIDGE_URL", DEFAULT_BRIDGE_URL)
    )


def _json_request(
    url: str, *, method: str = "GET", payload: dict[str, Any] | None = None
) -> dict[str, Any]:
    body = json.dumps(payload).encode() if payload is not None else None
    request = urllib.request.Request(
        url,
        data=body,
        method=method,
        headers={"Content-Type": "application/json"} if body else {},
    )
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            return json.loads(response.read().decode())
    except urllib.error.HTTPError as error:
        message = error.read().decode(errors="replace")
        raise RuntimeError(message or f"bridge returned HTTP {error.code}") from error


def _normalize_loopback_url(value: str) -> str:
    parsed = urllib.parse.urlparse(value)
    if parsed.scheme != "http" or parsed.hostname not in {
        "127.0.0.1",
        "localhost",
        "::1",
    }:
        raise ValueError("ML_INTERN_TLDRAW_BRIDGE_URL must be an HTTP loopback URL")
    return value.rstrip("/")
