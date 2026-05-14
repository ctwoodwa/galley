"""Self-referential-frame detector — staff-history meta-phrases.

Catches phrases that frame the narrator as the author of a record
("I am writing this here," "for the record," "in this account"). In
Anna's voice these are the staff-history meta-frame the legacy
handcount script gated at one occurrence per chapter; other books may
not use the device at all or may use a different list of frames.

Config source: `BookProfile.detectors.self_referential_frame.self_referential_frames`
— list of exact phrases. Empty list → zero findings.
"""

from __future__ import annotations

import re
from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.types import DetectorConfig, Finding


def _compile_pattern(phrases: list[str]) -> re.Pattern[str] | None:
    if not phrases:
        return None
    alternation = "|".join(re.escape(p) for p in phrases)
    return re.compile(rf"\b({alternation})\b", re.IGNORECASE)


@register(
    name="self_referential_frame",
    tier="stdlib",
    family="voice",
    description=(
        "Staff-history meta-frame phrases ('I am writing this here', "
        "'for the record'). Phrase list from the book's profile under "
        "detectors.self_referential_frame.self_referential_frames."
    ),
    metadata={
        "config_source": (
            "BookProfile.detectors.self_referential_frame.self_referential_frames"
        )
    },
)
def detect_self_referential_frame(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []

    pattern = _compile_pattern(list(config.self_referential_frames))
    if pattern is None:
        return []

    findings: list[Finding] = []
    for m in pattern.finditer(prose):
        findings.append(
            Finding(
                type="self_referential_frame",
                confidence=1.0,
                rule_id="voice:self_referential_frame",
                span=(m.start(), m.end()),
                text=m.group(0),
                extra={
                    "family": "voice",
                    "phrase": m.group(1).lower(),
                },
            )
        )
    return findings
