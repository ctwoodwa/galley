"""Tests for prose_telemetry.aggregates.rhythm."""

from __future__ import annotations

from prose_telemetry.aggregates.rhythm import (
    compute_dialogue_narration_ratio,
    compute_em_dash_density,
    compute_rhythm,
    compute_sentence_length_cv,
)


# ─── Sentence-length CV ────────────────────────────────────────────────────


def test_sentence_length_cv_empty_returns_zero():
    out = compute_sentence_length_cv("")
    assert out["cv"] == 0.0
    assert out["sentence_count"] == 0


def test_sentence_length_cv_single_sentence_returns_zero():
    out = compute_sentence_length_cv("Just one sentence here.")
    assert out["cv"] == 0.0
    assert out["sentence_count"] == 1


def test_sentence_length_cv_uniform_lengths_is_low():
    text = "One two three. Four five six. Seven eight nine. Ten eleven twelve."
    out = compute_sentence_length_cv(text)
    # All sentences are 3 words. CV should be 0.
    assert out["cv"] == 0.0
    assert out["mean"] == 3.0
    assert out["sentence_count"] == 4


def test_sentence_length_cv_varied_lengths_is_high():
    """Highly varied sentence lengths produce a CV > 0.5."""
    short = "Yes."
    medium = "This is a medium-length sentence with some words."
    long = (
        "And here, in this final sentence of the paragraph, is something "
        "considerably longer than what came before, dragging on in a way "
        "that varies the rhythm of the whole."
    )
    text = f"{short} {medium} {long}"
    out = compute_sentence_length_cv(text)
    assert out["cv"] > 0.5
    assert out["sentence_count"] == 3


# ─── Em-dash density ───────────────────────────────────────────────────────


def test_em_dash_density_empty():
    out = compute_em_dash_density("")
    assert out["total_em_dashes"] == 0
    assert out["paragraph_count"] == 0


def test_em_dash_density_no_dashes():
    text = "First paragraph.\n\nSecond paragraph."
    out = compute_em_dash_density(text)
    assert out["total_em_dashes"] == 0
    assert out["paragraph_count"] == 2


def test_em_dash_density_counts_literal_glyphs():
    text = "One — two — three.\n\nFour — five."
    out = compute_em_dash_density(text)
    assert out["total_em_dashes"] == 3
    assert out["paragraph_count"] == 2
    assert out["max_em_dash_per_paragraph"] == 2


def test_em_dash_density_flags_dense_paragraph():
    """≥ 4 em-dashes in one paragraph triggers the heavy-paragraph counter."""
    dense = "One — two — three — four — five."
    light = "Just normal prose."
    text = f"{dense}\n\n{light}"
    out = compute_em_dash_density(text)
    assert out["paragraphs_with_4plus_em_dashes"] == 1


# ─── Dialogue / narration ratio ────────────────────────────────────────────


def test_dialogue_narration_ratio_empty():
    out = compute_dialogue_narration_ratio("")
    assert out["dialogue_ratio"] == 0.0
    assert out["narration_ratio"] == 0.0
    assert out["sentence_count"] == 0


def test_dialogue_narration_ratio_pure_narration():
    text = "She walked into the room. The light was off. She switched it on."
    out = compute_dialogue_narration_ratio(text)
    assert out["dialogue_ratio"] == 0.0
    assert out["narration_ratio"] == 1.0
    assert out["sentence_count"] == 3
    assert out["dialogue_sentence_count"] == 0


def test_dialogue_narration_ratio_with_quoted_speech():
    text = '"Are you ready?" she asked. He nodded. "Then let us go," she said.'
    out = compute_dialogue_narration_ratio(text)
    # 2 of 3 sentences start or end with a quote — they count as dialogue.
    assert out["dialogue_sentence_count"] >= 1
    assert out["dialogue_ratio"] > 0.0
    assert out["narration_ratio"] < 1.0
    assert out["dialogue_ratio"] + out["narration_ratio"] == 1.0


# ─── compute_rhythm() convenience wrapper ──────────────────────────────────


def test_compute_rhythm_returns_three_sections():
    text = (
        '"Hello," she said.\n\n'
        "He stood by the window — perfectly still — for a long time."
    )
    out = compute_rhythm(text)
    assert "sentence_length" in out
    assert "em_dash" in out
    assert "dialogue" in out


# ─── Fixture-based end-to-end ──────────────────────────────────────────────


def test_rhythm_on_non_book_a(non_book_a_sample):
    """Smoke: rhythm runs on the strict-literary fixture without error."""
    text = non_book_a_sample.read_text(encoding="utf-8")
    out = compute_rhythm(text)
    assert out["sentence_length"]["sentence_count"] > 5
    # Fixture A's narration has no quoted speech.
    assert out["dialogue"]["dialogue_ratio"] == 0.0


def test_rhythm_on_non_book_b(non_book_b_sample):
    """Smoke: rhythm runs on the technical-nonfiction fixture."""
    text = non_book_b_sample.read_text(encoding="utf-8")
    out = compute_rhythm(text)
    assert out["sentence_length"]["sentence_count"] > 5
