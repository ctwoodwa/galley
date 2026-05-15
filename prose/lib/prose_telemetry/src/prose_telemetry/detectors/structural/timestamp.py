"""Timestamp density — HH:MM time stamps in narration."""

from __future__ import annotations

import re
from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.types import DetectorConfig, Finding


_TIMESTAMP_RE = re.compile(r"\b\d{1,2}:\d{2}\b")


@register(
    name="timestamp",
    tier="stdlib",
    family="literary_device",
    description="HH:MM time stamps in narration.",
)
def detect_timestamps(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []
    findings: list[Finding] = []
    for m in _TIMESTAMP_RE.finditer(prose):
        findings.append(
            Finding(
                type="timestamp",
                confidence=1.0,
                rule_id="literary_device:timestamp.hh_mm_match",
                span=(m.start(), m.end()),
                extra={"time": m.group(0)},
            )
        )
    return findings
