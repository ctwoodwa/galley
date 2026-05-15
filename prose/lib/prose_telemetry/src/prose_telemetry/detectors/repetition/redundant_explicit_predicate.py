"""Redundant explicit predicate — short echo sentence re-states a predicate
already established in the prior sentence.

The textbook case from *The Inverted Stack* vol-2 ch02:

    "I was already going to need the paper to be true and was prepared
     to be disappointed by it. I was not disappointed."

The second sentence repeats the predicate (`disappointed`) verbatim
when the implicit-trim form lands tighter and harder:

    "...and was prepared to be disappointed by it. I was not."

The detector pairs every two consecutive sentences and fires when:

  - S2 is short (≤ `max_s2_tokens` word-tokens, default 8)
  - S2 starts with a personal pronoun (I / he / she / it / they / we / you)
  - S2 contains a copula/aux verb (was / were / is / are / had / has /
    have / did / does / do / will / would / could / should / may / might)
  - S2 contains a content word ≥4 letters that also appears in the
    *last 12 tokens* of S1 (so the predicate's complement, not its
    subject) — and the same word does not introduce new specificity
    (a number, a proper noun, a time marker)
  - S1 is long enough to plausibly carry the predicate (≥ 6 tokens)

Confidence 0.75. Reported as `type="redundant_explicit_predicate"`,
family `voice` — this is a craft / register defect more than a literary
device. The verdict layer can downgrade or filter by family.

Known limitations:
  - The detector does not parse mood/aspect, so it will flag some
    sentences where the echoed complement is intentionally re-affirmed
    for emphasis. Confidence 0.75 (not 0.9) reflects this.
  - It only looks at adjacent sentences. A predicate echoed three
    sentences later is out of scope.
  - Adding a held-lines exemption is the right safety valve for the
    cases where the explicit echo is deliberate (e.g., rhythmic doubling).
"""

from __future__ import annotations

from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.text import split_sentences, word_tokens
from prose_telemetry._common.types import DetectorConfig, Finding


_PRONOUN_OPENERS = {
    "i", "he", "she", "it", "they", "we", "you",
}

_COPULA_AUX = {
    # be-verbs
    "was", "were", "is", "are", "am", "be", "been", "being",
    # have-aux
    "had", "has", "have", "having",
    # do-aux
    "did", "does", "do", "doing",
    # modal-aux (often paired with elided predicates)
    "will", "would", "could", "should", "may", "might", "must",
    "can", "shall", "ought",
}

_NEGATIONS = {"not", "n't"}

# Function words / common stopwords that would create false positives if
# matched as the shared predicate content word.
_STOPWORD_CONTENT = {
    "with", "from", "that", "this", "these", "those", "they", "them",
    "their", "which", "what", "when", "where", "while", "would",
    "could", "should", "about", "there", "into", "onto", "after",
    "before", "since", "until", "though", "although", "because",
    "between", "through", "during", "against", "without", "within",
    "around", "across", "behind", "beside", "above", "below", "below",
    # Aux/copula forms shouldn't count as the shared content word.
    "have", "been", "having",
    # Common pronouns already excluded but extras for safety.
    "myself", "herself", "himself", "itself", "themselves", "yourself",
}


def _is_short_content_word(tok: str) -> bool:
    """A content word is ≥4 letters, alphabetic, not in the stopword set."""
    if len(tok) < 4:
        return False
    if not tok.isalpha():
        return False
    if tok in _STOPWORD_CONTENT:
        return False
    if tok in _COPULA_AUX:
        return False
    return True


def _last_n_content_words(tokens: list[str], n: int = 12) -> list[str]:
    """Return content words (lowercased) from the last `n` tokens of a
    sentence. Used to focus on the predicate / complement zone of S1
    rather than the subject."""
    tail = tokens[-n:]
    return [t.lower() for t in tail if _is_short_content_word(t.lower())]


def _s2_carries_new_specificity(s2_tokens: list[str]) -> bool:
    """Heuristic: if S2 introduces a number, a proper noun, or a time
    marker, it is probably *not* redundant — it's adding precision the
    elided form would lose.

    Examples that should NOT flag:
      "He had three. — adds quantity"
      "He did it Tuesday. — adds time"
      "She was forty-seven. — adds number"
    """
    for tok in s2_tokens:
        # Digit-bearing tokens (numerals, times, years).
        if any(ch.isdigit() for ch in tok):
            return True
        # Proper-noun heuristic: title-case mid-sentence (not the first
        # token, which is naturally capitalized by sentence rules).
        if tok and tok[0].isupper() and tok != tok.upper():
            # Skip the first position (sentence-start capitalization).
            pass  # handled below
    # Check positions 1+ for proper nouns.
    for tok in s2_tokens[1:]:
        if tok and tok[0].isupper() and tok.isalpha():
            return True
    return False


@register(
    name="redundant_explicit_predicate",
    tier="stdlib",
    family="voice",
    description=(
        "Short echo sentence repeats a predicate already established in the "
        "prior sentence; trim form ('I was not.') lands tighter than the "
        "explicit form ('I was not disappointed.')."
    ),
)
def detect_redundant_explicit_predicate(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []

    max_s2_tokens: int = int(config.extra.get("max_s2_tokens", 8))
    s1_tail_window: int = int(config.extra.get("s1_tail_window", 12))
    min_s1_tokens: int = int(config.extra.get("min_s1_tokens", 6))

    sents = split_sentences(prose)
    findings: list[Finding] = []

    for i in range(len(sents) - 1):
        s1 = sents[i]
        s2 = sents[i + 1].strip()

        s1_toks = word_tokens(s1)
        s2_toks = word_tokens(s2)

        if len(s1_toks) < min_s1_tokens:
            continue
        if not (2 <= len(s2_toks) <= max_s2_tokens):
            continue

        # S2 must open with a personal pronoun.
        if s2_toks[0].lower() not in _PRONOUN_OPENERS:
            continue

        # S2 must contain a copula/aux verb.
        s2_lower = [t.lower() for t in s2_toks]
        if not any(t in _COPULA_AUX for t in s2_lower):
            continue

        # S2 must NOT introduce new specificity (number/proper noun).
        if _s2_carries_new_specificity(s2_toks):
            continue

        # Find shared content word between S2 and the tail of S1.
        s2_content = {t for t in s2_lower if _is_short_content_word(t)}
        if not s2_content:
            continue
        s1_tail_content = set(_last_n_content_words(s1_toks, n=s1_tail_window))
        shared = s2_content & s1_tail_content
        if not shared:
            continue

        # Detected. Find position of the shared word in S2 — must be
        # AFTER the copula/aux (so it's in predicate position, not
        # subject position).
        copula_pos = next(
            (idx for idx, t in enumerate(s2_lower) if t in _COPULA_AUX),
            None,
        )
        if copula_pos is None:
            continue
        post_copula_content = {
            t for t in s2_lower[copula_pos + 1:] if _is_short_content_word(t)
        }
        if not (shared & post_copula_content):
            continue

        # Find the matching word for the verbatim trim suggestion.
        echo_word = sorted(shared & post_copula_content)[0]
        # Suggested trim: keep tokens up through the copula (and any
        # negation immediately after it), drop the rest.
        trim_end = copula_pos + 1
        # Include negation if present.
        if trim_end < len(s2_toks) and s2_lower[trim_end] in _NEGATIONS:
            trim_end += 1
        trim_suggestion = " ".join(s2_toks[:trim_end]) + "."

        findings.append(
            Finding(
                type="redundant_explicit_predicate",
                confidence=0.75,
                rule_id="voice:redundant_explicit_predicate.predicate_echo",
                text=s2[:160],
                extra={
                    "first_sentence": s1,
                    "second_sentence": s2,
                    "echo_word": echo_word,
                    "trim_suggestion": trim_suggestion,
                },
            )
        )

    return findings
