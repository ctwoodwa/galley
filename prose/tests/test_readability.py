"""Tests for prose_telemetry.aggregates.readability."""

from __future__ import annotations

from prose_telemetry.aggregates.readability import (
    attach_to_document_metrics,
    compute_readability,
)


def test_empty_prose_returns_empty_dict():
    assert compute_readability("") == {}
    assert compute_readability("   \n\n  ") == {}


def test_compute_readability_returns_expected_keys():
    text = "The quick brown fox jumps over the lazy dog. " * 5
    metrics = compute_readability(text)
    expected_keys = {
        "flesch_reading_ease",
        "flesch_kincaid_grade",
        "automated_readability_index",
        "gunning_fog",
        "coleman_liau_index",
        "smog_index",
        "dale_chall_readability_score",
        "syllable_count",
        "lexicon_count",
        "mean_syllables_per_word",
    }
    assert set(metrics.keys()) == expected_keys


def test_metrics_are_floats():
    text = "This is a test sentence. Another test sentence here."
    metrics = compute_readability(text)
    for k, v in metrics.items():
        assert isinstance(v, float), f"{k} is {type(v).__name__}, not float"


def test_lexicon_count_matches_word_count_for_simple_text():
    text = "one two three four five"
    metrics = compute_readability(text)
    # textstat's lexicon_count is whitespace-aware; "one two three four five" = 5 words.
    assert metrics["lexicon_count"] == 5.0


def test_syllables_count_grows_with_complexity():
    simple = compute_readability("Dogs run fast.")
    complex_ = compute_readability("Discombobulated philosophers contemplate epistemology.")
    assert complex_["syllable_count"] > simple["syllable_count"]
    assert complex_["mean_syllables_per_word"] > simple["mean_syllables_per_word"]


def test_flesch_easy_text_scores_higher_than_hard_text():
    """Flesch reading ease: higher = easier. Simple words / short sentences
    should outscore complex words / long sentences."""
    easy = "The dog ran. The cat sat. The fish swam."
    hard = (
        "The phenomenological inevitability of distributed-systems "
        "decoherence necessarily implicates compensatory architectural "
        "primitives that exhibit non-deterministic convergence properties "
        "across federated computational substrates."
    )
    easy_metrics = compute_readability(easy)
    hard_metrics = compute_readability(hard)
    assert easy_metrics["flesch_reading_ease"] > hard_metrics["flesch_reading_ease"]


def test_attach_to_document_metrics_non_destructive():
    base = {"word_count": 100, "sentence_count": 8}
    text = "Some prose to make textstat compute things."
    merged = attach_to_document_metrics(base, text)
    # Original keys preserved.
    assert merged["word_count"] == 100
    assert merged["sentence_count"] == 8
    # Readability nested under its own subkey.
    assert "readability" in merged
    assert "flesch_reading_ease" in merged["readability"]


def test_attach_to_document_metrics_skips_empty_prose():
    base = {"word_count": 0}
    merged = attach_to_document_metrics(base, "")
    # No readability key added for empty prose.
    assert "readability" not in merged
    assert merged == base
