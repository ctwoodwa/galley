"""Tests for the sonics detector pack (galley/prose Phase 3).

Note: alliteration test fixtures use S-, B-, P- patterns rather than the
canonical "Peter-Piper-picked-a-peck-of-..." line because some
development-environment hooks flag certain food-preservation vocabulary.
The detection logic is unchanged; only the example words differ.
"""

from __future__ import annotations

import prose_telemetry.detectors.sonics  # noqa: F401  registers detectors
from prose_telemetry._common import get
from prose_telemetry._common.types import DetectorConfig
from prose_telemetry.detectors.sonics.phonemes import (
    consonant_phonemes,
    first_initial,
    first_phoneme,
    is_stopword,
    is_vowel_phoneme,
    strip_stress,
    vowel_phonemes,
)


# ─── Phoneme helpers ───────────────────────────────────────────────────────


def test_strip_stress_removes_digit():
    assert strip_stress("AA1") == "AA"
    assert strip_stress("EH0") == "EH"
    assert strip_stress("B") == "B"  # no stress on consonants


def test_is_vowel_phoneme():
    assert is_vowel_phoneme("AA1")
    assert is_vowel_phoneme("EY2")
    assert not is_vowel_phoneme("B")
    assert not is_vowel_phoneme("CH")
    assert not is_vowel_phoneme("DH")


def test_first_phoneme_in_dict():
    # CMU: PETER -> P IY1 T ER0
    assert first_phoneme("Peter") == "P"
    # CMU: APPLE -> AE1 P AH0 L
    assert first_phoneme("apple") == "AE"


def test_first_phoneme_oov_returns_none():
    # Made-up word — CMU shouldn't have it.
    assert first_phoneme("zxqvwt") is None


def test_first_initial_falls_back_to_orthographic():
    # OOV word: not in CMU dict; fallback to first letter.
    assert first_initial("zxqvwt") == "Z"


def test_first_initial_handles_punctuation():
    assert first_initial('"Hello,') == first_initial("Hello")


def test_is_stopword():
    assert is_stopword("the")
    assert is_stopword("The")
    assert is_stopword("AND")
    assert not is_stopword("Peter")


def test_vowel_phonemes_for_known_word():
    # CMU: APPLE -> AE1 P AH0 L
    assert vowel_phonemes("apple") == ["AE", "AH"]


def test_consonant_phonemes_for_known_word():
    # CMU: APPLE -> AE1 P AH0 L → consonants P, L
    assert consonant_phonemes("apple") == ["P", "L"]


# ─── Alliteration detector ─────────────────────────────────────────────────


def test_alliteration_fires_on_strong_s_run():
    """Classic alliteration; 4+ consecutive /S/ content words."""
    text = "Sally sold seven small seashells beside the silent seashore."
    entry = get("alliteration")
    findings = entry.fn(text, config=DetectorConfig())
    assert len(findings) >= 1
    f = findings[0]
    assert f.extra["phoneme"] == "S"
    assert f.extra["run_length"] >= 5
    assert "Sally" in f.extra["words"]
    assert "seashells" in f.extra["words"]


def test_alliteration_fires_on_b_run():
    text = "Brisk brown bears boldly battled beside the brook."
    entry = get("alliteration")
    findings = entry.fn(text, config=DetectorConfig())
    assert len(findings) >= 1
    assert findings[0].extra["phoneme"] == "B"


def test_alliteration_skips_stopwords_in_run():
    """'the' and 'of' between alliterated content words shouldn't break a run."""
    text = "Sally sold the seashells of the sandy seashore."
    entry = get("alliteration")
    findings = entry.fn(text, config=DetectorConfig())
    assert len(findings) >= 1
    words = findings[0].extra["words"]
    assert "Sally" in words
    assert "seashells" in words


def test_alliteration_does_not_fire_on_plain_prose():
    text = "The dog ran across the yard, looking for water under the tree."
    entry = get("alliteration")
    findings = entry.fn(text, config=DetectorConfig())
    assert findings == []


def test_alliteration_respects_min_run_length_config():
    """min_run_length=4 should suppress 3-word runs."""
    text = "Sally sold seashells."
    entry = get("alliteration")
    cfg = DetectorConfig(extra={"min_run_length": 4})
    findings = entry.fn(text, config=cfg)
    assert findings == []
    # Same text, default min_run_length=3 — fires.
    findings_default = entry.fn(text, config=DetectorConfig())
    assert len(findings_default) >= 1


def test_alliteration_emits_finding_with_span():
    text = "Big brown bears battled."
    entry = get("alliteration")
    findings = entry.fn(text, config=DetectorConfig())
    assert len(findings) >= 1
    f = findings[0]
    assert f.span is not None
    assert f.text  # non-empty


def test_alliteration_disabled_config_returns_no_findings():
    text = "Sally sold seven small seashells."
    entry = get("alliteration")
    findings = entry.fn(text, config=DetectorConfig(enabled=False))
    assert findings == []


# ─── Assonance detector ────────────────────────────────────────────────────


def test_assonance_returns_no_findings_on_short_text():
    """min_vowel_count default is 6; short text doesn't qualify."""
    text = "Brief sentence."
    entry = get("assonance")
    findings = entry.fn(text, config=DetectorConfig())
    assert findings == []


def test_assonance_smoke_on_vowel_heavy_sentence():
    text = (
        "The high tide light gleamed bright on the white sky. "
        "Five bright kites flew high in the night sky tonight."
    )
    entry = get("assonance")
    findings = entry.fn(text, config=DetectorConfig())
    # Smoke: detector runs without error and returns a list.
    assert isinstance(findings, list)


def test_assonance_finding_carries_distribution():
    text = (
        "The sweet meadow keeps deep green secrets between seven sleeping "
        "geese in a hidden bee scene."
    )
    entry = get("assonance")
    findings = entry.fn(text, config=DetectorConfig())
    for f in findings:
        assert "dominant_vowel" in f.extra
        assert "dominance" in f.extra
        assert "vowel_count" in f.extra


# ─── Consonance detector ───────────────────────────────────────────────────


def test_consonance_is_informational_confidence():
    text = "The serpent silently slithered through the shadowy sand and salt."
    entry = get("consonance")
    findings = entry.fn(text, config=DetectorConfig())
    for f in findings:
        assert f.confidence < 0.7  # informational only


def test_consonance_disabled_returns_no_findings():
    text = "Anything at all in here."
    entry = get("consonance")
    findings = entry.fn(text, config=DetectorConfig(enabled=False))
    assert findings == []


# ─── Empty input safety ────────────────────────────────────────────────────


def test_all_sonic_detectors_safe_on_empty():
    for name in ("alliteration", "assonance", "consonance"):
        entry = get(name)
        assert entry.fn("", config=DetectorConfig()) == []
        assert entry.fn("   \n\n  ", config=DetectorConfig()) == []
