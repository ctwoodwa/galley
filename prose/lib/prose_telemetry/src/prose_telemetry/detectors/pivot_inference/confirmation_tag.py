"""Confirmation tag — sentence-final ', which <pronoun> <aux>' echo."""

from __future__ import annotations

import re
from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.types import DetectorConfig, Finding


_CONFIRMATION_TAG_RE = re.compile(
    r",\s*which\s+(I|he|she|it|they|we|you)\s+"
    r"(was|were|is|are|did|do|had|have|has)"
    r"(?:\s+(?:not|n't))?"
    r"(?:\s+\w{2,7})?\s*\.",
    re.IGNORECASE,
)


@register(
    name="confirmation_tag",
    tier="stdlib",
    family="literary_device",
    description="Sentence-final ', which <pronoun> <aux>' confirmation tags.",
)
def detect_confirmation_tag(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []
    findings: list[Finding] = []
    for m in _CONFIRMATION_TAG_RE.finditer(prose):
        findings.append(
            Finding(
                type="confirmation_tag",
                confidence=0.9,
                rule_id="literary_device:confirmation_tag.which_pronoun_aux_period",
                span=(m.start(), m.end()),
                text=m.group(0).strip(),
                extra={
                    "pronoun": m.group(1).lower(),
                    "auxiliary": m.group(2).lower(),
                },
            )
        )
    return findings
