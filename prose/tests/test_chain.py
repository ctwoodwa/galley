"""Tests for the chain-loop detector pack (Phase 8 batch 2b)."""

from __future__ import annotations

import prose_telemetry.detectors.chain  # noqa: F401  registers
from prose_telemetry._common import discover, get
from prose_telemetry._common.types import DetectorConfig


PHASE_8_BATCH_2B = {"lexical_chain_loop", "bigram_chain_loop", "trigram_chain_loop"}


def test_chain_pack_registered():
    names = {e.name for e in discover(family="literary_device") if e.tier == "stdlib"}
    assert PHASE_8_BATCH_2B <= names


# ─── lexical_chain_loop ────────────────────────────────────────────────────


def test_lexical_chain_fires_on_repeated_content_word_in_short_paragraph():
    # >=80 chars; "feeling" appears 4 times → density 4 in ~22 words triggers.
    para = (
        "She had the feeling. The feeling pressed against her ribs. "
        "The feeling told her to wait. The feeling did not lie."
    )
    out = get("lexical_chain_loop").fn(para, config=DetectorConfig())
    assert any(f.extra["word"] == "feeling" for f in out)


def test_lexical_chain_respects_book_specific_stopwords():
    """Anna's `consortium` should NOT fire when the book yaml supplies
    it as a stopword."""
    para = (
        "The consortium met that morning. The consortium decided. "
        "The consortium had no choice. The consortium would forgive."
    )
    out_default = get("lexical_chain_loop").fn(para, config=DetectorConfig())
    assert any(f.extra["word"] == "consortium" for f in out_default)

    # With consortium in stopwords, the detector ignores it.
    out_quiet = get("lexical_chain_loop").fn(
        para,
        config=DetectorConfig(stopwords=["consortium"]),
    )
    assert not any(f.extra["word"] == "consortium" for f in out_quiet)


def test_lexical_chain_generic_stopwords_skip_function_words():
    # "would" is in _GENERIC_STOPWORDS → no finding even at high frequency.
    para = (
        "I would have. She would do. They would not. He would soon. "
        "We would have lost time without the right kind of caution today."
    )
    out = get("lexical_chain_loop").fn(para, config=DetectorConfig())
    assert not any(f.extra["word"] == "would" for f in out)


# ─── bigram_chain_loop ─────────────────────────────────────────────────────


def test_bigram_chain_fires_on_repeated_phrase():
    # "staff history" five times in one paragraph.
    para = (
        "The staff history begins early. The staff history grows quickly. "
        "The staff history bends today. The staff history will not lie. "
        "The staff history was correct again."
    )
    out = get("bigram_chain_loop").fn(para, config=DetectorConfig())
    assert any(f.extra["bigram"] == "staff history" for f in out)


def test_bigram_chain_respects_book_specific_stopword_bigram():
    para = (
        "The staff history begins early. The staff history grows quickly. "
        "The staff history bends today. The staff history will not lie. "
        "The staff history was correct again."
    )
    cfg = DetectorConfig(extra={"stopword_bigrams": [["staff", "history"]]})
    out = get("bigram_chain_loop").fn(para, config=cfg)
    # "staff history" is now in the stopword set → no longer flagged.
    assert not any(f.extra["bigram"] == "staff history" for f in out)


# ─── trigram_chain_loop ────────────────────────────────────────────────────


def test_trigram_chain_fires_on_repeated_three_word_phrase():
    para = (
        "the smallest possible feeling and then the smallest possible feeling "
        "and again the smallest possible feeling and once more the smallest "
        "possible feeling and the smallest possible feeling persisted."
    )
    out = get("trigram_chain_loop").fn(para, config=DetectorConfig())
    assert any("smallest possible feeling" in f.extra["trigram"] for f in out)
