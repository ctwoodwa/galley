"""Climax / auxesis detector — ascending order of importance in a list.

The literary-devices catalog (D27): "Orders a list so each item is
heavier than the last. The reader's attention compounds; the final
item lands hardest."

Detection: identify "X, Y, and Z" lists where item word-count is
monotonically non-decreasing AND the last item is meaningfully longer
than the first (≥ 1.5×). This captures the ascending-rhythm signature
without needing to score "importance" semantically.

Confidence is moderate (0.65) because true climax depends on semantic
weight; word-count is only a proxy. The detector flags candidates.
"""

from __future__ import annotations

import re
from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.types import DetectorConfig, Finding


_LIST_RE = re.compile(
    r"([A-Za-z][^,;.!?]{1,80}),\s+([^,;.!?]{1,80}),\s+(?:and|or)\s+([^,;.!?]{1,150}?)(?=[.!?,;]|$)",
    re.IGNORECASE,
)

_DEFAULT_MIN_LAST_TO_FIRST_RATIO = 1.5


def _word_count(text: str) -> int:
    return len(re.findall(r"\b\w+\b", text))


@register(
    name="climax",
    tier="stdlib",
    family="literary_device",
    description=(
        "Ascending-length three-item list (catalog D27). Surface "
        "heuristic: word-count proxy for ascending importance."
    ),
    metadata={
        "min_last_to_first_ratio_default": _DEFAULT_MIN_LAST_TO_FIRST_RATIO,
        "catalog_id": "D27",
    },
)
def detect_climax(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []

    min_ratio = float(
        config.extra.get(
            "min_last_to_first_ratio", _DEFAULT_MIN_LAST_TO_FIRST_RATIO
        )
    )

    findings: list[Finding] = []
    for m in _LIST_RE.finditer(prose):
        items = [m.group(1).strip(), m.group(2).strip(), m.group(3).strip()]
        counts = [_word_count(item) for item in items]
        if 0 in counts:
            continue
        # Monotonic non-decreasing, with strict increase last-vs-first.
        if not (counts[0] <= counts[1] <= counts[2]):
            continue
        if counts[2] / counts[0] < min_ratio:
            continue
        findings.append(
            Finding(
                type="climax",
                confidence=0.65,
                rule_id="device:climax",
                span=(m.start(), m.end()),
                text=m.group(0),
                extra={
                    "family": "literary_device",
                    "catalog_id": "D27",
                    "items": items,
                    "word_counts": counts,
                    "last_to_first_ratio": round(counts[2] / counts[0], 2),
                },
            )
        )
    return findings
