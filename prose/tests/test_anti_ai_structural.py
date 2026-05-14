"""Tests for the structural anti-AI detector pack (Phase 6)."""

from __future__ import annotations

import prose_telemetry.detectors.anti_ai_structural  # noqa: F401 auto-registers
from prose_telemetry._common import discover, get
from prose_telemetry._common.types import DetectorConfig


EXPECTED = {
    "false_ranges",
    "fragmented_headers",
    "ing_tail_phrases",
    "inline_header_bullets",
    "rule_of_three_overuse",
    "title_case_headings",
}


def test_all_six_register():
    names = {e.name for e in discover(tier="structural") if e.family == "anti_ai"}
    assert names == EXPECTED


# ─── ing_tail_phrases ──────────────────────────────────────────────────────


def test_ing_tail_phrases_fires_on_tail_marker():
    text = (
        "The kernel signs every payload before transmission, ensuring "
        "tamper-evidence and underscoring the importance of cryptographic "
        "integrity at the data plane."
    )
    findings = get("ing_tail_phrases").fn(text, config=DetectorConfig())
    assert len(findings) >= 1
    markers = {f.extra["marker"] for f in findings}
    assert "ensuring" in markers or "underscoring" in markers


def test_ing_tail_phrases_quiet_when_marker_is_sentence_start():
    text = "Highlighting the value of local-first is the goal of this chapter."
    findings = get("ing_tail_phrases").fn(text, config=DetectorConfig())
    # 'Highlighting' is sentence-initial, not a tail clause; should not flag.
    assert findings == []


# ─── rule_of_three_overuse ─────────────────────────────────────────────────


def test_rule_of_three_fires_on_consecutive_threes():
    text = (
        "Three principles drive the design: data ownership, offline "
        "operation, and cryptographic integrity. Three components "
        "implement them: the kernel, the relay, and the daemon. Three "
        "failure modes matter most: network partition, key loss, and "
        "schema skew."
    )
    findings = get("rule_of_three_overuse").fn(text, config=DetectorConfig())
    assert len(findings) == 1
    assert findings[0].extra["three_item_list_count"] >= 2


def test_rule_of_three_quiet_on_single_three_item_list():
    text = "The architecture has three principles: data, offline, and integrity."
    findings = get("rule_of_three_overuse").fn(text, config=DetectorConfig())
    assert findings == []


# ─── false_ranges ──────────────────────────────────────────────────────────


def test_false_ranges_fires_on_categorical_pair():
    text = "The book covers everything from CRDTs to compliance, from key management to UX patterns."
    findings = get("false_ranges").fn(text, config=DetectorConfig())
    assert len(findings) >= 1


def test_false_ranges_quiet_on_numeric_range():
    text = "Pages 5 to 12 cover the protocol. The year ranges from 2014 to 2026."
    findings = get("false_ranges").fn(text, config=DetectorConfig())
    # Numbers and years should be excluded as real ranges.
    assert findings == []


def test_false_ranges_quiet_on_month_range():
    text = "Operations were suspended from June to September of that year."
    findings = get("false_ranges").fn(text, config=DetectorConfig())
    assert findings == []


# ─── inline_header_bullets ─────────────────────────────────────────────────


def test_inline_header_bullets_fires_on_three_consecutive():
    text = (
        "Intro paragraph.\n\n"
        "- **User Experience:** The UX has been improved.\n"
        "- **Performance:** Performance has been enhanced.\n"
        "- **Security:** Security has been strengthened.\n"
    )
    findings = get("inline_header_bullets").fn(text, config=DetectorConfig())
    assert len(findings) == 1
    assert findings[0].extra["consecutive_count"] == 3


def test_inline_header_bullets_quiet_on_normal_list():
    text = (
        "Some intro.\n\n"
        "- regular item one\n"
        "- regular item two\n"
        "- regular item three\n"
    )
    findings = get("inline_header_bullets").fn(text, config=DetectorConfig())
    assert findings == []


# ─── title_case_headings ───────────────────────────────────────────────────


def test_title_case_headings_fires_on_h2_title_case():
    text = "## The Inverted Stack In One Diagram\n\nBody text below the heading."
    findings = get("title_case_headings").fn(text, config=DetectorConfig())
    assert len(findings) == 1
    assert findings[0].extra["heading_level"] == 2


def test_title_case_headings_quiet_on_sentence_case():
    text = "## The inverted stack in one diagram\n\nBody text."
    findings = get("title_case_headings").fn(text, config=DetectorConfig())
    assert findings == []


def test_title_case_headings_ignores_h1():
    """H1 chapter titles are allowed to be Title Case (house style exception)."""
    text = "# Chapter One — The Cloud Settles In\n\nBody text."
    findings = get("title_case_headings").fn(text, config=DetectorConfig())
    assert findings == []


# ─── fragmented_headers ────────────────────────────────────────────────────


def test_fragmented_headers_fires_on_restatement():
    text = (
        "## Failure modes\n\n"
        "Failure modes matter. The system handles them gracefully."
    )
    findings = get("fragmented_headers").fn(text, config=DetectorConfig())
    assert len(findings) == 1
    assert "failure" in " ".join(findings[0].extra["overlap_words"])


def test_fragmented_headers_quiet_when_first_sentence_substantive():
    text = (
        "## Failure modes\n\n"
        "When the relay is unreachable, the daemon queues writes locally."
    )
    findings = get("fragmented_headers").fn(text, config=DetectorConfig())
    assert findings == []


# ─── Empty + disabled canaries ─────────────────────────────────────────────


def test_structural_safe_on_empty():
    for name in EXPECTED:
        entry = get(name)
        assert entry.fn("", config=DetectorConfig()) == []


def test_structural_disabled_returns_empty():
    text = "## The Inverted Stack\n\nThe Inverted Stack matters."
    for name in EXPECTED:
        entry = get(name)
        findings = entry.fn(text, config=DetectorConfig(enabled=False))
        assert findings == []
