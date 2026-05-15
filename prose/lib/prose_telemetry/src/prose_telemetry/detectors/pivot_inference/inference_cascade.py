"""Inference cascade — 'which <verb>' triple inside one sentence.

Migrated from `prose_telemetry_handcount.py`. Three-or-more clauses
opening with the same `which <verb>` connector within a single
sentence. The signature Bobiverse cascading-inference move:
intentional once, audibly looping at three.

The single-word `internal_anaphora` detector excludes `which` as a
function-word start to avoid false-positives on inventory lists; this
detector catches the specific cascading pattern that exclusion lets
through.
"""

from __future__ import annotations

import re
from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.types import DetectorConfig, Finding


_INFERENCE_CASCADE = re.compile(
    r"\bwhich\s+(meant|was|were|made|gave|put|left|brought|caused|forced|"
    r"allowed|kept|told|showed|sent|carried|placed|set|fixed|knew|did|"
    r"is|has|had|would)\b[^.!?]{1,120}?"
    r"\bwhich\s+\1\b[^.!?]{1,120}?"
    r"\bwhich\s+\1\b",
    re.IGNORECASE,
)


@register(
    name="inference_cascade",
    tier="stdlib",
    family="literary_device",
    description="Three-or-more 'which <verb>' clause openers in one sentence.",
)
def detect_inference_cascade(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []
    findings: list[Finding] = []
    for m in _INFERENCE_CASCADE.finditer(prose):
        match_text = m.group(0)
        findings.append(
            Finding(
                type="inference_cascade",
                confidence=0.9,
                rule_id="literary_device:inference_cascade.which_verb_triple",
                span=(m.start(), m.end()),
                text=match_text[:200] + ("..." if len(match_text) > 200 else ""),
                extra={"connector": f"which {m.group(1).lower()}"},
            )
        )
    return findings
