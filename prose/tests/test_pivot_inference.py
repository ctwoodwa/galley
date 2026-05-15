"""Tests for the pivot/inference detector pack (Phase 8 batch 3)."""

from __future__ import annotations

import prose_telemetry.detectors.pivot_inference  # noqa: F401  registers
from prose_telemetry._common import discover, get
from prose_telemetry._common.types import DetectorConfig


PHASE_8_BATCH_3 = {
    "tautological_self_equation",
    "statement_then_reversal",
    "confirmation_tag",
    "inference_cascade",
}


def test_pack_registered():
    names = {e.name for e in discover(family="literary_device") if e.tier == "stdlib"}
    assert PHASE_8_BATCH_3 <= names


def test_each_skips_when_disabled():
    sample = "The room was the room. But the wall was not. Which she was."
    for name in PHASE_8_BATCH_3:
        out = get(name).fn(sample, config=DetectorConfig(enabled=False))
        assert out == []


# ─── tautological_self_equation ────────────────────────────────────────────


def test_tautology_fires_on_the_X_was_the_X():
    prose = "The decision was the decision they had to live with."
    out = get("tautological_self_equation").fn(prose, config=DetectorConfig())
    assert len(out) == 1
    assert out[0].extra["head"] == "decision"


def test_tautology_silent_when_no_match():
    prose = "The decision was final."
    out = get("tautological_self_equation").fn(prose, config=DetectorConfig())
    assert out == []


# ─── statement_then_reversal ───────────────────────────────────────────────


def test_statement_then_reversal_fires_on_consecutive_pivot():
    prose = (
        "The captain had given a clear order in the morning briefing. "
        "But the crew had different ideas about its priority."
    )
    out = get("statement_then_reversal").fn(prose, config=DetectorConfig())
    assert len(out) == 1
    assert out[0].extra["reversal_marker"] == "but"


def test_statement_then_reversal_silent_inside_dialogue():
    # Both sentences in quotes — dialogue, not narrator move.
    prose = (
        '"The captain had given a clear order this morning." '
        '"But the crew thought otherwise about its weight."'
    )
    out = get("statement_then_reversal").fn(prose, config=DetectorConfig())
    assert out == []


def test_statement_then_reversal_silent_on_short_first():
    # First sentence has <6 tokens → skipped.
    prose = "She left. But he stayed and waited a long time after the door closed."
    out = get("statement_then_reversal").fn(prose, config=DetectorConfig())
    assert out == []


# ─── confirmation_tag ──────────────────────────────────────────────────────


def test_confirmation_tag_fires_on_which_pronoun_aux_period():
    prose = "It was over now, which she was."
    out = get("confirmation_tag").fn(prose, config=DetectorConfig())
    assert len(out) == 1
    assert out[0].extra["pronoun"] == "she"
    assert out[0].extra["auxiliary"] == "was"


def test_confirmation_tag_silent_when_no_period():
    prose = "It was over now, which she was thinking about constantly."
    # The regex requires a period close; no match.
    out = get("confirmation_tag").fn(prose, config=DetectorConfig())
    assert out == []


# ─── inference_cascade ─────────────────────────────────────────────────────


def test_inference_cascade_fires_on_three_which_meant_clauses():
    prose = (
        "The new policy reshaped everything, which meant the budget "
        "had to be rebalanced, which meant the timelines were going "
        "to slip, which meant the launch was no longer this quarter."
    )
    out = get("inference_cascade").fn(prose, config=DetectorConfig())
    assert len(out) == 1
    assert out[0].extra["connector"] == "which meant"


def test_inference_cascade_silent_on_two_which_clauses():
    prose = (
        "The new policy was unusual, which meant disruption, which "
        "meant complaints from quarters that had been quiet for years."
    )
    out = get("inference_cascade").fn(prose, config=DetectorConfig())
    # Only 2 "which meant" — under the triple threshold.
    assert out == []
