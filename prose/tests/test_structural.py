"""Smoke tests for the structural/nouns/time pack (Phase 8 batch 6)."""

from __future__ import annotations

import prose_telemetry.detectors.structural  # noqa: F401  registers
from prose_telemetry._common import discover, get
from prose_telemetry._common.types import DetectorConfig


PHASE_8_BATCH_6 = {
    "direct_address", "paragraph_opener_repeat", "proper_noun",
    "proximity_echo", "temporal_marker", "timestamp",
}


def test_pack_registered():
    names = {e.name for e in discover(family="literary_device") if e.tier == "stdlib"}
    assert PHASE_8_BATCH_6 <= names


def test_each_skips_when_disabled():
    for name in PHASE_8_BATCH_6:
        out = get(name).fn("Then she walked away at 09:14.", config=DetectorConfig(enabled=False))
        assert out == []


def test_direct_address_fires_on_reader_phrase():
    prose = "Dear reader, the silence held. Trust me, it broke before dawn."
    out = get("direct_address").fn(prose, config=DetectorConfig())
    phrases = {f.extra["phrase"] for f in out}
    assert "dear reader" in phrases


def test_timestamp_fires_on_hh_mm():
    prose = "The lights came on at 06:03 and stayed on past 21:45."
    out = get("timestamp").fn(prose, config=DetectorConfig())
    times = {f.extra["time"] for f in out}
    assert {"06:03", "21:45"} <= times


def test_temporal_marker_fires():
    prose = "Then she stopped. Soon she would understand. Eventually the answer came."
    out = get("temporal_marker").fn(prose, config=DetectorConfig())
    markers = {f.extra["marker"] for f in out}
    assert {"then", "soon", "eventually"} <= markers


def test_paragraph_opener_repeat_fires_on_three_paragraphs_with_same_word():
    prose = (
        "Anna walked into the room.\n\n"
        "Anna turned the lights off.\n\n"
        "Anna closed the door behind her.\n\n"
        "The wind picked up outside."
    )
    out = get("paragraph_opener_repeat").fn(prose, config=DetectorConfig())
    words = {f.extra["word"] for f in out}
    assert "anna" in words


def test_paragraph_opener_repeat_silent_on_function_words():
    # "The" opens many paragraphs but is in the function-word exclusion set.
    prose = (
        "The room was still.\n\n"
        "The chair sat empty.\n\n"
        "The window framed the dawn."
    )
    out = get("paragraph_opener_repeat").fn(prose, config=DetectorConfig())
    assert out == []


def test_proper_noun_fires_on_mid_sentence_capital():
    # Regex is ASCII-only ([A-Z][a-z]{2,}) — Unicode names like 'Tomás'
    # are not matched; that's the handcount-inherited behavior.
    prose = "She met Anna at the harbour. The Wanjiru network was in place."
    out = get("proper_noun").fn(prose, config=DetectorConfig())
    words = {f.extra["word"] for f in out}
    assert {"Anna", "Wanjiru"} <= words


def test_proximity_echo_fires_on_same_sentence_repeat():
    prose = "The crystal lattice held the crystal pattern firmly in place forever."
    out = get("proximity_echo").fn(prose, config=DetectorConfig())
    # "crystal" appears twice within ≤12 tokens.
    words = {f.extra["word"] for f in out}
    assert "crystal" in words


def test_proximity_echo_respects_stopwords():
    # "matter" is in the default stopword set — should NOT fire.
    prose = "It was a matter of timing, a matter of patience, a matter of waiting."
    out = get("proximity_echo").fn(prose, config=DetectorConfig())
    words = {f.extra["word"] for f in out}
    assert "matter" not in words
