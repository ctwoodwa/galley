"""Redundant-phrase filler — stock filler phrases that should be cut.

Strict exact-match. The default list ships in this module; per-book
yaml can append via `DetectorConfig.extra['additional_phrases']`.
"""

from __future__ import annotations

import re
from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.types import DetectorConfig, Finding


_DEFAULT_PHRASES = (
    "in order to",
    "the fact that",
    "for the first time",
    "needless to say",
    "it goes without saying",
    "at this point in time",
    "in the event that",
    "due to the fact that",
    "in spite of the fact that",
    "with regard to",
    "with respect to",
    "in terms of",
    "for all intents and purposes",
    "first and foremost",
    "last but not least",
    "each and every",
    "one and the same",
    "completely and utterly",
    "absolutely essential",
    "very unique",
    "totally complete",
    "end result",
    "past history",
    "future plans",
    "advance planning",
    "currently underway",
    "personal opinion",
)


@register(
    name="redundant_phrase",
    tier="stdlib",
    family="literary_device",
    description="Stock filler phrases (in order to, the fact that, …).",
)
def detect_redundant_phrases(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []
    phrases = tuple(_DEFAULT_PHRASES) + tuple(config.extra.get("additional_phrases", []))
    findings: list[Finding] = []
    for phrase in phrases:
        pat = re.compile(r"\b" + re.escape(phrase) + r"\b", re.IGNORECASE)
        for m in pat.finditer(prose):
            findings.append(
                Finding(
                    type="redundant_phrase",
                    confidence=1.0,
                    rule_id="literary_device:redundant_phrase.filler_match",
                    span=(m.start(), m.end()),
                    extra={"phrase": phrase},
                )
            )
    return findings
