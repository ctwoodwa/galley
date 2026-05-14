"""Phoneme helpers for the sonics detector pack.

Wraps the `pronouncing` library (BSD-2; CMU dict is public domain) for
phoneme lookups. Pure stdlib elsewhere. Per-word lookups are cached
with `functools.lru_cache` since the CMU dict is read repeatedly across
detector runs.

ARPAbet notes:
- Vowel phonemes carry a stress marker: `AA0`, `AA1`, `AA2`
  (0=unstressed, 1=primary, 2=secondary).
- Consonants have no stress: `B`, `CH`, `D`, `DH`, `F`, ...
- Helper `strip_stress()` removes the digit suffix from a phoneme.
- Helper `is_vowel_phoneme()` returns True iff the phoneme starts with
  an ARPAbet vowel symbol.
"""

from __future__ import annotations

import functools
import re
from typing import Final

import pronouncing


# ─── Constants ─────────────────────────────────────────────────────────────

# ARPAbet vowel phoneme set (without stress digits).
_VOWELS: Final[frozenset[str]] = frozenset(
    {"AA", "AE", "AH", "AO", "AW", "AY", "EH", "ER", "EY", "IH", "IY",
     "OW", "OY", "UH", "UW"}
)

# Function words / pronouns / very common short words that should not
# anchor sonic-device detection (they would cause false alliteration runs
# like "the the the").
SONIC_STOPWORDS: Final[frozenset[str]] = frozenset({
    "a", "an", "and", "the", "or", "but", "of", "to", "in", "on", "at",
    "for", "with", "by", "from", "as", "is", "are", "was", "were", "be",
    "been", "being", "have", "has", "had", "do", "does", "did", "will",
    "would", "could", "should", "may", "might", "can",
    "i", "you", "he", "she", "it", "we", "they",
    "me", "him", "us", "them", "my", "your", "his", "her", "its", "our",
    "their", "this", "that", "these", "those",
    "so", "if", "than", "then", "when", "where", "who", "what", "which",
    "while", "until", "before", "after", "during",
    "not", "no", "yes", "very", "just", "also", "too", "again", "still",
    "ever", "never", "always", "often", "sometimes",
    "into", "onto", "upon", "off", "out", "up", "down", "over", "under",
    "through", "across", "around", "between", "among",
    "such", "even", "only", "both", "all", "each", "every", "any", "some",
})

# Strip stress digit from a vowel phoneme: 'AA1' -> 'AA'.
_STRESS_RE = re.compile(r"[012]$")

# Word-boundary tokenizer (ASCII-only; book repo's prose is English).
_WORD_RE = re.compile(r"\b[A-Za-z][A-Za-z'’]*\b")


# ─── Public helpers ────────────────────────────────────────────────────────


def strip_stress(phoneme: str) -> str:
    """Remove the trailing stress digit from a vowel phoneme."""
    return _STRESS_RE.sub("", phoneme)


def is_vowel_phoneme(phoneme: str) -> bool:
    """Return True iff `phoneme` is an ARPAbet vowel (any stress)."""
    return strip_stress(phoneme) in _VOWELS


_TRIM_CHARS = "’'\".,!?:;()[]{}"


@functools.lru_cache(maxsize=8192)
def phones_for(word: str) -> str | None:
    """Return the first CMU-dict pronunciation for `word` as a space-
    separated ARPAbet string, or None if the word isn't in the dictionary.

    Surrounding punctuation (quote marks, commas, brackets) is stripped
    before lookup so '"Hello,' resolves the same as 'Hello'. Internal
    apostrophes are removed (so "don't" → "dont", which isn't in CMU
    dict and falls back to None — that's intentional; callers use
    `first_initial()` for the orthographic fallback path).
    """
    canonical = word.lower().strip(_TRIM_CHARS).replace("'", "")
    if not canonical:
        return None
    pron_list = pronouncing.phones_for_word(canonical)
    if not pron_list:
        return None
    return pron_list[0]


def first_phoneme(word: str) -> str | None:
    """Return the first phoneme of `word` (stress stripped), or None if
    the word isn't in the CMU dict."""
    pron = phones_for(word)
    if not pron:
        return None
    first = pron.split()[0]
    return strip_stress(first)


def first_initial(word: str) -> str | None:
    """Return the best-effort initial 'phoneme' of `word`.

    Tries CMU dict first (real phoneme). Falls back to the first
    alphabetic character (uppercased) when the word isn't in the dict —
    a coarse approximation that handles proper nouns and made-up words.
    Returns None for words with no alphabetic characters.
    """
    p = first_phoneme(word)
    if p:
        return p
    s = word.lower().strip("’'\"().,!?:;")
    return s[0].upper() if s and s[0].isalpha() else None


def tokenize(text: str) -> list[tuple[str, int, int]]:
    """Tokenize `text` into (word, start_char, end_char) tuples."""
    return [(m.group(0), m.start(), m.end()) for m in _WORD_RE.finditer(text)]


def is_stopword(word: str) -> bool:
    """True iff `word.lower()` is in the sonic-detection stopword list."""
    return word.lower() in SONIC_STOPWORDS


def vowel_phonemes(word: str) -> list[str]:
    """Return the vowel phonemes (stress-stripped) of `word`, in order.

    Empty list when the word isn't in the CMU dict.
    """
    pron = phones_for(word)
    if not pron:
        return []
    return [strip_stress(p) for p in pron.split() if is_vowel_phoneme(p)]


def consonant_phonemes(word: str) -> list[str]:
    """Return the consonant phonemes of `word`, in order.

    Empty list when the word isn't in the CMU dict.
    """
    pron = phones_for(word)
    if not pron:
        return []
    return [p for p in pron.split() if not is_vowel_phoneme(p)]
