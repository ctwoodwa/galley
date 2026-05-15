"""Statement-then-reversal — consecutive sentence pair with reversal marker.

Migrated from `prose_telemetry_handcount.py`. The narrator anti-pattern
where a substantive sentence is immediately pivoted by one starting
with `but / yet / however / from him / …`. Dialogue interiors are
excluded since conversational pivots are not narrator moves.
"""

from __future__ import annotations

import re
from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.text import is_dialogue, split_sentences, word_tokens
from prose_telemetry._common.types import DetectorConfig, Finding


_REVERSAL_MARKERS = re.compile(
    r"^\s*(but|yet|though|however|from him|from her|in his|in her|"
    r"the same|that is|the difference)\b",
    re.IGNORECASE,
)


@register(
    name="statement_then_reversal",
    tier="stdlib",
    family="literary_device",
    description="Sentence pair where the second opens with a reversal marker.",
)
def detect_statement_then_reversal(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []
    sents = split_sentences(prose)
    findings: list[Finding] = []
    for i in range(len(sents) - 1):
        first = sents[i]
        second = sents[i + 1].strip()
        if is_dialogue(first) or is_dialogue(second):
            continue
        m = _REVERSAL_MARKERS.match(second)
        if not m:
            continue
        if len(word_tokens(first)) < 6:
            continue
        findings.append(
            Finding(
                type="statement_then_reversal",
                confidence=0.7,
                rule_id="literary_device:statement_then_reversal.consecutive_pivot",
                extra={
                    "first": first,
                    "second": second,
                    "reversal_marker": m.group(1).lower(),
                },
            )
        )
    return findings
