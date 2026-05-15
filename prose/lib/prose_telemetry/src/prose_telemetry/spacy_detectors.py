"""spaCy-tier detectors for prose-telemetry.

These detectors require POS tagging and dependency parsing — capabilities
that the stdlib-only handcount in the book repo cannot provide. Four
detectors ship in this initial cut:

1. isocolon
   Parallel grammatical structure across consecutive clauses or sentences.
   The hallmark Janeway / classical-rhetoric move: "He had not patched. He
   had rewritten." or "I came; I saw; I conquered." Detected by matching
   POS sequences across consecutive sentences.

2. distributed_chiasmus
   ABBA structure with lemma matching: "The architecture was the rewrite,
   and the rewrite was the architecture." Detected by lemma reversal in
   neighboring noun phrases.

3. nominalization_density
   Verbs converted to abstract nouns ("make a decision" instead of "decide").
   Counted as POS NOUN words whose lemma matches a known verb-to-noun
   suffix pattern. Density metric.

4. antithesis_within_sentence
   Opposing concepts joined by "but"/"yet"/"however" within a single
   sentence, where each side has substantive content. Janeway dramatic
   move: "I was composed, but the composure was not a virtue."
"""

from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path
from typing import Any

import spacy
from spacy.language import Language


# ─── spaCy loader ────────────────────────────────────────────────────────

def load_nlp(model: str = "en_core_web_sm") -> Language:
    """Load and return a spaCy pipeline. Cached at module level if called
    multiple times."""
    return spacy.load(model)


# ─── 1. Isocolon ─────────────────────────────────────────────────────────

def detect_isocolon(doc: spacy.tokens.Doc, min_run: int = 2,
                    min_pos_overlap: float = 0.8) -> list[dict]:
    """Consecutive sentences with strongly parallel POS sequences.

    Heuristic: two adjacent sentences are isocolic if their first N tokens
    share ≥min_pos_overlap fraction of POS tags. Returns runs of length
    ≥min_run+1 (i.e. min_run consecutive parallel pairs).
    """
    findings: list[dict] = []
    sents = list(doc.sents)

    def _pos_sig(sent: spacy.tokens.Span, n: int = 6) -> tuple[str, ...]:
        toks = [t for t in sent if not t.is_punct]
        return tuple(t.pos_ for t in toks[:n])

    def _similarity(a: tuple, b: tuple) -> float:
        if not a or not b:
            return 0.0
        n = min(len(a), len(b))
        if n == 0:
            return 0.0
        matches = sum(1 for i in range(n) if a[i] == b[i])
        return matches / n

    i = 0
    while i < len(sents) - 1:
        run = 1
        sig_a = _pos_sig(sents[i])
        if len(sig_a) < 3:
            i += 1
            continue
        j = i + 1
        while j < len(sents):
            sig_b = _pos_sig(sents[j])
            if len(sig_b) < 3:
                break
            if _similarity(sig_a, sig_b) >= min_pos_overlap:
                run += 1
                j += 1
            else:
                break
        if run > min_run:
            findings.append({
                "type": "isocolon",
                "run_length": run,
                "pos_signature": list(sig_a),
                "sentences": [s.text for s in sents[i:j]],
                "confidence": 0.75,
                "rule_id": "spacy:isocolon.parallel_pos_sequence",
            })
            i = j
        else:
            i += 1
    return findings


# ─── 2. Distributed chiasmus ─────────────────────────────────────────────

# ─── Built-in gradient thresholds ─────────────────────────────────────────
# Two gradient mechanisms, one per detector type. Both ship with the
# detector and apply to every book regardless of profile; per-book
# overrides ADD to (and can override individual entries in) the defaults.
#
# Why gradient instead of binary stopwords:
#   A word like 'mission' or 'question' is content vocabulary up to some
#   reasonable count, then becomes over-use beyond it. Binary "always
#   count" over-flags interview chapters; binary "always ignore" hides
#   genuine over-use. A per-lemma cap captures both: first N occurrences
#   are free (content); occurrence #N+1, N+2, ... fire as findings.

# Nominalization soft caps: lemma → maximum occurrences treated as content.
# Occurrences above the cap fire as findings with `occurrence_index` and
# `over_cap_by` in the payload. Designed conservatively — common abstract
# nouns get higher caps (would need genuinely heavy over-use to flag);
# narrower lemmas get tighter caps. Tune by observing per-chapter
# distributions.
_DEFAULT_NOMINALIZATION_SOFT_CAPS: dict[str, int] = {
    # very common dialogue / cognition (high cap — narrative-natural)
    "question": 8, "conversation": 5, "discussion": 5,
    "decision": 5, "explanation": 4, "mention": 5,
    "recognition": 4, "consideration": 4,
    "attention": 5, "intention": 4,
    # information / description / direction (moderate)
    "information": 4, "expression": 4, "description": 3, "indication": 3,
    "direction": 4, "reaction": 4,
    # condition / situation / position (moderate)
    "condition": 4, "situation": 4, "position": 4,
    # state / function / relation (low — sparing use expected)
    "function": 3, "option": 3, "relation": 3,
    "connection": 3, "introduction": 2,
    # experience / presence / distance / performance / response
    "experience": 4, "presence": 3, "distance": 3,
    "performance": 3, "response": 4,
    # action / motion / emotion
    "action": 4, "motion": 3, "emotion": 3, "intuition": 2,
    # generic narrative (high cap — these are everywhere)
    "moment": 8, "occasion": 3, "version": 4,
}

# Chiasmus reduced-confidence lemmas: any ABBA pair where either lemma
# falls in this set is still detected but emitted at lower confidence
# (0.4 instead of 0.7). The metric still surfaces the pair so authors
# can inspect — but reduced-confidence pairs don't trip the warning
# threshold unless the chapter's overall density is exceptional. Real
# rhetorical chiasmus uses unusual lemma pairings; those keep full 0.7.
_DEFAULT_CHIASMUS_REDUCED_CONFIDENCE_LEMMAS: set[str] = {
    # speech-act verbs (interview / dialogue noise)
    "ask", "answer", "say", "tell", "speak", "talk", "reply", "respond",
    # cognition verbs
    "think", "know", "remember", "notice", "wonder", "decide",
    # motion verbs
    "come", "go", "walk", "run", "turn", "move", "leave", "arrive",
    # perception verbs
    "look", "see", "hear", "watch", "listen",
    # very common action verbs
    "take", "give", "put", "get", "make", "do",
    # state verbs
    "be", "have", "wait", "stand", "sit", "stop",
    # temporal nouns
    "time", "minute", "hour", "day", "night", "year", "moment",
    # body parts (frequent in narrative gesture)
    "hand", "eye", "foot", "head", "face", "voice",
    # generic narrative content nouns
    "thing", "way", "place", "person", "man", "woman",
    "word", "name", "note", "page", "line",
}

# Confidence levels for chiasmus findings.
_CHIASMUS_FULL_CONFIDENCE = 0.7
_CHIASMUS_REDUCED_CONFIDENCE = 0.4


def detect_distributed_chiasmus(
    doc: spacy.tokens.Doc,
    window: int = 30,
    reduced_confidence_lemmas: set[str] | None = None,
) -> list[dict]:
    """ABBA structure with lemma matching across a windowed range.

    Heuristic: find token A followed by token B (both content words) such
    that within `window` tokens, B reappears followed by A (i.e., the
    lemma sequence is reversed). Filters out short-range echoes that are
    just anadiplosis (already covered by stdlib detector).

    `reduced_confidence_lemmas`: lemmas that, when either side of an
    ABBA pair, cause the finding to emit at `_CHIASMUS_REDUCED_CONFIDENCE`
    instead of full `_CHIASMUS_FULL_CONFIDENCE`. The detector's built-in
    `_DEFAULT_CHIASMUS_REDUCED_CONFIDENCE_LEMMAS` (common speech / motion /
    perception verbs + temporal nouns + body parts + generic narrative
    nouns) always apply; this argument extends them. The finding is still
    surfaced — the lower confidence lets the verdict layer (or downstream
    `min_confidence` filter) suppress non-rhetorical cross-pairs without
    losing them from the report entirely.
    """
    findings: list[dict] = []
    reduced = set(_DEFAULT_CHIASMUS_REDUCED_CONFIDENCE_LEMMAS)
    if reduced_confidence_lemmas:
        reduced |= {s.lower() for s in reduced_confidence_lemmas}
    content_toks = [t for t in doc if t.pos_ in {"NOUN", "VERB", "ADJ", "PROPN"}
                    and not t.is_stop and len(t.text) >= 4]
    n = len(content_toks)
    for i in range(n - 3):
        a, b = content_toks[i], content_toks[i + 1]
        if a.lemma_ == b.lemma_:
            continue
        a_lemma_lc = a.lemma_.lower()
        b_lemma_lc = b.lemma_.lower()
        is_reduced = (a_lemma_lc in reduced) or (b_lemma_lc in reduced)
        for j in range(i + 4, min(n, i + window)):
            for k in range(j + 1, min(n, j + 6)):
                c, d = content_toks[j], content_toks[k]
                if (c.lemma_ == b.lemma_
                        and d.lemma_ == a.lemma_
                        and a.lemma_ != b.lemma_):
                    findings.append({
                        "type": "distributed_chiasmus",
                        "lemmas": [a.lemma_, b.lemma_],
                        "first_pair": f"{a.text} ... {b.text}",
                        "second_pair_reversed": f"{c.text} ... {d.text}",
                        "first_sentence": a.sent.text[:140],
                        "second_sentence": d.sent.text[:140],
                        "confidence": (
                            _CHIASMUS_REDUCED_CONFIDENCE if is_reduced
                            else _CHIASMUS_FULL_CONFIDENCE
                        ),
                        "rule_id": "spacy:distributed_chiasmus.lemma_reversal",
                        "is_common_content_pair": is_reduced,
                    })
                    break
    return findings


# ─── 3. Nominalization density ───────────────────────────────────────────

# Suffixes characteristic of verbs-turned-nouns. Many of these overlap
# with the stdlib abstract-noun detector, but here we cross-check against
# spaCy's POS to ensure the token is actually being used as a noun.
_NOMINALIZATION_SUFFIXES = (
    "tion", "sion", "ment", "ance", "ence", "ity", "ness",
)


def detect_nominalizations(
    doc: spacy.tokens.Doc,
    soft_caps: dict[str, int] | None = None,
    default_cap: int = 0,
) -> list[dict]:
    """Nouns whose form suggests they were derived from verbs. Density metric
    with per-lemma soft-cap gradient.

    Each lemma in `soft_caps` (merged with the detector's built-in
    `_DEFAULT_NOMINALIZATION_SOFT_CAPS`) has a maximum-content count.
    Occurrences up to and including the cap are treated as content
    vocabulary and not emitted. Occurrence #(cap+1) and beyond fire as
    findings, with `occurrence_index` (1-based) and `over_cap_by` in the
    payload — so downstream tools see exactly which mentions are
    over-use and by how much.

    Lemmas not in either default-caps or the supplied `soft_caps` dict
    use `default_cap` (default 0 — every occurrence flags, restoring
    pre-gradient behavior for new lemmas the author hasn't classified).

    `soft_caps` is ADDITIVE to the built-in defaults; an entry in
    `soft_caps` overrides the default cap for that lemma.
    """
    from collections import Counter
    findings: list[dict] = []
    effective_caps: dict[str, int] = dict(_DEFAULT_NOMINALIZATION_SOFT_CAPS)
    if soft_caps:
        effective_caps.update({k.lower(): int(v) for k, v in soft_caps.items()})
    occurrences: Counter[str] = Counter()
    for t in doc:
        if t.pos_ != "NOUN":
            continue
        lemma = t.lemma_.lower()
        if not (any(lemma.endswith(suf) for suf in _NOMINALIZATION_SUFFIXES)
                and len(lemma) >= 6):
            continue
        occurrences[lemma] += 1
        cap = effective_caps.get(lemma, default_cap)
        if occurrences[lemma] <= cap:
            # Under the cap — treated as content vocabulary, not flagged.
            continue
        findings.append({
            "type": "nominalization",
            "word": t.text,
            "lemma": t.lemma_,
            "start_char": t.idx,
            "occurrence_index": occurrences[lemma],
            "soft_cap": cap,
            "over_cap_by": occurrences[lemma] - cap,
            "confidence": 0.7,
            "rule_id": "spacy:nominalization.noun_with_verbal_suffix",
        })
    return findings


# ─── 4. Antithesis within sentence ───────────────────────────────────────

_ANTI_CONJUNCTIONS = {"but", "yet", "however", "though", "although", "whereas"}


def detect_antithesis(doc: spacy.tokens.Doc, min_side_tokens: int = 4) -> list[dict]:
    """Single-sentence antithesis: two clauses joined by but/yet/though/etc.
    where each clause has substantive content. Detected by looking for the
    conjunction token, then verifying both sides have at least
    min_side_tokens content tokens and at least one NOUN or VERB."""
    findings: list[dict] = []
    for sent in doc.sents:
        for t in sent:
            if t.text.lower() not in _ANTI_CONJUNCTIONS:
                continue
            # Position of conjunction within the sentence.
            sent_toks = list(sent)
            try:
                idx = sent_toks.index(t)
            except ValueError:
                continue
            left = [tok for tok in sent_toks[:idx] if not tok.is_punct]
            right = [tok for tok in sent_toks[idx + 1:] if not tok.is_punct]
            if len(left) < min_side_tokens or len(right) < min_side_tokens:
                continue
            left_has_content = any(tok.pos_ in {"NOUN", "VERB", "ADJ"} for tok in left)
            right_has_content = any(tok.pos_ in {"NOUN", "VERB", "ADJ"} for tok in right)
            if not (left_has_content and right_has_content):
                continue
            findings.append({
                "type": "antithesis_within_sentence",
                "conjunction": t.text.lower(),
                "left_clause": " ".join(tok.text for tok in left),
                "right_clause": " ".join(tok.text for tok in right),
                "sentence": sent.text[:200],
                "confidence": 0.55,
                "rule_id": "spacy:antithesis.opposing_clauses_in_sentence",
            })
    return findings


# ─── Combined chapter analyzer ───────────────────────────────────────────

_HTML_COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)
_HEADING = re.compile(r"^\s*#+\s.*$", re.MULTILINE)
_HRULE = re.compile(r"^\s*-{3,}\s*$", re.MULTILINE)
_BLOCKQUOTE = re.compile(r"^\s*>\s.*$", re.MULTILINE)
_CODEFENCE = re.compile(r"```.*?```", re.DOTALL)


def _strip_to_prose(md: str) -> str:
    md = _CODEFENCE.sub("", md)
    md = _HTML_COMMENT.sub("", md)
    md = _HEADING.sub("", md)
    md = _HRULE.sub("", md)
    md = _BLOCKQUOTE.sub("", md)
    return md.strip()


def analyze_chapter(
    nlp: Language,
    md_path: Path | str,
    *,
    nominalization_soft_caps: dict[str, int] | None = None,
    chiasmus_reduced_confidence_lemmas: set[str] | None = None,
) -> dict[str, Any]:
    """Run all spaCy-tier detectors against a chapter markdown file.
    Returns the same shape of findings dict that the stdlib handcount
    produces, so the dashboard / drift tools consume it identically.

    `nominalization_soft_caps`: per-lemma cap dict applied on top of
    the built-in defaults; first N occurrences are treated as content,
    over-cap occurrences fire as findings.

    `chiasmus_reduced_confidence_lemmas`: book-specific lemmas added to
    the built-in reduced-confidence set; ABBA pairs touching them are
    still surfaced but at reduced confidence so they don't trip warnings
    on their own.
    """
    path = Path(md_path)
    prose = _strip_to_prose(path.read_text(encoding="utf-8"))
    doc = nlp(prose)

    findings_by_type = {
        "isocolon": detect_isocolon(doc),
        "distributed_chiasmus": detect_distributed_chiasmus(
            doc, reduced_confidence_lemmas=chiasmus_reduced_confidence_lemmas),
        "nominalization": detect_nominalizations(
            doc, soft_caps=nominalization_soft_caps),
        "antithesis_within_sentence": detect_antithesis(doc),
    }

    # Compute density metrics. For detectors that emit findings at
    # variable confidence (chiasmus's reduced-confidence pairs), report
    # both raw count and high-confidence count + weighted count so the
    # verdict layer can distinguish real rhetoric from common-content
    # noise.
    total_tokens = sum(1 for t in doc if not t.is_punct)
    metrics = []
    for dev, anns in findings_by_type.items():
        confidences = [a.get("confidence", 0.7) for a in anns]
        high_conf = sum(1 for c in confidences if c >= 0.7)
        weighted = sum(c / 0.7 for c in confidences)
        metrics.append({
            "device": dev,
            "raw_count": len(anns),
            "high_confidence_count": high_conf,
            "weighted_count": round(weighted, 2),
            "count_per_1k_tokens": round(len(anns) * 1000 / max(total_tokens, 1), 2),
            "high_confidence_per_1k_tokens": round(
                high_conf * 1000 / max(total_tokens, 1), 2),
        })

    return {
        "_schema_version": 3,
        "_schema_status": "spacy-tier — galley/lib/prose_telemetry add-on",
        "chapter_slug": path.stem,
        "source_path": str(path),
        "detected_devices": [a for anns in findings_by_type.values() for a in anns],
        "metrics": metrics,
        "spacy_model": nlp.meta.get("name", "unknown"),
        "spacy_version": spacy.__version__,
    }
