"""Conjunctive adverbs — formal academic-register linkers."""

from __future__ import annotations

import re
from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.types import DetectorConfig, Finding


_CONJUNCTIVE_ADVERB = re.compile(
    r"\b(however|therefore|moreover|furthermore|nevertheless|nonetheless|"
    r"consequently|accordingly|hence|thus|indeed|otherwise|likewise|"
    r"similarly|conversely)\b",
    re.IGNORECASE,
)


@register(
    name="conjunctive_adverb",
    tier="stdlib",
    family="literary_device",
    description="Formal conjunctive adverbs (academic register marker).",
)
def detect_conjunctive_adverbs(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []
    findings: list[Finding] = []
    for m in _CONJUNCTIVE_ADVERB.finditer(prose):
        findings.append(
            Finding(
                type="conjunctive_adverb",
                confidence=1.0,
                rule_id="literary_device:conjunctive_adverb.academic_register",
                span=(m.start(), m.end()),
                extra={"word": m.group(1).lower()},
            )
        )
    return findings
