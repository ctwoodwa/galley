"""Tests for galley_mcp.tools — pure-function endpoints behind the MCP server.

These tests don't spin up the MCP protocol layer; they call the
underlying functions directly. The MCP wrapper in `server.py` is a
1:1 thin pass-through, so coverage here covers it transitively.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from galley_mcp import tools as T


SAMPLE_PROSE = (
    "The sun rose over the harbour. I felt the wind shift, and the boat "
    "heeled sharply to starboard. I noticed the captain's hand tighten on "
    "the wheel. I knew the storm would arrive within the hour. The clouds "
    "gathered on the western horizon, dark and low."
)


def _write_chapter(tmp_path: Path, body: str = SAMPLE_PROSE) -> Path:
    chapter = tmp_path / "ch01.md"
    chapter.write_text(body, encoding="utf-8")
    return chapter


def _write_yaml(tmp_path: Path, *, voice: str = "anna", filters: list[str] | None = None) -> None:
    yaml = "book_id: t\nvoice: " + voice + "\n"
    if filters:
        yaml += "detectors:\n  filter_words:\n    filter_words:\n"
        for f in filters:
            yaml += f"      - {f}\n"
    (tmp_path / "book.editorial.yaml").write_text(yaml, encoding="utf-8")


# ─── measure_chapter / chapter_verdict ─────────────────────────────────────


def test_measure_chapter_returns_findings_and_verdict(tmp_path: Path):
    _write_chapter(tmp_path)
    _write_yaml(tmp_path, filters=["felt", "noticed", "knew"])

    out = T.measure_chapter(str(tmp_path / "ch01.md"))

    assert out["book_id"] == "t"
    assert out["voice"] == "anna"
    assert out["word_count"] > 0
    # Filter words list supplied → at least 3 findings (felt / noticed / knew).
    fw = [m for m in out["metrics"] if m["device"] == "filter_words"]
    assert fw and fw[0]["raw_count"] == 3
    assert "verdict" in out["verdict"]


def test_measure_chapter_errors_on_missing_file(tmp_path: Path):
    with pytest.raises(FileNotFoundError):
        T.measure_chapter(str(tmp_path / "does-not-exist.md"))


def test_chapter_verdict_terse_shape(tmp_path: Path):
    _write_chapter(tmp_path)
    _write_yaml(tmp_path, filters=["felt"])

    out = T.chapter_verdict(str(tmp_path / "ch01.md"))

    assert set(out.keys()) >= {
        "chapter_path", "book_id", "preset", "word_count",
        "verdict", "blockers", "warnings", "passes_count",
    }
    # Terse output omits the per-finding detail by design.
    assert "findings" not in out
    assert "metrics" not in out


def test_measure_chapter_preset_override_applies_in_memory(tmp_path: Path):
    _write_chapter(tmp_path)
    # Yaml supplies a high threshold so default preset passes; strict
    # scales it down enough to trip warning.
    (tmp_path / "book.editorial.yaml").write_text(
        "book_id: t\nvoice: anna\n"
        "detectors:\n  filter_words:\n    filter_words: [felt, noticed, knew]\n"
        "    warning_per_1k: 8.0\n    blocker_per_1k: 20.0\n",
        encoding="utf-8",
    )

    standard = T.measure_chapter(str(tmp_path / "ch01.md"))
    strict = T.measure_chapter(str(tmp_path / "ch01.md"), preset_override="strict")

    assert standard["preset"] == "standard"
    assert strict["preset"] == "strict"
    # Same chapter, same metrics — preset only affects verdict thresholds.
    assert standard["metrics"] == strict["metrics"]


# ─── init_book ─────────────────────────────────────────────────────────────


def test_init_book_scaffolds_yaml(tmp_path: Path):
    out = T.init_book(str(tmp_path), book_id="new-book", voice="briar")

    assert out["wrote"] is True
    text = Path(out["path"]).read_text(encoding="utf-8")
    assert "book_id: new-book" in text
    assert "voice: briar" in text


def test_init_book_refuses_overwrite(tmp_path: Path):
    (tmp_path / "book.editorial.yaml").write_text("hand-tuned: yes\n", encoding="utf-8")

    out = T.init_book(str(tmp_path))

    assert out["wrote"] is False
    assert out["skipped_reason"]


# ─── overlay get / set round-trip ──────────────────────────────────────────


def test_set_overlay_writes_atomically_and_get_reads_back(tmp_path: Path):
    write_result = T.set_overlay(
        str(tmp_path),
        {"activeVoice": "anna", "prosePreset": "strict", "voicePassMode": "read-only"},
    )

    overlay_path = Path(write_result["path"])
    assert overlay_path.exists()
    assert write_result["prefs"]["prosePreset"] == "strict"

    read_back = T.get_overlay(str(tmp_path))
    assert read_back["prefs"]["activeVoice"] == "anna"
    assert read_back["prefs"]["prosePreset"] == "strict"
    assert "updated_at" in read_back


def test_set_overlay_rejects_invalid_preset(tmp_path: Path):
    with pytest.raises(ValueError):
        T.set_overlay(
            str(tmp_path),
            {"activeVoice": "", "prosePreset": "chaotic", "voicePassMode": "off"},
        )


def test_get_overlay_returns_null_prefs_when_missing(tmp_path: Path):
    out = T.get_overlay(str(tmp_path))
    assert out["prefs"] is None


# ─── list_books / list_detectors / get_profile ─────────────────────────────


def test_list_books_reads_library_json(tmp_path: Path):
    lib = tmp_path / "library.json"
    lib.write_text(json.dumps({
        "books": [
            {"id": "a", "title": "Book A", "bookRoot": "/tmp/a"},
            {"id": "b", "title": "Book B", "bookRoot": "/tmp/b"},
        ],
    }), encoding="utf-8")

    out = T.list_books(str(lib))
    assert [b["id"] for b in out] == ["a", "b"]


def test_list_books_returns_empty_when_file_missing(tmp_path: Path):
    out = T.list_books(str(tmp_path / "nope.json"))
    assert out == []


def test_list_detectors_returns_registered_set():
    out = T.list_detectors()
    names = {d["name"] for d in out}
    # Sanity check — the Phase 8 migration registered these.
    assert {"filter_words", "anaphora", "modal_verb", "proper_noun"} <= names


def test_list_detectors_filters_by_family():
    out = T.list_detectors(family="voice")
    families = {d["family"] for d in out}
    assert families == {"voice"}


def test_get_profile_round_trip_through_yaml_and_overlay(tmp_path: Path):
    _write_yaml(tmp_path, voice="anna")
    T.set_overlay(
        str(tmp_path),
        {"activeVoice": "briar", "prosePreset": "strict", "voicePassMode": "off"},
    )

    profile = T.get_profile(str(tmp_path))

    # Active voice from overlay overrides yaml.
    assert profile["voice"] == "briar"
    # voicePassMode lands in extra for the voice-pass agent.
    assert profile["_voice_pass_mode"] == "off"
    assert profile["_prose_preset"] == "strict"
