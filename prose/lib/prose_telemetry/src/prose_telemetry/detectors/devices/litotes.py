"""Litotes detector — understatement via double negative.

The literary-devices catalog (D21): "Conveys conviction via restraint.
'The result is not unimpressive' says *impressive* but signals *the
writer is not given to easy praise*."

Detection: the canonical `not un-<adjective>` surface form, plus a
small set of fixed phrases that match the same rhetorical move
("no small feat", "no mean achievement"). The `not un-X` regex
matches conservatively — only the prefix `un-` directly (not `in-`,
`im-`, `dis-` which are far more frequent in negative-polarity uses
that are not litotes).
"""

from __future__ import annotations

import re
from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.types import DetectorConfig, Finding


_LITOTES_RE = re.compile(
    r"(?:"
    r"\bnot\s+un[a-z]{3,}|"        # not un-X
    r"\bnot\s+(?:a|an)\s+(?:bad|small|minor|trivial|negligible|insignificant)\b|"
    r"\bno\s+(?:small|mean|little)\s+\w+|"
    r"\bnot\s+(?:negligible|insignificant|impossible|unlikely)\b"
    r")",
    re.IGNORECASE,
)


@register(
    name="litotes",
    tier="stdlib",
    family="literary_device",
    description=(
        "Understatement via double negative (catalog D21). 'Not "
        "unimpressive', 'no small feat'."
    ),
    metadata={"catalog_id": "D21"},
)
def detect_litotes(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []

    findings: list[Finding] = []
    for m in _LITOTES_RE.finditer(prose):
        findings.append(
            Finding(
                type="litotes",
                confidence=0.85,
                rule_id="device:litotes",
                span=(m.start(), m.end()),
                text=m.group(0),
                extra={
                    "family": "literary_device",
                    "catalog_id": "D21",
                },
            )
        )
    return findings
