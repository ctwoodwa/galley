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

def detect_distributed_chiasmus(doc: spacy.tokens.Doc, window: int = 30) -> list[dict]:
    """ABBA structure with lemma matching across a windowed range.

    Heuristic: find token A followed by token B (both content words) such
    that within `window` tokens, B reappears followed by A (i.e., the
    lemma sequence is reversed). Filters out short-range echoes that are
    just anadiplosis (already covered by stdlib detector).
    """
    findings: list[dict] = []
    content_toks = [t for t in doc if t.pos_ in {"NOUN", "VERB", "ADJ", "PROPN"}
                    and not t.is_stop and len(t.text) >= 4]
    n = len(content_toks)
    for i in range(n - 3):
        a, b = content_toks[i], content_toks[i + 1]
        if a.lemma_ == b.lemma_:
            continue
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
                        "confidence": 0.7,
                        "rule_id": "spacy:distributed_chiasmus.lemma_reversal",
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


def detect_nominalizations(doc: spacy.tokens.Doc) -> list[dict]:
    """Nouns whose form suggests they were derived from verbs. Density metric."""
    findings: list[dict] = []
    for t in doc:
        if t.pos_ != "NOUN":
            continue
        lemma = t.lemma_.lower()
        if any(lemma.endswith(suf) for suf in _NOMINALIZATION_SUFFIXES) and len(lemma) >= 6:
            findings.append({
                "type": "nominalization",
                "word": t.text,
                "lemma": t.lemma_,
                "start_char": t.idx,
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


def analyze_chapter(nlp: Language, md_path: Path | str) -> dict[str, Any]:
    """Run all spaCy-tier detectors against a chapter markdown file.
    Returns the same shape of findings dict that the stdlib handcount
    produces, so the dashboard / drift tools consume it identically."""
    path = Path(md_path)
    prose = _strip_to_prose(path.read_text(encoding="utf-8"))
    doc = nlp(prose)

    findings_by_type = {
        "isocolon": detect_isocolon(doc),
        "distributed_chiasmus": detect_distributed_chiasmus(doc),
        "nominalization": detect_nominalizations(doc),
        "antithesis_within_sentence": detect_antithesis(doc),
    }

    # Compute simple density metrics.
    total_tokens = sum(1 for t in doc if not t.is_punct)
    metrics = []
    for dev, anns in findings_by_type.items():
        metrics.append({
            "device": dev,
            "raw_count": len(anns),
            "count_per_1k_tokens": round(len(anns) * 1000 / max(total_tokens, 1), 2),
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
