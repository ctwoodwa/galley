"""Smoke tests for the grammar/mechanics detector pack (Phase 8 batch 5)."""

from __future__ import annotations

import prose_telemetry.detectors.grammar_mechanics  # noqa: F401  registers
from prose_telemetry._common import discover, get
from prose_telemetry._common.types import DetectorConfig


PHASE_8_BATCH_5 = {
    "comma_splice", "conjunction_start", "conjunctive_adverb",
    "double_negative", "expletive_construction", "gerund",
    "infinitive_phrase", "passive_voice",
}


def test_pack_registered():
    names = {e.name for e in discover(family="literary_device") if e.tier == "stdlib"}
    assert PHASE_8_BATCH_5 <= names


def test_each_skips_when_disabled():
    for name in PHASE_8_BATCH_5:
        out = get(name).fn("She walked. He talked.", config=DetectorConfig(enabled=False))
        assert out == []


def test_passive_voice_fires():
    # Avoid "was open..." prefix which hits the handcount-inherited
    # false-positive substring filter ("was open", "is open").
    out = get("passive_voice").fn(
        "The package was delivered yesterday. The decision was made already.",
        config=DetectorConfig(),
    )
    assert len(out) >= 2


def test_expletive_construction_fires_on_there_is():
    out = get("expletive_construction").fn(
        "There was a long silence. It was nothing new.",
        config=DetectorConfig(),
    )
    openers = {f.extra["opener"] for f in out}
    assert any("there was" in o for o in openers)


def test_conjunction_start_fires():
    out = get("conjunction_start").fn(
        "She walked away. But he stayed. And then he turned.",
        config=DetectorConfig(),
    )
    conjunctions = {f.extra["conjunction"] for f in out}
    assert {"But", "And"} <= conjunctions


def test_conjunctive_adverb_fires():
    prose = "However, the plan succeeded. Therefore, no further action was needed."
    out = get("conjunctive_adverb").fn(prose, config=DetectorConfig())
    words = {f.extra["word"] for f in out}
    assert {"however", "therefore"} <= words


def test_double_negative_fires_on_proximity_pair():
    prose = "He had not seen anything that resembled the layout, not a chair, not a corner, nothing."
    out = get("double_negative").fn(prose, config=DetectorConfig())
    assert len(out) >= 1


def test_comma_splice_silent_when_coordinator_present():
    prose = "She arrived early, and she sat down."
    out = get("comma_splice").fn(prose, config=DetectorConfig())
    assert out == []


def test_infinitive_phrase_fires_excluding_prepositional_to():
    prose = "She wanted to leave. She gave it to him."
    out = get("infinitive_phrase").fn(prose, config=DetectorConfig())
    verbs = {f.extra["verb"] for f in out}
    assert "leave" in verbs
    # 'him' is in the exclusion list — should not fire.
    assert "him" not in verbs


def test_gerund_excludes_common_non_gerunds():
    prose = "The morning was nothing. During the meeting they were thinking."
    out = get("gerund").fn(prose, config=DetectorConfig())
    words = {f.extra["word"] for f in out}
    assert words.isdisjoint({"morning", "nothing", "during", "meeting", "thinking"})
