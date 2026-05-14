"""Fragmented-header detector (anti-AI tell #29).

A heading followed by a one-line paragraph that restates the heading
before the real content begins. Adds nothing; reads as filler; breaks
the rhythm of opening directly into substance.

Detection: a heading block immediately followed by a paragraph block
where the paragraph's first sentence shares ≥ 50% of its content
words with the heading's words AND the paragraph's first sentence is
short (≤ 12 words).
"""

from __future__ import annotations

import re
from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.types import DetectorConfig, Finding
from prose_telemetry.markdown_ast import parse_blocks


_WORD_RE = re.compile(r"\b[A-Za-z][A-Za-z'-]*\b")
_SENTENCE_END_RE = re.compile(r"[.!?]")

_DEFAULT_MIN_OVERLAP = 0.5
_DEFAULT_MAX_FIRST_SENTENCE_WORDS = 12

# Function words / stopwords excluded from the overlap calculation.
_OVERLAP_STOPWORDS = frozenset({
    "a", "an", "the", "and", "or", "of", "in", "on", "at", "to", "for",
    "with", "by", "from", "as", "is", "are", "was", "were", "be", "been",
    "being", "have", "has", "had", "do", "does", "did", "this", "that",
    "these", "those", "it", "its", "they", "them", "their", "we", "our",
    "you", "your", "i", "me", "my", "he", "she", "him", "her", "his",
    "would", "could", "should", "may", "might", "can", "will",
    "not", "no", "so", "if", "but", "than", "then", "when", "where",
    "what", "which", "who",
})


def _content_words(text: str) -> set[str]:
    return {
        w.lower()
        for w in _WORD_RE.findall(text)
        if w.lower() not in _OVERLAP_STOPWORDS and len(w) >= 3
    }


def _first_sentence(paragraph: str) -> str:
    end = _SENTENCE_END_RE.search(paragraph)
    if end:
        return paragraph[: end.end()]
    return paragraph


@register(
    name="fragmented_headers",
    tier="structural",
    family="anti_ai",
    description=(
        "Markdown heading followed immediately by a short paragraph "
        "that restates the heading's words (anti-AI #29)."
    ),
    metadata={
        "min_overlap_default": _DEFAULT_MIN_OVERLAP,
        "max_first_sentence_words_default": _DEFAULT_MAX_FIRST_SENTENCE_WORDS,
        "anti_ai_id": "#29",
    },
)
def detect_fragmented_headers(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []

    min_overlap = float(config.extra.get("min_overlap", _DEFAULT_MIN_OVERLAP))
    max_words = int(
        config.extra.get(
            "max_first_sentence_words", _DEFAULT_MAX_FIRST_SENTENCE_WORDS
        )
    )

    blocks = parse_blocks(prose)
    findings: list[Finding] = []
    for i, block in enumerate(blocks):
        if block.kind != "heading":
            continue
        if i + 1 >= len(blocks):
            continue
        nxt = blocks[i + 1]
        if nxt.kind != "paragraph":
            continue
        first_sent = _first_sentence(nxt.content)
        first_sent_words = _WORD_RE.findall(first_sent)
        if len(first_sent_words) > max_words:
            continue

        heading_words = _content_words(block.content)
        para_words = _content_words(first_sent)
        if not heading_words or not para_words:
            continue
        overlap = heading_words & para_words
        ratio = len(overlap) / max(len(heading_words), 1)
        if ratio >= min_overlap:
            findings.append(
                Finding(
                    type="fragmented_header",
                    confidence=0.85,
                    rule_id="structural:fragmented_header",
                    span=None,
                    text=f"{block.content}\n{first_sent}",
                    extra={
                        "family": "anti_ai",
                        "anti_ai_id": "#29",
                        "heading": block.content,
                        "restating_sentence": first_sent,
                        "overlap_ratio": round(ratio, 3),
                        "overlap_words": sorted(overlap),
                        "heading_line": block.line_range[0],
                    },
                )
            )
    return findings
