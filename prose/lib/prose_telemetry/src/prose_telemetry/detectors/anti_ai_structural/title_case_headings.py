"""Title-case heading detector (anti-AI tell #17).

Headings written in Title Case (every Major Word Capitalized) where
the house style is sentence case. A common LLM default; the book repo
explicitly prefers sentence case for all H2/H3/H4 headings.

Detection: each markdown heading block is parsed; the proportion of
its words that are Capitalized (initial-letter-uppercase, length > 3,
not in the small-word stopword list) is measured. A heading flagged
when that proportion is ≥ 0.7 AND the heading has ≥ 3 words.
"""

from __future__ import annotations

import re
from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.types import DetectorConfig, Finding
from prose_telemetry.markdown_ast import parse_blocks


# Common short words in titles that may stay lowercase even in Title
# Case (Chicago / AP convention). Excluded from the cap-ratio count.
_TITLE_CASE_STOPWORDS = frozenset({
    "a", "an", "the", "and", "but", "or", "for", "nor", "yet", "so",
    "at", "by", "in", "of", "off", "on", "out", "to", "up", "via",
    "as", "is", "are", "if", "than", "with",
})

_WORD_RE = re.compile(r"\b[A-Za-z][A-Za-z'-]*\b")

_DEFAULT_MIN_RATIO = 0.7
_DEFAULT_MIN_WORDS = 3


def _title_case_ratio(heading_text: str) -> tuple[float, int]:
    words = _WORD_RE.findall(heading_text)
    countable = [w for w in words if w.lower() not in _TITLE_CASE_STOPWORDS]
    if not countable:
        return 0.0, len(words)
    capitalized = sum(1 for w in countable if w[0].isupper())
    return capitalized / len(countable), len(words)


@register(
    name="title_case_headings",
    tier="structural",
    family="anti_ai",
    description=(
        "Markdown headings written in Title Case (anti-AI #17). House "
        "style prefers sentence case for H2/H3/H4."
    ),
    metadata={
        "min_ratio_default": _DEFAULT_MIN_RATIO,
        "min_words_default": _DEFAULT_MIN_WORDS,
        "anti_ai_id": "#17",
    },
)
def detect_title_case_headings(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []

    min_ratio = float(config.extra.get("min_ratio", _DEFAULT_MIN_RATIO))
    min_words = int(config.extra.get("min_words", _DEFAULT_MIN_WORDS))

    findings: list[Finding] = []
    blocks = parse_blocks(prose)
    for block in blocks:
        if block.kind != "heading":
            continue
        if block.level == 1:
            # H1 is the chapter title; house style allows Title Case there.
            continue
        ratio, word_count = _title_case_ratio(block.content)
        if word_count < min_words:
            continue
        if ratio >= min_ratio:
            findings.append(
                Finding(
                    type="title_case_heading",
                    confidence=0.85,
                    rule_id="structural:title_case_heading",
                    span=None,
                    text=block.content,
                    extra={
                        "family": "anti_ai",
                        "anti_ai_id": "#17",
                        "heading_level": block.level,
                        "capitalized_ratio": round(ratio, 3),
                        "line": block.line_range[0],
                    },
                )
            )
    return findings
