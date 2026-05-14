"""False-range detector (anti-AI tell #12).

A "from X to Y" construction where X and Y are not on a meaningful
scale — they are just two examples of a category. The pattern is a
common AI-prose tell: "from CRDTs to compliance, from key management
to UX patterns."

Detection: matches the surface "from X to Y" form. High-precision
heuristic to suppress real ranges (numerical, dated, alphabetical):
flag only when X and Y are both word-content (no digits, no months,
no a-z ordinals).
"""

from __future__ import annotations

import re
from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.types import DetectorConfig, Finding


# Match "from X to Y" where both X and Y are short phrases of content
# words (no digits, no obvious range markers).
_RANGE_RE = re.compile(
    r"\bfrom\s+([A-Za-z][A-Za-z\s\-]{1,30}?)\s+to\s+([A-Za-z][A-Za-z\s\-]{1,30}?)(?=[.,;:!?]|\s+(?:and|or|from)\b|$)",
    re.IGNORECASE,
)

# Numeric / date / ordinal / time markers — if X or Y matches these,
# it's a real range and we don't flag.
_REAL_RANGE_HINTS = re.compile(
    r"\b(?:\d|january|february|march|april|may|june|july|august|"
    r"september|october|november|december|jan|feb|mar|apr|jun|jul|"
    r"aug|sep|sept|oct|nov|dec|monday|tuesday|wednesday|thursday|"
    r"friday|saturday|sunday|am|pm|"
    r"morning|afternoon|evening|noon|midnight)\b",
    re.IGNORECASE,
)


@register(
    name="false_ranges",
    tier="structural",
    family="anti_ai",
    description=(
        "'from X to Y' where X and Y are not on a meaningful scale "
        "(anti-AI #12). Surface heuristic; real numerical/temporal "
        "ranges are excluded."
    ),
    metadata={"anti_ai_id": "#12"},
)
def detect_false_ranges(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []

    findings: list[Finding] = []
    for m in _RANGE_RE.finditer(prose):
        x = m.group(1).strip()
        y = m.group(2).strip()
        if _REAL_RANGE_HINTS.search(x) or _REAL_RANGE_HINTS.search(y):
            continue
        # Skip when X and Y look identical (probably a different idiom).
        if x.lower() == y.lower():
            continue
        findings.append(
            Finding(
                type="false_range",
                confidence=0.7,
                rule_id="structural:false_range",
                span=(m.start(), m.end()),
                text=m.group(0),
                extra={
                    "family": "anti_ai",
                    "anti_ai_id": "#12",
                    "x": x,
                    "y": y,
                },
            )
        )
    return findings
