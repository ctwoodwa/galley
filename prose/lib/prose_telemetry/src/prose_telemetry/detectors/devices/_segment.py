"""Shared sentence-segmentation helpers for the devices detector pack.

Returns sentences with absolute character spans into the source prose
so detectors can emit `Finding.span` correctly. Dialogue heuristic
matches the existing handcount `_is_dialogue` shape so detectors that
should ignore dialogue (erotema, hypophora) stay consistent with the
rest of the pipeline.
"""

from __future__ import annotations

import re


_SENTENCE_END = re.compile(r"(?<=[.!?])\s+(?=[A-Z\"“'(*])")

_QUOTE_OPENERS = ('"', "“", "‘", "'")
_QUOTE_CLOSERS = ('"', "”", "’", "'")
_TRAILING_PUNCT = ".?!,;:"


def split_sentences_with_spans(prose: str) -> list[tuple[str, int, int]]:
    """Return (sentence_text, start_char, end_char) tuples for each
    sentence in `prose`. Whitespace at boundaries is excluded from
    spans. Empty sentences are skipped."""
    out: list[tuple[str, int, int]] = []
    pos = 0
    for match in _SENTENCE_END.finditer(prose):
        end = match.start()
        sentence = prose[pos:end].strip()
        if sentence:
            offset = prose.find(sentence, pos)
            out.append((sentence, offset, offset + len(sentence)))
        pos = match.end()
    if pos < len(prose):
        sentence = prose[pos:].strip()
        if sentence:
            offset = prose.find(sentence, pos)
            out.append((sentence, offset, offset + len(sentence)))
    return out


def is_dialogue_sentence(s: str) -> bool:
    """Match the legacy handcount `_is_dialogue` heuristic: a sentence
    is dialogue iff it opens with a quote, or its content (stripped
    of trailing punctuation) ends with a quote."""
    s = s.strip()
    if not s:
        return False
    if s.startswith(_QUOTE_OPENERS):
        return True
    tail = s
    while tail and tail[-1] in _TRAILING_PUNCT:
        tail = tail[:-1].rstrip()
    return tail.endswith(_QUOTE_CLOSERS) if tail else False


_WORD_RE = re.compile(r"\b[A-Za-z][A-Za-z'’-]*\b")


def tokenize_words(text: str) -> list[str]:
    """Return ordered list of bare word tokens (no punctuation)."""
    return _WORD_RE.findall(text)


def last_n_words(text: str, n: int) -> tuple[str, ...]:
    """Return the last `n` words of `text` as a lowercase tuple, or an
    empty tuple if the text has fewer than `n` words."""
    words = tokenize_words(text)
    if len(words) < n:
        return ()
    return tuple(w.lower() for w in words[-n:])


def first_n_words(text: str, n: int) -> tuple[str, ...]:
    """Return the first `n` words of `text` as a lowercase tuple, or
    an empty tuple if the text has fewer than `n` words."""
    words = tokenize_words(text)
    if len(words) < n:
        return ()
    return tuple(w.lower() for w in words[:n])
