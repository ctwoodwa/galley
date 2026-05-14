"""Tests for prose_telemetry.markdown_ast."""

from __future__ import annotations

from prose_telemetry.markdown_ast import Block, extract_prose, parse_blocks


# ─── parse_blocks ──────────────────────────────────────────────────────────


def test_parse_blocks_simple_heading_paragraph():
    md = "# Title\n\nA paragraph of prose."
    blocks = parse_blocks(md)
    kinds = [b.kind for b in blocks]
    assert "heading" in kinds
    assert "paragraph" in kinds
    heading = next(b for b in blocks if b.kind == "heading")
    assert heading.level == 1
    assert heading.content == "Title"


def test_parse_blocks_recognizes_h2_h3():
    md = "## Section\n\nProse.\n\n### Subsection\n\nMore prose."
    blocks = parse_blocks(md)
    headings = [b for b in blocks if b.kind == "heading"]
    assert {h.level for h in headings} == {2, 3}


def test_parse_blocks_emits_frontmatter_block():
    md = "---\ntitle: Test\ndate: 2026-05-14\n---\n\nProse below."
    blocks = parse_blocks(md)
    assert blocks[0].kind == "frontmatter"
    assert "title: Test" in blocks[0].content


def test_parse_blocks_classifies_code_fences():
    md = "Some prose.\n\n```python\ndef foo():\n    pass\n```\n\nMore prose."
    blocks = parse_blocks(md)
    code_blocks = [b for b in blocks if b.kind == "code"]
    assert len(code_blocks) == 1
    assert "def foo()" in code_blocks[0].content
    assert code_blocks[0].meta.get("info") == "python"


def test_parse_blocks_recognizes_unordered_list_items():
    md = "Intro paragraph.\n\n- First item\n- Second item\n- Third item\n"
    blocks = parse_blocks(md)
    list_items = [b for b in blocks if b.kind == "list_item"]
    assert len(list_items) == 3
    assert list_items[0].content == "First item"
    assert list_items[0].list_marker == "unordered"


def test_parse_blocks_flags_inline_header_bullets():
    """Anti-AI tells #16: bullet items opening with **bold:** description."""
    md = (
        "- **First key:** description one\n"
        "- **Second:** description two\n"
        "- normal item without inline header\n"
    )
    blocks = parse_blocks(md)
    list_items = [b for b in blocks if b.kind == "list_item"]
    assert len(list_items) == 3
    assert list_items[0].starts_with_inline_header is True
    assert list_items[1].starts_with_inline_header is True
    assert list_items[2].starts_with_inline_header is False


def test_parse_blocks_strips_html_comments():
    md = "Real prose.\n\n<!-- a comment that should not appear --> More prose."
    blocks = parse_blocks(md)
    for b in blocks:
        assert "a comment that should not appear" not in b.content


# ─── extract_prose ─────────────────────────────────────────────────────────


def test_extract_prose_strips_code_blocks():
    md = (
        "Prose paragraph one.\n\n"
        "```python\nIMPORTANT_BUT_NOT_PROSE = 42\n```\n\n"
        "Prose paragraph two."
    )
    prose = extract_prose(md)
    assert "IMPORTANT_BUT_NOT_PROSE" not in prose
    assert "Prose paragraph one" in prose
    assert "Prose paragraph two" in prose


def test_extract_prose_preserves_paragraph_boundaries():
    md = "First paragraph.\n\nSecond paragraph."
    prose = extract_prose(md)
    assert "\n\n" in prose


def test_extract_prose_includes_headings():
    md = "# Chapter One\n\nOpening sentence."
    prose = extract_prose(md)
    assert "Chapter One" in prose
    assert "Opening sentence" in prose


def test_extract_prose_includes_list_items():
    md = "Intro.\n\n- Bullet one\n- Bullet two\n"
    prose = extract_prose(md)
    assert "Bullet one" in prose
    assert "Bullet two" in prose


def test_extract_prose_drops_frontmatter():
    md = "---\ntitle: Skip me\n---\n\nReal prose here."
    prose = extract_prose(md)
    assert "title: Skip me" not in prose
    assert "Real prose here" in prose
