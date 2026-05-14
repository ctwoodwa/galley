"""Inline-header bullet detector (anti-AI tell #16).

Bulleted list where every item starts with a bolded header followed
by a colon followed by a one-sentence description. The format is not
wrong — it is just so default-LLM that it signals provenance.

Detection uses `markdown_ast.parse_blocks()` directly; the per-block
`starts_with_inline_header` flag is already computed there (handles
both `**Key:**` and `**Key**:` forms). This detector aggregates: it
flags lists where ≥ N consecutive items carry the flag (default N=3).
"""

from __future__ import annotations

from typing import Any

from prose_telemetry._common.registry import register
from prose_telemetry._common.types import DetectorConfig, Finding
from prose_telemetry.markdown_ast import parse_blocks


_DEFAULT_MIN_CONSECUTIVE = 3


@register(
    name="inline_header_bullets",
    tier="structural",
    family="anti_ai",
    description=(
        "List with 3+ consecutive items opening with **Bold:** "
        "headers (anti-AI #16). Tells default-LLM provenance."
    ),
    metadata={
        "min_consecutive_default": _DEFAULT_MIN_CONSECUTIVE,
        "anti_ai_id": "#16",
    },
)
def detect_inline_header_bullets(
    prose: str,
    *,
    config: DetectorConfig,
    doc: Any = None,
    api_client: Any = None,
) -> list[Finding]:
    if not config.enabled or not (prose or "").strip():
        return []

    min_n = int(
        config.extra.get("min_consecutive", _DEFAULT_MIN_CONSECUTIVE)
    )

    findings: list[Finding] = []
    blocks = parse_blocks(prose)
    run: list[int] = []  # indices of consecutive list_item blocks with inline header

    def flush_run():
        if len(run) >= min_n:
            first = blocks[run[0]]
            last = blocks[run[-1]]
            # Spans from markdown_ast.line_range are line-based; we
            # surface the joined text rather than try to derive char
            # offsets at this layer.
            text = "\n".join(blocks[i].content for i in run)
            findings.append(
                Finding(
                    type="inline_header_bullets",
                    confidence=0.85,
                    rule_id="structural:inline_header_bullets",
                    span=None,
                    text=text,
                    extra={
                        "family": "anti_ai",
                        "anti_ai_id": "#16",
                        "consecutive_count": len(run),
                        "first_line": first.line_range[0],
                        "last_line": last.line_range[1],
                    },
                )
            )

    for i, block in enumerate(blocks):
        if block.kind == "list_item" and block.starts_with_inline_header:
            run.append(i)
        else:
            flush_run()
            run = []
    flush_run()
    return findings
