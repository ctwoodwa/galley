"""Expletive constructions — 'There is / It was' weak openers."""

from __future__ import annotations

import re
from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.text import is_dialogue, split_sentences
from prose_telemetry._common.types import DetectorConfig, Finding


_EXPLETIVE_START = re.compile(
    r"^(There\s+(?:is|are|was|were|will\s+be|has\s+been|have\s+been)|"
    r"It\s+(?:is|was|will\s+be|has\s+been|seemed|seems|appeared|appears))\b",
    re.IGNORECASE,
)


@register(
    name="expletive_construction",
    tier="stdlib",
    family="literary_device",
    description="Sentences starting with expletive 'there'/'it' constructions.",
)
def detect_expletive_constructions(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []
    findings: list[Finding] = []
    for s in split_sentences(prose):
        if is_dialogue(s):
            continue
        m = _EXPLETIVE_START.match(s.strip())
        if m:
            findings.append(
                Finding(
                    type="expletive_construction",
                    confidence=0.9,
                    rule_id="literary_device:expletive_construction.weak_opener",
                    extra={
                        "opener": m.group(0).lower(),
                        "sentence_start": s[:80],
                    },
                )
            )
    return findings
