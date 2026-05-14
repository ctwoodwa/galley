"""Prolepsis detector — anticipating an objection.

The literary-devices catalog (E28): "Pre-empts the reader's pushback.
Disarms by demonstrating that the writer has thought one step further
than the reader." Detection: an objection-trigger phrase followed by
a negating reply within the same sentence-pair window.

Trigger phrases (the "voice of the imagined objector"):
  You might think · You may think · Some say · Some argue · One could
  argue · It might be argued · You might object · Critics charge

Negation pattern in the reply (within the next 2 sentences):
  It is not · That is not · This is not · Not so · Hardly ·
  Actually · In fact · On the contrary
"""

from __future__ import annotations

import re
from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.types import DetectorConfig, Finding
from prose_telemetry.detectors.devices._segment import (
    split_sentences_with_spans,
)


_OBJECTION_RE = re.compile(
    r"\b(?:"
    r"you\s+might\s+think|you\s+may\s+think|"
    r"some\s+(?:say|argue|claim|believe)|"
    r"one\s+(?:could|might)\s+(?:argue|object|say)|"
    r"it\s+might\s+be\s+argued|"
    r"you\s+might\s+object|"
    r"critics?\s+(?:charge|argue|claim)"
    r")\b",
    re.IGNORECASE,
)

_REPLY_RE = re.compile(
    r"\b(?:"
    r"it\s+is\s+not|that\s+is\s+not|this\s+is\s+not|"
    r"not\s+so\b|hardly\b|"
    r"actually\b|in\s+fact\b|on\s+the\s+contrary"
    r")\b",
    re.IGNORECASE,
)

_DEFAULT_LOOKAHEAD = 2


@register(
    name="prolepsis",
    tier="stdlib",
    family="literary_device",
    description=(
        "Anticipating an objection (catalog E28). Objection-trigger "
        "phrase followed by a negating reply within the next "
        "1–2 sentences."
    ),
    metadata={
        "lookahead_default": _DEFAULT_LOOKAHEAD,
        "catalog_id": "E28",
    },
)
def detect_prolepsis(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []

    lookahead = int(config.extra.get("lookahead", _DEFAULT_LOOKAHEAD))
    sentences = split_sentences_with_spans(prose)
    findings: list[Finding] = []

    for i, (sentence, start, _end) in enumerate(sentences):
        m = _OBJECTION_RE.search(sentence)
        if not m:
            continue
        # Look in the same sentence and up to `lookahead` following
        # sentences for the negating reply.
        window_sentences = sentences[i : i + 1 + lookahead]
        reply_match = None
        reply_sentence = None
        for s, _ss, _se in window_sentences:
            r = _REPLY_RE.search(s)
            if r:
                reply_match = r
                reply_sentence = s
                break
        if reply_match is None:
            continue
        window_end = window_sentences[-1][2]
        findings.append(
            Finding(
                type="prolepsis",
                confidence=0.8,
                rule_id="device:prolepsis",
                span=(start, window_end),
                text=prose[start:window_end],
                extra={
                    "family": "literary_device",
                    "catalog_id": "E28",
                    "objection_phrase": m.group(0),
                    "reply_phrase": reply_match.group(0),
                    "reply_sentence": reply_sentence,
                },
            )
        )
    return findings
