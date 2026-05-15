"""Polysyndeton — 3+ 'and'/'or' within one sentence.

Migrated from `prose_telemetry_handcount.py`.

Configurable threshold:
  - `min_conjunctions` (int, default 3) — minimum total occurrences of
    `and` + `or` in one sentence to flag it.
"""

from __future__ import annotations

import re
from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.text import split_sentences
from prose_telemetry._common.types import DetectorConfig, Finding


_AND_RE = re.compile(r"\band\b", re.IGNORECASE)
_OR_RE = re.compile(r"\bor\b", re.IGNORECASE)


@register(
    name="polysyndeton",
    tier="stdlib",
    family="literary_device",
    description="3+ 'and'/'or' within one sentence.",
)
def detect_polysyndeton(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []
    min_conjunctions = int(config.extra.get("min_conjunctions", 3))

    findings: list[Finding] = []
    for s in split_sentences(prose):
        ands = len(_AND_RE.findall(s))
        ors = len(_OR_RE.findall(s))
        total = ands + ors
        if total >= min_conjunctions:
            findings.append(
                Finding(
                    type="polysyndeton",
                    confidence=0.8,
                    rule_id="literary_device:polysyndeton.conjunction_density",
                    extra={
                        "and_count": ands,
                        "or_count": ors,
                        "sentence": s,
                    },
                )
            )
    return findings
