"""Tests for the repetition/echo detector pack (Phase 8 batch 2a)."""

from __future__ import annotations

import prose_telemetry.detectors.repetition  # noqa: F401  registers
from prose_telemetry._common import discover, get
from prose_telemetry._common.types import DetectorConfig


PHASE_8_BATCH_2A = {
    "anadiplosis",
    "echo_and_confirm",
    "epanorthosis",
    "internal_anaphora",
}

ALL_REPETITION_DETECTORS = PHASE_8_BATCH_2A | {"redundant_explicit_predicate"}


def test_repetition_pack_registered():
    names_lit = {e.name for e in discover(family="literary_device") if e.tier == "stdlib"}
    names_voice = {e.name for e in discover(family="voice") if e.tier == "stdlib"}
    assert PHASE_8_BATCH_2A <= names_lit
    assert "redundant_explicit_predicate" in names_voice


def test_each_detector_skips_when_disabled():
    for name in ALL_REPETITION_DETECTORS:
        out = get(name).fn("She said it twice. She said it twice.",
                           config=DetectorConfig(enabled=False))
        assert out == []


def test_each_detector_skips_on_empty_prose():
    for name in ALL_REPETITION_DETECTORS:
        assert get(name).fn("", config=DetectorConfig()) == []


# ─── epanorthosis ──────────────────────────────────────────────────────────


def test_epanorthosis_fires_on_not_X_em_Y():
    prose = "It was not a request — a command."
    out = get("epanorthosis").fn(prose, config=DetectorConfig())
    assert len(out) == 1


def test_epanorthosis_silent_when_no_em_dash():
    prose = "It was not a request. A command."
    out = get("epanorthosis").fn(prose, config=DetectorConfig())
    assert out == []


# ─── anadiplosis ───────────────────────────────────────────────────────────


def test_anadiplosis_fires_on_cross_sentence_echo():
    prose = "She walked back to the cottage. The cottage stood empty."
    # last word of A = "cottage"; first content word of B (skipping
    # "the") = "cottage". Should fire.
    out = get("anadiplosis").fn(prose, config=DetectorConfig())
    assert len(out) == 1
    assert out[0].extra["echo_word"] == "cottage"


def test_anadiplosis_silent_when_short_stopword_echo():
    # last_a = "the" — under min length 4, silent.
    prose = "She went to the. The other one was gone."
    out = get("anadiplosis").fn(prose, config=DetectorConfig())
    assert out == []


# ─── internal_anaphora ─────────────────────────────────────────────────────


def test_internal_anaphora_fires_on_three_clause_word_repeat():
    # 4 clauses so the consecutive-run check reaches min_repeats=3 after
    # skipping the first clause's "She" opener.
    prose = "She arrived, arrived early, arrived alone, arrived spent."
    out = get("internal_anaphora").fn(prose, config=DetectorConfig())
    assert len(out) == 1
    assert out[0].extra["word"] == "arrived"


def test_internal_anaphora_silent_on_function_word_starts():
    # "the bunk, the desk, the bookshelf" is functional inventory, not
    # internal anaphora.
    prose = "The room held the bunk, the desk, the bookshelf, the chair."
    out = get("internal_anaphora").fn(prose, config=DetectorConfig())
    assert out == []


# ─── echo_and_confirm ──────────────────────────────────────────────────────


def test_echo_and_confirm_fires_on_rule_then_personal_echo():
    # Rule content-words filter at min_len=4 so the shared stem needs
    # a ≥4-char word — "grow" qualifies; "let" doesn't.
    prose = "If you let it grow. I had let it grow."
    out = get("echo_and_confirm").fn(prose, config=DetectorConfig())
    assert len(out) == 1
    assert "grow" in {s for s in out[0].extra["shared_stems"]}


def test_echo_and_confirm_silent_without_rule_marker():
    prose = "She left the room. I went after her."
    out = get("echo_and_confirm").fn(prose, config=DetectorConfig())
    assert out == []


def test_echo_and_confirm_silent_when_confirm_too_long():
    prose = (
        "If you let it grow unchecked, the staff history bends. "
        "I had let it grow far past the point where any of us could stop it now."
    )
    # Confirm sentence is much longer than 6 words → no match.
    out = get("echo_and_confirm").fn(prose, config=DetectorConfig())
    assert out == []


# ─── redundant_explicit_predicate ──────────────────────────────────────────


def test_redundant_predicate_fires_on_disappointed_echo():
    # The textbook case from ch02. S1 sets up "disappointed by it"; S2
    # echoes "disappointed" explicitly when "I was not." would suffice.
    prose = (
        "I was prepared to be disappointed by it. "
        "I was not disappointed."
    )
    out = get("redundant_explicit_predicate").fn(prose, config=DetectorConfig())
    assert len(out) == 1
    assert out[0].extra["echo_word"] == "disappointed"
    assert out[0].extra["trim_suggestion"] == "I was not."


def test_redundant_predicate_fires_on_questions_echo():
    # "He had questions." repeats what S1 already named; "He did." trims.
    prose = (
        "I asked him whether he had questions for me. "
        "He had questions."
    )
    out = get("redundant_explicit_predicate").fn(prose, config=DetectorConfig())
    assert len(out) == 1
    assert out[0].extra["echo_word"] == "questions"


def test_redundant_predicate_silent_when_s2_adds_quantity():
    # "He had three." adds quantity — NOT redundant.
    prose = (
        "I asked him whether he had questions for me. "
        "He had three."
    )
    out = get("redundant_explicit_predicate").fn(prose, config=DetectorConfig())
    assert out == []


def test_redundant_predicate_silent_when_s2_adds_proper_noun():
    # Adds a name — not redundant; conveys new specificity.
    prose = (
        "She wondered who would call her back. "
        "It was Klett."
    )
    out = get("redundant_explicit_predicate").fn(prose, config=DetectorConfig())
    assert out == []


def test_redundant_predicate_silent_when_s2_has_no_shared_word():
    # No predicate echo — completely different content.
    prose = (
        "She walked back to the cottage. "
        "He waited in the rain."
    )
    out = get("redundant_explicit_predicate").fn(prose, config=DetectorConfig())
    assert out == []


def test_redundant_predicate_silent_when_s2_too_long():
    # Second sentence above 8 tokens — not a trim candidate.
    prose = (
        "I was prepared to be disappointed by it. "
        "I was not disappointed for reasons I would only later understand."
    )
    out = get("redundant_explicit_predicate").fn(prose, config=DetectorConfig())
    assert out == []


def test_redundant_predicate_silent_when_s2_lacks_copula():
    # S2 has no aux/copula to elide.
    prose = (
        "I was prepared to be disappointed by it. "
        "Then disappointed she walked away."
    )
    out = get("redundant_explicit_predicate").fn(prose, config=DetectorConfig())
    assert out == []


def test_redundant_predicate_max_s2_tokens_configurable():
    # Override max_s2_tokens via DetectorConfig.extra to loosen the check.
    prose = (
        "I was prepared to be disappointed by it. "
        "I was not disappointed in any meaningful way today."
    )
    cfg = DetectorConfig(extra={"max_s2_tokens": 12})
    out = get("redundant_explicit_predicate").fn(prose, config=cfg)
    # S2 has 9 tokens; with raised cap to 12 it should fire.
    assert len(out) == 1


def test_redundant_predicate_subject_only_echo_does_not_fire():
    # Shared word is in S1's subject position (early), not predicate
    # tail — should NOT fire because the detector restricts S1's match
    # window to its last 12 tokens.
    prose = (
        "The boats had departed at dawn but the harbor was now still and quiet under a low silver sky. "
        "I was not a boat."
    )
    # "boats" only appears in S1's first tokens, not the last 12.
    out = get("redundant_explicit_predicate").fn(prose, config=DetectorConfig())
    assert out == []
