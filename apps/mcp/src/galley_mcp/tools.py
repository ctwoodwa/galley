"""Pure-function implementations of the galley MCP tools.

Each function takes plain Python types and returns a JSON-serializable
dict. The MCP server in `server.py` wraps these as `@mcp.tool()`
endpoints; tests can import + call them directly without spinning up
the MCP protocol layer.
"""

from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path
from typing import Any

from prose_telemetry._common import discover
from prose_telemetry._common.types import (
    BookProfile,
    apply_editorial_overlay,
)
from prose_telemetry._common.text import (  # noqa: F401  ensure side-effect registration
    split_sentences,
)
from prose_telemetry.dispatch import run_registry
from prose_telemetry.init import init_book_editorial
from prose_telemetry.spacy_detectors import _strip_to_prose
from prose_telemetry.verdict import rollup_registry


# ─── chapter measurement ──────────────────────────────────────────────────


def measure_chapter(
    chapter_path: str,
    book_root: str | None = None,
    preset_override: str | None = None,
) -> dict[str, Any]:
    """Run the registry pass on one chapter and return findings, metrics,
    and verdict. AI agents typically want this — it's the same data the
    CLI writes to `prose-metrics.json` under `registry_pipeline`.

    `book_root` defaults to the parent walk that contains a
    `book.editorial.yaml` (per `_find_book_repo`); pass it explicitly
    when the chapter file is outside a recognized book repo.

    `preset_override`, when set, applies an in-memory editorial overlay
    on top of the loaded yaml — useful for "what would `strict` say?"
    without writing a sidecar.
    """
    chapter = Path(chapter_path).expanduser().resolve()
    if not chapter.exists():
        raise FileNotFoundError(f"Chapter file not found: {chapter}")
    root = _resolve_book_root(chapter, book_root)

    profile = BookProfile.from_book_root(root)
    if preset_override:
        profile = apply_editorial_overlay(profile, {"prosePreset": preset_override})

    md = chapter.read_text(encoding="utf-8")
    prose = _strip_to_prose(md)
    result = run_registry(prose, profile)
    verdict = rollup_registry(result.metrics, profile)

    return {
        "chapter_path": str(chapter),
        "book_root": str(root),
        "book_id": profile.book_id,
        "voice": profile.voice,
        "preset": profile.extra.get("_prose_preset", preset_override or "standard"),
        "word_count": result.word_count,
        "findings": result.findings,
        "metrics": result.metrics,
        "verdict": verdict.to_dict(),
    }


def chapter_verdict(
    chapter_path: str,
    book_root: str | None = None,
    preset_override: str | None = None,
) -> dict[str, Any]:
    """Terse variant of `measure_chapter` — just the verdict + the
    blocker / warning lists. Faster to scan when an agent wants to
    answer 'is this chapter clean?' rather than 'show me every match'.
    """
    full = measure_chapter(chapter_path, book_root, preset_override)
    return {
        "chapter_path": full["chapter_path"],
        "book_id": full["book_id"],
        "preset": full["preset"],
        "word_count": full["word_count"],
        "verdict": full["verdict"]["verdict"],
        "blockers": full["verdict"]["blockers"],
        "warnings": full["verdict"]["warnings"],
        "passes_count": len(full["verdict"]["passes"]),
    }


# ─── book introspection ───────────────────────────────────────────────────


def list_books(library_path: str | None = None) -> list[dict[str, Any]]:
    """Enumerate registered books from `integrations/library.json`.
    Defaults to the canonical library inside the galley checkout."""
    p = Path(library_path) if library_path else _default_library_path()
    if not p.exists():
        return []
    data = json.loads(p.read_text(encoding="utf-8"))
    return list(data.get("books", []))


def list_detectors(family: str | None = None, tier: str | None = None) -> list[dict[str, Any]]:
    """Enumerate registered detectors so an agent can target specific
    families. Returns the registry's `DetectorEntry` shape minus the
    callable."""
    # Trigger registration by importing the package.
    import prose_telemetry.detectors  # noqa: F401
    entries = discover(family=family, tier=tier)
    out: list[dict[str, Any]] = []
    for e in entries:
        out.append({
            "name": e.name,
            "family": e.family,
            "tier": e.tier,
            "description": e.description,
            "metadata": dict(e.metadata),
        })
    return out


# ─── yaml scaffolding + overlay ───────────────────────────────────────────


def init_book(
    book_root: str,
    book_id: str | None = None,
    voice: str | None = None,
    genre: str = "literary-fiction",
    force: bool = False,
) -> dict[str, Any]:
    """Scaffold `<book_root>/book.editorial.yaml` for a new book. Mirrors
    `prose init` on the CLI. Refuses to overwrite without force=True."""
    result = init_book_editorial(
        book_root,
        book_id=book_id,
        voice=voice,
        genre=genre,
        force=force,
    )
    return {
        "path": str(result.path),
        "wrote": result.wrote,
        "skipped_reason": result.skipped_reason,
    }


def get_overlay(book_root: str) -> dict[str, Any]:
    """Read the galley UI editorial overlay at
    `<book_root>/.galley/editorial.json`. Returns `{prefs: null}` if
    no overlay exists yet."""
    overlay = Path(book_root).expanduser().resolve() / ".galley" / "editorial.json"
    if not overlay.exists():
        return {"prefs": None, "path": str(overlay)}
    try:
        return json.loads(overlay.read_text(encoding="utf-8")) | {"path": str(overlay)}
    except (OSError, ValueError) as exc:
        return {"prefs": None, "path": str(overlay), "error": str(exc)}


def set_overlay(book_root: str, prefs: dict[str, Any]) -> dict[str, Any]:
    """Write the editorial overlay (preset / activeVoice / voicePassMode)
    to `<book_root>/.galley/editorial.json`. Validates the shape; the
    on-disk file is written atomically (tmp + rename)."""
    valid_presets = {"gentle", "standard", "strict"}
    valid_modes = {"off", "read-only", "auto-apply"}
    active_voice = prefs.get("activeVoice")
    preset = prefs.get("prosePreset")
    mode = prefs.get("voicePassMode")
    if not isinstance(active_voice, str):
        raise ValueError("prefs.activeVoice must be a string (may be '')")
    if preset not in valid_presets:
        raise ValueError(f"prefs.prosePreset must be one of {sorted(valid_presets)}")
    if mode not in valid_modes:
        raise ValueError(f"prefs.voicePassMode must be one of {sorted(valid_modes)}")

    root = Path(book_root).expanduser().resolve()
    galley_dir = root / ".galley"
    galley_dir.mkdir(parents=True, exist_ok=True)
    target = galley_dir / "editorial.json"
    payload = {
        "schema_version": 1,
        "updated_at": _now_iso(),
        "prefs": {
            "activeVoice": active_voice,
            "prosePreset": preset,
            "voicePassMode": mode,
        },
    }
    tmp = target.with_suffix(target.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    tmp.replace(target)
    return payload | {"path": str(target)}


def get_profile(book_root: str) -> dict[str, Any]:
    """Return the resolved `BookProfile` (yaml + overlay merged) as a
    dict. Useful for an agent to inspect what config the pipeline will
    apply without running a measurement."""
    profile = BookProfile.from_book_root(book_root)
    return profile.to_dict()


# ─── internals ────────────────────────────────────────────────────────────


def _resolve_book_root(chapter: Path, override: str | None) -> Path:
    if override:
        return Path(override).expanduser().resolve()
    for ancestor in [chapter] + list(chapter.parents):
        if (ancestor / "book.editorial.yaml").exists():
            return ancestor
        if (ancestor / "build" / "prose_telemetry_handcount.py").exists():
            return ancestor
    return chapter.parent


def _default_library_path() -> Path:
    # The package lives at galley/apps/mcp/src/galley_mcp; walk up to galley/.
    return Path(__file__).resolve().parents[4] / "integrations" / "library.json"


def _now_iso() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


# Convenient symbol the test suite can import without going through MCP.
TOOLS = {
    "measure_chapter": measure_chapter,
    "chapter_verdict": chapter_verdict,
    "list_books": list_books,
    "list_detectors": list_detectors,
    "init_book": init_book,
    "get_overlay": get_overlay,
    "set_overlay": set_overlay,
    "get_profile": get_profile,
}
