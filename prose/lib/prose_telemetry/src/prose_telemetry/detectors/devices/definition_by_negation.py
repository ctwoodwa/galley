"""Definition-by-negation detector — what something is *not*.

The literary-devices catalog (E32): "Brackets the concept by walking
the reader through nearby ideas and rejecting them. The remainder is
the definition."

Detection: a run of 2+ consecutive sentences using `is not` /
`is no` / `does not` / negation phrasing, optionally followed by an
affirming sentence that uses `is` / `means` / `is the` without
negation (the positive definition).

The pattern is fairly distinctive when present and rare enough by
coincidence to keep the false-positive rate low. Confidence is set
at 0.8.
"""

from __future__ import annotations

import re
from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.types import DetectorConfig, Finding
from prose_telemetry.detectors.devices._segment import (
    split_sentences_with_spans,
)


# Match the negation marker at or near the start of a sentence.
_NEGATION_RE = re.compile(
    r"^\s*(?:[A-Z][a-z'\"’-]*\s+)?(?:is|are|was|were|does|do|did)\s+not\b",
    re.IGNORECASE,
)
# An affirming sentence: starts with subject + linking verb, no `not`.
_AFFIRM_RE = re.compile(
    r"^\s*[A-Z][a-zA-Z'\"’-]*\s+(?:is|are|means|is\s+the)\s+(?!not\b)",
    re.IGNORECASE,
)

_DEFAULT_MIN_NEGATIONS = 2


@register(
    name="definition_by_negation",
    tier="stdlib",
    family="literary_device",
    description=(
        "Definition by negation (catalog E32). Run of 2+ consecutive "
        "negating sentences, optionally followed by an affirming "
        "definition sentence."
    ),
    metadata={
        "min_negations_default": _DEFAULT_MIN_NEGATIONS,
        "catalog_id": "E32",
    },
)
def detect_definition_by_negation(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []

    min_neg = int(config.extra.get("min_negations", _DEFAULT_MIN_NEGATIONS))
    sentences = split_sentences_with_spans(prose)
    findings: list[Finding] = []
    i = 0
    n = len(sentences)
    while i < n:
        # Look for a run of consecutive negating sentences.
        run_start = i
        while i < n and _NEGATION_RE.match(sentences[i][0]):
            i += 1
        run_len = i - run_start
        if run_len >= min_neg:
            run_first = sentences[run_start]
            run_last = sentences[i - 1]
            # Optionally include the affirming sentence that follows.
            affirm = None
            if i < n and _AFFIRM_RE.match(sentences[i][0]):
                affirm = sentences[i]
                final_end = affirm[2]
                i += 1
            else:
                final_end = run_last[2]
            findings.append(
                Finding(
                    type="definition_by_negation",
                    confidence=0.8,
                    rule_id="device:definition_by_negation",
                    span=(run_first[1], final_end),
                    text=prose[run_first[1] : final_end],
                    extra={
                        "family": "literary_device",
                        "catalog_id": "E32",
                        "negation_run_length": run_len,
                        "has_affirming_close": affirm is not None,
                    },
                )
            )
        else:
            i += 1
    return findings
