"""Lightweight sentence + token helpers for registry-tier detectors.

Mirrors the splitter / tokenizer that lived in the book repo's
`prose_telemetry_handcount.py` so detectors migrated out of handcount
into the galley/prose registry produce identical counts. When the
spaCy doc is available the dispatch passes it through; detectors that
prefer doc.sents over the regex splitter can opt in by checking
`doc is not None`.

These helpers are intentionally minimal — no markdown stripping, no
held-lines reconciliation. Higher layers (cli.py / `_strip_to_prose`)
handle markdown chrome before the prose reaches detectors.
"""

from __future__ import annotations

import re


# Sentence boundary regex. Matches `[.!?]` followed by whitespace + an
# uppercase letter or opening quote/paren. Approximate; misses some
# edge cases (Mr./Dr. abbreviations followed by Names, etc.) — same
# trade-off the handcount script accepts.
_SENT_BOUNDARY = re.compile(r"(?<=[.!?])\s+(?=[A-Z\"“\(*])")


def split_sentences(prose: str) -> list[str]:
    """Split `prose` into a list of sentence-shaped strings.

    Whitespace is collapsed to a single space first so that hard line
    breaks inside paragraphs don't fool the boundary regex. Empty
    results are filtered.
    """
    flat = re.sub(r"\s+", " ", prose).strip()
    if not flat:
        return []
    raw = _SENT_BOUNDARY.split(flat)
    return [s.strip() for s in raw if s.strip()]


def word_tokens(text: str) -> list[str]:
    """Unicode-aware word tokenization. Handles 'Tomás', 'Wanjiru',
    'café' and similar diacritic-bearing words as single tokens.
    Mirrors the handcount script's `tokens()` so detectors migrated
    from there produce identical counts."""
    return re.findall(r"[^\W\d_]+(?:[''’-][^\W\d_]+)*", text, re.UNICODE)


def is_dialogue(sentence: str) -> bool:
    """Heuristic: a sentence is dialogue if it begins or ends with a
    quote character (ASCII, curly, or paired). Used by narrator-only
    detectors (statement_then_reversal, rhetorical questions, …) to
    exclude conversational pivots that aren't narrator anti-patterns."""
    s = sentence.strip()
    if not s:
        return False
    return s[0] in ('"', '“', '”') or s[-1] in ('"', '“', '”')
