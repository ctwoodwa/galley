"""Markdown AST wrapper for galley/prose.

Wraps the MIT-licensed `markdown-it-py` parser into a typed-block API
suited to prose detectors. The two public entry points are:

- `parse_blocks(markdown)` — returns a list of `Block` objects classified
  by kind (heading, paragraph, code, list, blockquote, html, frontmatter).
- `extract_prose(markdown)` — returns only the prose-bearing content
  (paragraphs + list items + blockquotes), with code fences, frontmatter,
  and HTML stripped. Suitable as input to detectors that should not
  match against code.

Phase 2 ships the minimum API that downstream Phase 4 structural anti-AI
detectors (title-case heading, inline-header bullets, fragmented header)
need. The block list is the contract; new fields can be added to `Block`
non-breakingly.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from markdown_it import MarkdownIt
from markdown_it.token import Token


# ─── Block representation ──────────────────────────────────────────────────


@dataclass
class Block:
    """One top-level markdown block, classified by kind."""

    kind: str
    """One of: 'heading' | 'paragraph' | 'code' | 'list_item' |
    'blockquote' | 'html' | 'frontmatter' | 'thematic_break'."""

    content: str = ""
    """Text content with markup stripped — what a prose detector reads."""

    raw: str = ""
    """Original markdown source for this block (line-faithful)."""

    level: int | None = None
    """For headings: 1–6. None for non-heading blocks."""

    list_marker: str | None = None
    """For list items: 'ordered' or 'unordered'. None otherwise."""

    starts_with_inline_header: bool = False
    """True iff the block (typically a list_item) opens with bold-then-
    colon, like `**Key:** description`. Anti-AI tells #16 target."""

    line_range: tuple[int, int] = (0, 0)
    """1-indexed (start_line, end_line) in the source markdown."""

    meta: dict[str, Any] = field(default_factory=dict)
    """Reserved for future per-kind metadata."""


# ─── Frontmatter stripping ─────────────────────────────────────────────────


_FRONTMATTER_RE = re.compile(r"\A---\n(.*?)\n---\n", re.DOTALL)


def _strip_frontmatter(markdown: str) -> tuple[str, str | None]:
    """Return (markdown_without_frontmatter, frontmatter_text_or_None)."""
    m = _FRONTMATTER_RE.match(markdown)
    if not m:
        return markdown, None
    return markdown[m.end() :], m.group(1)


# ─── HTML comment stripping ────────────────────────────────────────────────


_HTML_COMMENT_RE = re.compile(r"<!--.*?-->", re.DOTALL)


def _strip_html_comments(markdown: str) -> str:
    return _HTML_COMMENT_RE.sub("", markdown)


# ─── Inline-text extraction ────────────────────────────────────────────────


def _inline_text(token: Token) -> str:
    """Concatenate the text-only children of an inline token."""
    if not token.children:
        return token.content or ""
    parts: list[str] = []
    for child in token.children:
        if child.type in ("text", "code_inline"):
            parts.append(child.content)
        elif child.type == "softbreak":
            parts.append(" ")
        elif child.type == "hardbreak":
            parts.append("\n")
        # Skip emphasis_open/close, strong_open/close — they wrap the
        # text children which we already collect.
        elif child.children:
            parts.append(_inline_text(child))
    return "".join(parts).strip()


def _detect_inline_header_bullet(content: str) -> bool:
    """True iff content opens with `**word(s):** ...` (anti-AI #16).

    Plain-text fallback when raw markdown isn't available. Note: this
    works on raw markdown text but NOT on already-rendered inline content
    (where the asterisks have been stripped). Use `_has_inline_header_pattern`
    on inline tokens for the parsed-AST case.
    """
    s = content.lstrip()
    return bool(re.match(r"\*\*[^*]+\*\*\s*:", s))


def _has_inline_header_pattern(inline_token: Token | None) -> bool:
    """True iff the inline token starts with a strong span that's
    immediately followed by a colon — covering both `**Key:**` (colon
    inside the bold) and `**Key**:` (colon after the bold). This is the
    AST-faithful version of `_detect_inline_header_bullet`.
    """
    if inline_token is None or not inline_token.children:
        return False

    children = inline_token.children
    # Skip leading whitespace-only text tokens.
    i = 0
    while (
        i < len(children)
        and children[i].type == "text"
        and not children[i].content.strip()
    ):
        i += 1
    if i >= len(children) or children[i].type != "strong_open":
        return False

    # Walk to the matching strong_close, capturing the last text inside it.
    depth = 1
    j = i + 1
    last_inner_text = ""
    while j < len(children) and depth > 0:
        if children[j].type == "strong_open":
            depth += 1
        elif children[j].type == "strong_close":
            depth -= 1
        elif children[j].type == "text" and depth > 0:
            last_inner_text = children[j].content
        j += 1
    if depth != 0:
        return False

    # Form A: colon inside the strong span — `**Key:**`.
    if last_inner_text.rstrip().endswith(":"):
        return True

    # Form B: colon immediately after the strong_close — `**Key**:`.
    if j < len(children) and children[j].type == "text":
        return children[j].content.lstrip().startswith(":")
    return False


# ─── Block parser ──────────────────────────────────────────────────────────


def parse_blocks(markdown: str) -> list[Block]:
    """Parse markdown into typed blocks.

    Frontmatter (YAML between leading `---` fences) is emitted as a single
    `frontmatter` block. HTML comments are stripped before parsing —
    they don't appear in the block list at all (per the book repo's
    convention of using comments for marker annotations like
    `<!-- CLAIM: source? -->`).
    """
    body, frontmatter = _strip_frontmatter(markdown)
    body = _strip_html_comments(body)

    blocks: list[Block] = []
    if frontmatter is not None:
        blocks.append(
            Block(
                kind="frontmatter",
                content=frontmatter,
                raw=frontmatter,
                line_range=(1, 1 + frontmatter.count("\n") + 1),
            )
        )

    md = MarkdownIt("commonmark")
    tokens = md.parse(body)

    # Track open list-item context so we can mark inline-header bullets.
    in_list_item = False
    list_marker: str | None = None

    for i, tok in enumerate(tokens):
        if tok.type == "heading_open":
            # The next token is inline (the heading text), then heading_close.
            inline = tokens[i + 1] if i + 1 < len(tokens) else None
            text = _inline_text(inline) if inline else ""
            level = int(tok.tag.lstrip("h"))
            blocks.append(
                Block(
                    kind="heading",
                    content=text,
                    raw=text,
                    level=level,
                    line_range=tok.map or (0, 0),
                )
            )
        elif tok.type == "paragraph_open" and not in_list_item:
            inline = tokens[i + 1] if i + 1 < len(tokens) else None
            text = _inline_text(inline) if inline else ""
            blocks.append(
                Block(
                    kind="paragraph",
                    content=text,
                    raw=text,
                    line_range=tok.map or (0, 0),
                )
            )
        elif tok.type == "fence" or tok.type == "code_block":
            blocks.append(
                Block(
                    kind="code",
                    content=tok.content,
                    raw=tok.content,
                    line_range=tok.map or (0, 0),
                    meta={"info": tok.info or ""},
                )
            )
        elif tok.type == "html_block":
            blocks.append(
                Block(
                    kind="html",
                    content=tok.content,
                    raw=tok.content,
                    line_range=tok.map or (0, 0),
                )
            )
        elif tok.type == "blockquote_open":
            # Blockquote contents are emitted as paragraph_open/close while
            # the blockquote is open. We don't double-emit — paragraph_open
            # outside of list-item context handles it.
            pass
        elif tok.type == "bullet_list_open":
            in_list_item = False  # reset; list_item_open will flip true
            list_marker = "unordered"
        elif tok.type == "ordered_list_open":
            in_list_item = False
            list_marker = "ordered"
        elif tok.type == "list_item_open":
            in_list_item = True
            # Find the immediately-following paragraph_open + its inline
            # children. Use the AST to detect the inline-header pattern —
            # `_inline_text` strips markup so we can't grep its result for
            # `**...**:`.
            j = i + 1
            text = ""
            inline = None
            while j < len(tokens):
                if tokens[j].type == "paragraph_open":
                    inline = tokens[j + 1] if j + 1 < len(tokens) else None
                    text = _inline_text(inline) if inline else ""
                    break
                if tokens[j].type == "list_item_close":
                    break
                j += 1
            blocks.append(
                Block(
                    kind="list_item",
                    content=text,
                    raw=text,
                    list_marker=list_marker,
                    starts_with_inline_header=_has_inline_header_pattern(inline),
                    line_range=tok.map or (0, 0),
                )
            )
        elif tok.type == "list_item_close":
            in_list_item = False
        elif tok.type == "hr":
            blocks.append(
                Block(
                    kind="thematic_break",
                    content="",
                    raw="---",
                    line_range=tok.map or (0, 0),
                )
            )
        # Skip everything else (paragraph_close, heading_close, inline
        # already-collected, etc.)

    return blocks


# ─── Prose-only extraction ─────────────────────────────────────────────────


# Block kinds that carry prose for detector consumption.
_PROSE_KINDS = {"paragraph", "list_item", "blockquote"}


def extract_prose(markdown: str) -> str:
    """Return only the prose-bearing content from a markdown document.

    Strips frontmatter, HTML comments, code blocks, raw HTML, and
    thematic breaks. Headings are preserved (they're prose). Paragraphs
    and list items are joined with double newlines so paragraph-aware
    aggregates (em-dash density, paragraph_length_anomaly) still see
    paragraph boundaries.
    """
    blocks = parse_blocks(markdown)
    chunks: list[str] = []
    for b in blocks:
        if b.kind == "heading":
            chunks.append(b.content)
        elif b.kind in _PROSE_KINDS:
            chunks.append(b.content)
    return "\n\n".join(c for c in chunks if c)
