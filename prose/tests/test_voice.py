"""Tests for the voice detector pack (galley/prose Phase 4).

Verifies the Anna-decoupling success criteria:

- Each of the three voice detectors reads its list/dict from
  BookProfile.detectors.<name>.* — not from hardcoded constants.
- Inverted-stack profile catches Anna-style prose patterns.
- Non-book profiles (empty config or different lists) produce
  operationally different findings on the same prose.
- Empty config = zero findings (multi-book canary).

Note: the `inverted_stack_profile` fixture is session-scoped (see
conftest.py). Tests that need a modified config (e.g. `enabled=False`)
must use `dataclasses.replace()` to derive a new DetectorConfig rather
than mutating the fixture's object in place — mutation persists across
tests within the same session.
"""

from __future__ import annotations

from dataclasses import replace

import prose_telemetry.detectors.voice  # noqa: F401  registers detectors
from prose_telemetry._common import discover, get
from prose_telemetry._common.types import BookProfile, DetectorConfig


# A short prose sample that contains every Anna pattern we care about
# (filter verbs, retired motif, several self-referential frames).
ANNA_SAMPLE = (
    "I am writing this here, in this account, so that the staff "
    "history records what it claimed to be. I felt the weight of "
    "the moment. I noticed the silence. I realized something was "
    "wrong. I felt cold. For the record, the door was open."
)

# Plain narration with the same kind of verbs but no Anna meta-frames.
PLAIN_SAMPLE = (
    "She walked into the room and stopped. The light was off. She "
    "turned it on. The chair was empty. She crossed to the window "
    "and pulled back the curtain."
)


# ─── Registration ──────────────────────────────────────────────────────────


def test_voice_pack_registers_three_detectors():
    # `redundant_explicit_predicate` (added 2026-05-15) is also in the
    # voice family but lives under the repetition pack; tested separately
    # in test_repetition.py. The three detectors here are the original
    # voice-family detectors that ship with their own config_source
    # metadata.
    names = {e.name for e in discover(family="voice")}
    assert {"filter_words", "motif_overuse", "self_referential_frame"} <= names


def test_each_voice_detector_carries_config_source_metadata():
    for name in ("filter_words", "motif_overuse", "self_referential_frame"):
        entry = get(name)
        assert entry is not None
        assert "config_source" in entry.metadata


# ─── filter_words ──────────────────────────────────────────────────────────


def test_filter_words_fires_on_anna_profile(inverted_stack_profile):
    cfg = inverted_stack_profile.detector("filter_words")
    findings = get("filter_words").fn(ANNA_SAMPLE, config=cfg)
    # ANNA_SAMPLE has: "I felt" x2, "I noticed" x1, "I realized" x1
    assert len(findings) >= 4
    verbs_found = {f.extra["verb"] for f in findings}
    assert "felt" in verbs_found
    assert "noticed" in verbs_found
    assert "realized" in verbs_found


def test_filter_words_empty_config_returns_nothing():
    """Empty filter_words list = empty regex alternation = no findings."""
    cfg = DetectorConfig()  # default — empty list
    findings = get("filter_words").fn(ANNA_SAMPLE, config=cfg)
    assert findings == []


def test_filter_words_non_book_a_partial_list(non_book_a_profile):
    """non_book_a's profile has 3 filter verbs (felt/noticed/sensed) —
    catches fewer hits than Anna's 25-verb list."""
    cfg = non_book_a_profile.detector("filter_words")
    findings = get("filter_words").fn(ANNA_SAMPLE, config=cfg)
    # 'I felt' x2 + 'I noticed' x1 = 3 hits (no 'realized' since not in list).
    assert len(findings) == 3
    verbs = {f.extra["verb"] for f in findings}
    assert verbs == {"felt", "noticed"}


def test_filter_words_disabled_returns_nothing(inverted_stack_profile):
    cfg = inverted_stack_profile.detector("filter_words")
    # Don't mutate the session-scoped fixture; derive a disabled copy.
    disabled = replace(cfg, enabled=False)
    findings = get("filter_words").fn(ANNA_SAMPLE, config=disabled)
    assert findings == []


def test_filter_words_doesnt_match_outside_anchor():
    """The regex requires 'I <verb>' — 'she felt' should not match."""
    cfg = DetectorConfig(filter_words=["felt"])
    text = "She felt the silence. They felt nothing. I felt cold."
    findings = get("filter_words").fn(text, config=cfg)
    assert len(findings) == 1  # only "I felt"


# ─── motif_overuse ─────────────────────────────────────────────────────────


def test_motif_overuse_fires_on_retired_phrase(inverted_stack_profile):
    cfg = inverted_stack_profile.detector("motif_overuse")
    findings = get("motif_overuse").fn(ANNA_SAMPLE, config=cfg)
    # ANNA_SAMPLE contains "what it claimed to be" → 1 retired motif hit.
    retired = [f for f in findings if f.extra["status"] == "retired"]
    assert len(retired) == 1
    assert retired[0].extra["phrase"] == "what it claimed to be"


def test_motif_overuse_capped_only_over_threshold(inverted_stack_profile):
    """Single occurrence of a capped phrase = no finding (within cap).
    Two occurrences = one finding (the over-cap one)."""
    cfg = inverted_stack_profile.detector("motif_overuse")
    once = "Once: I am writing this here. The end."
    twice = (
        "First: I am writing this here. Second: I am writing this here "
        "again. Done."
    )
    findings_once = get("motif_overuse").fn(once, config=cfg)
    findings_twice = get("motif_overuse").fn(twice, config=cfg)
    # 'I am writing this here' is in both retired? No, only in capped (cap=1)
    # AND in self_referential_frames (separate detector).
    capped_once = [f for f in findings_once if f.extra["status"] == "capped"]
    capped_twice = [f for f in findings_twice if f.extra["status"] == "capped"]
    assert len(capped_once) == 0  # within cap
    assert len(capped_twice) >= 1  # over cap


def test_motif_overuse_empty_config_returns_nothing():
    findings = get("motif_overuse").fn(ANNA_SAMPLE, config=DetectorConfig())
    assert findings == []


def test_motif_overuse_non_book_a_empty_lists(non_book_a_profile):
    """non_book_a has empty motif lists — same Anna prose produces 0
    findings."""
    cfg = non_book_a_profile.detector("motif_overuse")
    findings = get("motif_overuse").fn(ANNA_SAMPLE, config=cfg)
    assert findings == []


# ─── self_referential_frame ────────────────────────────────────────────────


def test_self_referential_frame_fires_on_anna_profile(inverted_stack_profile):
    cfg = inverted_stack_profile.detector("self_referential_frame")
    findings = get("self_referential_frame").fn(ANNA_SAMPLE, config=cfg)
    # ANNA_SAMPLE has: "I am writing this here", "in this account",
    # "the staff history", "for the record" = 4 phrases.
    assert len(findings) >= 3
    phrases = {f.extra["phrase"] for f in findings}
    assert "i am writing this here" in phrases
    assert "the staff history" in phrases


def test_self_referential_frame_empty_config_returns_nothing():
    findings = get("self_referential_frame").fn(ANNA_SAMPLE, config=DetectorConfig())
    assert findings == []


def test_self_referential_frame_non_book_b_empty(non_book_b_profile):
    """non_book_b technical-nonfiction has no staff-history frames at all."""
    cfg = non_book_b_profile.detector("self_referential_frame")
    findings = get("self_referential_frame").fn(ANNA_SAMPLE, config=cfg)
    assert findings == []


# ─── Multi-book canary (Phase 4 gate) ──────────────────────────────────────


def test_anna_vs_non_book_produces_distinct_findings(
    inverted_stack_profile, non_book_a_profile, non_book_b_profile
):
    """Phase 4 gate: same prose, three profiles, three operationally
    distinct finding totals across the voice detectors."""
    totals = {}
    for label, profile in (
        ("anna", inverted_stack_profile),
        ("non_book_a", non_book_a_profile),
        ("non_book_b", non_book_b_profile),
    ):
        total = 0
        for name in ("filter_words", "motif_overuse", "self_referential_frame"):
            cfg = profile.detector(name)
            total += len(get(name).fn(ANNA_SAMPLE, config=cfg))
        totals[label] = total

    # Three distinct totals — proves the config layer is load-bearing.
    assert totals["anna"] > totals["non_book_a"] > 0
    assert totals["non_book_a"] >= totals["non_book_b"]
    # Anna's profile catches all the Anna patterns.
    assert totals["anna"] >= 8  # 4 filter + 1 retired + 3 frames at minimum


# ─── Plain-prose negative cases ────────────────────────────────────────────


def test_voice_detectors_quiet_on_plain_prose(inverted_stack_profile):
    """Anna profile against plain narration produces few/no findings.
    PLAIN_SAMPLE has no Anna meta-frames; verbs like 'felt' don't fire
    without the 'I' anchor."""
    total = 0
    for name in ("filter_words", "motif_overuse", "self_referential_frame"):
        cfg = inverted_stack_profile.detector(name)
        findings = get(name).fn(PLAIN_SAMPLE, config=cfg)
        total += len(findings)
    assert total == 0  # nothing in PLAIN_SAMPLE matches Anna lists


# ─── Empty input safety ────────────────────────────────────────────────────


def test_voice_detectors_safe_on_empty(inverted_stack_profile):
    for name in ("filter_words", "motif_overuse", "self_referential_frame"):
        cfg = inverted_stack_profile.detector(name)
        assert get(name).fn("", config=cfg) == []
        assert get(name).fn("   \n\n  ", config=cfg) == []
