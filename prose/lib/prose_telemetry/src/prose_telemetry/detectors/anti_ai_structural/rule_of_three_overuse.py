"""Rule-of-three overuse detector (anti-AI tell #10).

Three-item lists are often *correct* — tricolons used for intentional
rhetorical force are welcome. The tell is when *every* enumerative
list in a paragraph (or in close succession) is exactly three items.

Detection: within a paragraph, count "X, Y, and Z" three-item lists
versus total comma-separated enumerations. Flag paragraphs where
≥ N consecutive three-item lists appear (default N=2) — the
mechanical-AI pattern, not the occasional rhetorical choice.
"""

from __future__ import annotations

import re
from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.types import DetectorConfig, Finding


# Match a three-item list: "<phrase>, <phrase>, and <phrase>" or
# "<phrase>, <phrase>, or <phrase>". Items are content phrases not
# containing semicolons or sentence-end punctuation.
_THREE_ITEM_RE = re.compile(
    r"([A-Za-z][^,;.!?]{1,40}),\s+([^,;.!?]{1,40}),\s+(?:and|or)\s+([^,;.!?]{1,60}?)(?=[.!?,;]|$)",
    re.IGNORECASE,
)


_DEFAULT_MIN_CONSECUTIVE = 2


@register(
    name="rule_of_three_overuse",
    tier="structural",
    family="anti_ai",
    description=(
        "Paragraphs where 2+ three-item lists appear in close "
        "succession (anti-AI #10). Tricolons used once for rhetorical "
        "force are not flagged; the mechanical-AI pattern is."
    ),
    metadata={
        "min_consecutive_default": _DEFAULT_MIN_CONSECUTIVE,
        "anti_ai_id": "#10",
    },
)
def detect_rule_of_three_overuse(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []

    min_n = int(
        config.extra.get("min_consecutive", _DEFAULT_MIN_CONSECUTIVE)
    )

    findings: list[Finding] = []
    offset = 0
    for para in prose.split("\n\n"):
        para_stripped = para.strip()
        if not para_stripped:
            offset = prose.find("\n\n", offset)
            offset = offset + 2 if offset >= 0 else len(prose)
            continue
        para_start = prose.find(para_stripped, offset)
        offset = para_start + len(para_stripped)
        matches = list(_THREE_ITEM_RE.finditer(para_stripped))
        if len(matches) >= min_n:
            findings.append(
                Finding(
                    type="rule_of_three_overuse",
                    confidence=0.75,
                    rule_id="structural:rule_of_three_overuse",
                    span=(para_start, para_start + len(para_stripped)),
                    text=para_stripped,
                    extra={
                        "family": "anti_ai",
                        "anti_ai_id": "#10",
                        "three_item_list_count": len(matches),
                        "first_few_lists": [
                            (m.group(1).strip(), m.group(2).strip(), m.group(3).strip())
                            for m in matches[:3]
                        ],
                    },
                )
            )
    return findings
