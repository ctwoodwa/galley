"""MCP server exposing galley/prose telemetry to AI agents.

Uses the FastMCP framework from the `mcp` Python SDK. Tools are thin
wrappers around the pure functions in `galley_mcp.tools`; protocol
plumbing lives only here.

Run with `galley-mcp` (console script) or `python -m galley_mcp`. By
default the server speaks stdio — the transport Claude Desktop /
Claude Code expect.
"""

from __future__ import annotations

from typing import Any

from mcp.server.fastmcp import FastMCP

from galley_mcp import tools as T


mcp = FastMCP("galley")


@mcp.tool()
def galley_measure_chapter(
    chapter_path: str,
    book_root: str | None = None,
    preset_override: str | None = None,
) -> dict[str, Any]:
    """Run the prose-telemetry registry pass on a chapter markdown file.

    Returns the full set of findings + per-detector metrics + verdict.
    `book_root` is auto-detected from the chapter path if omitted.
    `preset_override` lets the agent see what `gentle` / `standard` /
    `strict` would say without writing a sidecar.
    """
    return T.measure_chapter(chapter_path, book_root, preset_override)


@mcp.tool()
def galley_chapter_verdict(
    chapter_path: str,
    book_root: str | None = None,
    preset_override: str | None = None,
) -> dict[str, Any]:
    """Terse 'is this chapter clean?' check — returns the verdict
    (red / yellow / green) plus blocker + warning lists. Faster to
    scan than full measurement."""
    return T.chapter_verdict(chapter_path, book_root, preset_override)


@mcp.tool()
def galley_list_books(library_path: str | None = None) -> list[dict[str, Any]]:
    """Enumerate books registered with this galley installation."""
    return T.list_books(library_path)


@mcp.tool()
def galley_list_detectors(
    family: str | None = None,
    tier: str | None = None,
) -> list[dict[str, Any]]:
    """List the registered detectors. Filter by family
    ('voice', 'literary_device', 'anti_ai', 'sonics', 'proselint')
    or tier ('stdlib', 'spacy', 'lexical', 'structural')."""
    return T.list_detectors(family=family, tier=tier)


@mcp.tool()
def galley_init_book(
    book_root: str,
    book_id: str | None = None,
    voice: str | None = None,
    genre: str = "literary-fiction",
    force: bool = False,
) -> dict[str, Any]:
    """Scaffold a new `book.editorial.yaml` at the book repo root.
    Refuses to overwrite an existing file unless force=True."""
    return T.init_book(book_root, book_id=book_id, voice=voice, genre=genre, force=force)


@mcp.tool()
def galley_get_overlay(book_root: str) -> dict[str, Any]:
    """Read the galley UI editorial overlay at
    `<book_root>/.galley/editorial.json`. Returns `prefs: null` if the
    overlay doesn't exist yet."""
    return T.get_overlay(book_root)


@mcp.tool()
def galley_set_overlay(book_root: str, prefs: dict[str, Any]) -> dict[str, Any]:
    """Write the editorial overlay. `prefs` must include `activeVoice`
    (string), `prosePreset` (gentle/standard/strict), and
    `voicePassMode` (off/read-only/auto-apply). Validates + atomic-writes."""
    return T.set_overlay(book_root, prefs)


@mcp.tool()
def galley_get_profile(book_root: str) -> dict[str, Any]:
    """Return the resolved BookProfile (yaml + overlay merged) as a dict —
    useful for inspecting what configuration the pipeline will apply
    before running a measurement."""
    return T.get_profile(book_root)


def main() -> None:
    """Entry point for the `galley-mcp` console script. Speaks MCP
    over stdio (the transport Claude Desktop / Claude Code expect)."""
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
