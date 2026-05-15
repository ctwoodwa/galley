"""Abstract noun density — -tion / -ness / -ity / -ment / -ance suffixes."""

from __future__ import annotations

import re
from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.types import DetectorConfig, Finding


_ABSTRACT_SUFFIX = re.compile(
    r"\b[a-z]{3,}(?:tion|tions|ness|ity|ities|ment|ments|ance|ances|ence|ences)\b",
    re.IGNORECASE,
)
_BENIGN_TECHNICALS = {"three", "vacation", "destination", "stations"}


@register(
    name="abstract_noun",
    tier="stdlib",
    family="literary_device",
    description="Words ending in abstract-noun suffixes.",
)
def detect_abstract_nouns(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []
    findings: list[Finding] = []
    for m in _ABSTRACT_SUFFIX.finditer(prose):
        word = m.group(0).lower()
        if word in _BENIGN_TECHNICALS:
            continue
        findings.append(
            Finding(
                type="abstract_noun",
                confidence=0.7,
                rule_id="literary_device:abstract_noun.suffix_match",
                span=(m.start(), m.end()),
                extra={"word": word},
            )
        )
    return findings
