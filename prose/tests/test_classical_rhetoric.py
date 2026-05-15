"""Tests for the classical-rhetoric detector pack (Phase 8 batch 1).

Verifies the four classical figures fire on expected positives and stay
silent on negatives + when the detector is disabled. Counts on the
inverted-stack vol-2 ch01 baseline are exercised by the smoke harness;
this file pins per-detector semantics with small inline fixtures.
"""

from __future__ import annotations

import prose_telemetry.detectors.classical_rhetoric  # noqa: F401  registers
from prose_telemetry._common import discover, get
from prose_telemetry._common.types import DetectorConfig


PHASE_8_BATCH_1 = {"anaphora", "asyndeton", "polysyndeton", "literal_tricolon"}


def test_classical_rhetoric_pack_registered():
    names = {e.name for e in discover(family="literary_device") if e.tier == "stdlib"}
    assert PHASE_8_BATCH_1 <= names


def test_each_detector_skips_silently_when_disabled():
    sample = "She walked away. She walked further. She walked home."
    for name in PHASE_8_BATCH_1:
        entry = get(name)
        assert entry is not None
        out = entry.fn(sample, config=DetectorConfig(enabled=False))
        assert out == []


def test_each_detector_skips_silently_on_empty_prose():
    for name in PHASE_8_BATCH_1:
        entry = get(name)
        assert entry is not None
        out = entry.fn("", config=DetectorConfig())
        assert out == []


# ─── anaphora ──────────────────────────────────────────────────────────────


def test_anaphora_fires_on_three_consecutive_matching_openers():
    prose = (
        "She walked to the door. She walked to the wall. She walked to the window. "
        "Then everything changed."
    )
    out = get("anaphora").fn(prose, config=DetectorConfig())
    assert len(out) == 1
    assert out[0].extra["run_length"] == 3


def test_anaphora_silent_on_short_run():
    # Only two sentences with the same opener — under default min_run=3.
    prose = "She walked away. She walked back. Then she stopped."
    out = get("anaphora").fn(prose, config=DetectorConfig())
    assert out == []


def test_anaphora_min_run_via_config_extra():
    prose = "She walked away. She walked back. Then she stopped."
    out = get("anaphora").fn(prose, config=DetectorConfig(extra={"min_run": 2}))
    assert len(out) == 1
    assert out[0].extra["run_length"] == 2


# ─── asyndeton ─────────────────────────────────────────────────────────────


def test_asyndeton_fires_on_comma_list_without_terminal_conjunction():
    prose = "She brought bread, cheese, wine."
    out = get("asyndeton").fn(prose, config=DetectorConfig())
    assert len(out) == 1


def test_asyndeton_silent_when_terminal_and_is_present():
    prose = "She brought bread, cheese, and wine."
    # The tail "and wine" leads with "and" → not asyndeton.
    out = get("asyndeton").fn(prose, config=DetectorConfig())
    assert out == []


# ─── polysyndeton ──────────────────────────────────────────────────────────


def test_polysyndeton_fires_on_three_or_more_conjunctions():
    prose = "She ran and jumped and laughed and fell and got up again."
    out = get("polysyndeton").fn(prose, config=DetectorConfig())
    assert len(out) == 1
    assert out[0].extra["and_count"] >= 3


def test_polysyndeton_silent_under_threshold():
    prose = "She ran and jumped and laughed."
    # Only 2 ANDs → under default min_conjunctions=3.
    out = get("polysyndeton").fn(prose, config=DetectorConfig())
    assert out == []


# ─── literal tricolon ──────────────────────────────────────────────────────


def test_literal_tricolon_fires_on_serial_comma_pattern():
    prose = "She wanted truth, justice, and the American way."
    out = get("literal_tricolon").fn(prose, config=DetectorConfig())
    assert len(out) == 1
    items = out[0].extra["items"]
    assert len(items) == 3


def test_literal_tricolon_silent_on_two_item_list():
    prose = "She wanted truth and justice."
    out = get("literal_tricolon").fn(prose, config=DetectorConfig())
    assert out == []
