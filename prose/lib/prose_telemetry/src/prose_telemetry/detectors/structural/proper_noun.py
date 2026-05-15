"""Proper-noun density — mid-sentence capitalized words."""

from __future__ import annotations

import re
from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.types import DetectorConfig, Finding


_PROPER_NOUN_RE = re.compile(r"(?<![.!?]\s)(?<!^)\b([A-Z][a-z]{2,})\b")
_FUNCTION_CAPITALS = {
    "The", "A", "An", "I", "It", "He", "She", "We", "They", "You",
    "But", "And", "So",
}


@register(
    name="proper_noun",
    tier="stdlib",
    family="literary_device",
    description="Mid-sentence capitalized words as proper-noun heuristic.",
)
def detect_proper_nouns(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []
    findings: list[Finding] = []
    for m in _PROPER_NOUN_RE.finditer(prose):
        word = m.group(1)
        if word in _FUNCTION_CAPITALS:
            continue
        findings.append(
            Finding(
                type="proper_noun",
                confidence=0.7,
                rule_id="literary_device:proper_noun.mid_sentence_capitalized",
                span=(m.start(), m.end()),
                extra={"word": word},
            )
        )
    return findings
