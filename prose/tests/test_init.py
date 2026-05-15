"""Tests for `prose init` — book.editorial.yaml scaffolding."""

from __future__ import annotations

from pathlib import Path

import pytest

from prose_telemetry.init import (
    InitResult,
    build_default_yaml,
    init_book_editorial,
)


def test_build_default_yaml_contains_required_top_level_keys():
    text = build_default_yaml("my-book")
    assert "book_id: my-book" in text
    assert "voice: null" in text
    assert "genre: literary-fiction" in text
    assert "detectors:" in text
    assert "compute:" in text


def test_build_default_yaml_includes_voice_when_supplied():
    text = build_default_yaml("my-book", voice="anna")
    assert "voice: anna" in text


def test_build_default_yaml_includes_chain_stopword_scaffolding():
    text = build_default_yaml("my-book")
    # Generic English stopwords are detector defaults; the yaml leaves
    # book-specific lists empty for the author to fill in.
    assert "lexical_chain_loop:" in text
    assert "stopword_bigrams:" in text
    assert "stopword_trigrams:" in text


def test_init_book_editorial_writes_yaml_when_missing(tmp_path: Path):
    result = init_book_editorial(tmp_path)
    assert result.wrote is True
    assert result.path.exists()
    assert (tmp_path / "book.editorial.yaml").read_text().startswith("# Editorial profile for")


def test_init_book_editorial_refuses_overwrite_without_force(tmp_path: Path):
    # Pre-create the file.
    existing = tmp_path / "book.editorial.yaml"
    existing.write_text("hand-tuned: yes\n", encoding="utf-8")

    result = init_book_editorial(tmp_path)
    assert result.wrote is False
    assert result.skipped_reason is not None
    # Existing content survives.
    assert existing.read_text() == "hand-tuned: yes\n"


def test_init_book_editorial_force_overwrites(tmp_path: Path):
    (tmp_path / "book.editorial.yaml").write_text("hand-tuned: yes\n", encoding="utf-8")
    result = init_book_editorial(tmp_path, force=True)
    assert result.wrote is True
    assert "hand-tuned" not in result.path.read_text()


def test_init_book_editorial_defaults_book_id_to_directory_name(tmp_path: Path):
    book_dir = tmp_path / "my-novel"
    book_dir.mkdir()
    init_book_editorial(book_dir)
    text = (book_dir / "book.editorial.yaml").read_text()
    assert "book_id: my-novel" in text


def test_init_book_editorial_errors_when_book_root_missing(tmp_path: Path):
    nowhere = tmp_path / "does-not-exist"
    with pytest.raises(NotADirectoryError):
        init_book_editorial(nowhere)


def test_init_book_editorial_generated_yaml_parses_via_BookProfile(tmp_path: Path):
    """Round-trip: the scaffolded yaml must load cleanly through
    BookProfile.from_book_root."""
    init_book_editorial(tmp_path, book_id="rt-test", voice="anna")
    from prose_telemetry._common.types import BookProfile
    profile = BookProfile.from_book_root(tmp_path)
    assert profile.book_id == "rt-test"
    assert profile.voice == "anna"
    # The detectors section creates empty configs that BookProfile
    # parses into DetectorConfig objects.
    assert "filter_words" in profile.detectors
    assert "motif_overuse" in profile.detectors
    assert "lexical_chain_loop" in profile.detectors
