"""Asyndeton — comma-separated list with no terminal conjunction.

Migrated from `prose_telemetry_handcount.py`. Heuristic: if a sentence
has `min_items - 1` or more commas and the tail clause (everything
after the last comma) does NOT start with `and / or / nor / but`, the
sentence is flagged as asyndeton. Confidence 0.6 — flag-not-prove.

Configurable threshold:
  - `min_items` (int, default 3) — minimum comma-separated items
    required before a sentence is considered for the asyndeton test.
"""

from __future__ import annotations

import re
from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.text import split_sentences
from prose_telemetry._common.types import DetectorConfig, Finding


_LEADING_CONJ_RE = re.compile(r"^(and|or|nor|but)\b", re.IGNORECASE)


@register(
    name="asyndeton",
    tier="stdlib",
    family="literary_device",
    description="Comma-separated list with no terminal conjunction.",
)
def detect_asyndeton(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []
    min_items = int(config.extra.get("min_items", 3))

    findings: list[Finding] = []
    for s in split_sentences(prose):
        if "," not in s:
            continue
        commas = s.count(",")
        tail = s.rstrip(".!?").rsplit(",", 1)[-1].strip()
        if commas >= (min_items - 1) and not _LEADING_CONJ_RE.match(tail):
            findings.append(
                Finding(
                    type="asyndeton",
                    confidence=0.6,
                    rule_id="literary_device:asyndeton.comma_run_no_conjunction",
                    extra={"commas": commas, "sentence": s},
                )
            )
    return findings
