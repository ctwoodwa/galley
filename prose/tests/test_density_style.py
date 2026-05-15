"""Smoke tests for the density/style detector pack (Phase 8 batch 4)."""

from __future__ import annotations

import prose_telemetry.detectors.density_style  # noqa: F401  registers
from prose_telemetry._common import discover, get
from prose_telemetry._common.types import DetectorConfig


PHASE_8_BATCH_4 = {
    "abstract_noun", "adverb_ly", "cliche", "fragment_density",
    "modal_verb", "paragraph_length_anomaly", "parenthetical_density",
    "redundant_phrase", "said_tag", "vague_quantifier",
}


def test_pack_registered():
    names = {e.name for e in discover(family="literary_device") if e.tier == "stdlib"}
    assert PHASE_8_BATCH_4 <= names


def test_each_skips_when_disabled():
    sample = "She walked. He talked. They were really very nervous."
    for name in PHASE_8_BATCH_4:
        out = get(name).fn(sample, config=DetectorConfig(enabled=False))
        assert out == []


def test_redundant_phrase_fires_on_default_list():
    prose = "She did it in order to prove the point, despite the fact that nobody asked."
    out = get("redundant_phrase").fn(prose, config=DetectorConfig())
    phrases = {f.extra["phrase"] for f in out}
    assert "in order to" in phrases


def test_redundant_phrase_extends_via_extra():
    prose = "She did it in light of the situation and the cookies."
    cfg = DetectorConfig(extra={"additional_phrases": ["in light of"]})
    out = get("redundant_phrase").fn(prose, config=cfg)
    phrases = {f.extra["phrase"] for f in out}
    assert "in light of" in phrases


def test_modal_verb_fires_on_hedging_words():
    prose = "She could have done it. He should have known. They might."
    out = get("modal_verb").fn(prose, config=DetectorConfig())
    modals = {f.extra["modal"] for f in out}
    assert {"could", "should", "might"} <= modals


def test_vague_quantifier_fires_on_intensifiers():
    prose = "It was very rare and quite unusual, almost unprecedented really."
    out = get("vague_quantifier").fn(prose, config=DetectorConfig())
    words = {f.extra["word"] for f in out}
    assert {"very", "quite", "almost", "really"} <= words


def test_abstract_noun_fires_on_suffix_words():
    prose = "The implementation required justification of every decision."
    out = get("abstract_noun").fn(prose, config=DetectorConfig())
    words = {f.extra["word"] for f in out}
    assert "implementation" in words
    assert "justification" in words


def test_adverb_ly_excludes_common_non_adverbs():
    prose = "The family was only here for the daily walk."
    out = get("adverb_ly").fn(prose, config=DetectorConfig())
    words = {f.extra["word"] for f in out}
    # family / only / daily are in the exclude list.
    assert words.isdisjoint({"family", "only", "daily"})


def test_said_tag_fires_on_attribution():
    prose = '"It is what it is," she said softly. He replied with silence.'
    out = get("said_tag").fn(prose, config=DetectorConfig())
    verbs = {f.extra["verb"] for f in out}
    assert {"said", "replied"} <= verbs


def test_cliche_fires_on_default_phrase():
    prose = "At the end of the day, they were back to square one."
    out = get("cliche").fn(prose, config=DetectorConfig())
    phrases = {f.extra["phrase"] for f in out}
    assert "at the end of the day" in phrases
    assert "back to square one" in phrases


def test_paragraph_length_anomaly_needs_five_paragraphs():
    short = "\n\n".join(["short paragraph each one"] * 3)
    out = get("paragraph_length_anomaly").fn(short, config=DetectorConfig())
    assert out == []


def test_fragment_density_fires_on_consecutive_short_sentences():
    # All four sentences are ≤4 words, so the run covers the whole text.
    prose = "It rained. Then sunshine. Then snow. The day kept changing."
    out = get("fragment_density").fn(prose, config=DetectorConfig())
    assert len(out) == 1
    assert out[0].extra["run_length"] == 4


def test_parenthetical_density_silent_on_low_apposition_count():
    prose = "She walked into the room. The room was empty. The chair was bare."
    out = get("parenthetical_density").fn(prose, config=DetectorConfig())
    assert out == []
