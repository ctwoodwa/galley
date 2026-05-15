"""Direct address — narrator addressing the reader."""

from __future__ import annotations

import re
from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.types import DetectorConfig, Finding


_DIRECT_ADDRESS = re.compile(
    r"\b(dear reader|gentle reader|you must understand|"
    r"you may|you should know|you will see|let me|let us|trust me|"
    r"believe me|you can imagine|imagine|consider)\b",
    re.IGNORECASE,
)


@register(
    name="direct_address",
    tier="stdlib",
    family="literary_device",
    description="Narrator addressing the reader directly.",
)
def detect_direct_address(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []
    findings: list[Finding] = []
    for m in _DIRECT_ADDRESS.finditer(prose):
        # Skip inside dialogue — crude check via preceding-quote parity.
        context_start = max(0, m.start() - 200)
        context = prose[context_start:m.start()]
        if context.count('"') % 2 == 1:
            continue
        findings.append(
            Finding(
                type="direct_address",
                confidence=0.7,
                rule_id="literary_device:direct_address.reader_addressed",
                span=(m.start(), m.end()),
                extra={"phrase": m.group(0).lower()},
            )
        )
    return findings
