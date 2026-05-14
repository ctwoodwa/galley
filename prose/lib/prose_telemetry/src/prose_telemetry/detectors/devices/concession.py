"""Concession detector — granting the opponent's point before pivoting.

The literary-devices catalog (E29): "Yes, X — and that is precisely
why Y." Models intellectual honesty and uses the granted point as a
launchpad.

Detection: a sentence opening with a concessive marker (Yes / True /
Granted / Indeed / Of course / Admittedly) followed by a pivot to
the speaker's actual claim. The pivot is typically marked by an
em-dash, "and that is", "but", "yet", "however", or "still" within
the same sentence (or first half of the next sentence).
"""

from __future__ import annotations

import re
from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.types import DetectorConfig, Finding
from prose_telemetry.detectors.devices._segment import (
    split_sentences_with_spans,
)


_CONCESSIVE_OPENER_RE = re.compile(
    r"^(?:Yes|True|Granted|Indeed|Of\s+course|Admittedly|Sure)[\s,—:]",
    re.IGNORECASE,
)

_PIVOT_RE = re.compile(
    r"(?:—|\s—\s|"
    r"\band\s+that\s+is\s+(?:precisely\s+)?why\b|"
    r"\bbut\b|\byet\b|\bhowever\b|\bstill\b|\bnonetheless\b)",
    re.IGNORECASE,
)


@register(
    name="concession",
    tier="stdlib",
    family="literary_device",
    description=(
        "Granting the opponent's point before pivoting (catalog E29). "
        "Sentence opens with a concessive marker (Yes / True / Granted / "
        "Indeed) and contains a pivot marker (em-dash / 'and that is' / "
        "but / yet / however)."
    ),
    metadata={"catalog_id": "E29"},
)
def detect_concession(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []

    findings: list[Finding] = []
    for sentence, start, end in split_sentences_with_spans(prose):
        opener = _CONCESSIVE_OPENER_RE.match(sentence)
        if not opener:
            continue
        pivot = _PIVOT_RE.search(sentence)
        if not pivot:
            continue
        findings.append(
            Finding(
                type="concession",
                confidence=0.75,
                rule_id="device:concession",
                span=(start, end),
                text=sentence,
                extra={
                    "family": "literary_device",
                    "catalog_id": "E29",
                    "opener": opener.group(0).rstrip("—,: "),
                    "pivot": pivot.group(0).strip(),
                },
            )
        )
    return findings
