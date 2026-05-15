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


def test_repetition_pack_registered():
    names = {e.name for e in discover(family="literary_device") if e.tier == "stdlib"}
    assert PHASE_8_BATCH_2A <= names


def test_each_detector_skips_when_disabled():
    for name in PHASE_8_BATCH_2A:
        out = get(name).fn("She said it twice. She said it twice.",
                           config=DetectorConfig(enabled=False))
        assert out == []


def test_each_detector_skips_on_empty_prose():
    for name in PHASE_8_BATCH_2A:
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
