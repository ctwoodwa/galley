# Architecture Decision Records — prose

Lightweight ADRs covering load-bearing decisions for `galley/prose/`. New ADRs are numbered sequentially. ADRs are immutable once Locked — supersession is preferred over revision.

## Index

| # | Title | Status | Source |
|---|---|---|---|
| [0001](0001-detector-meter-split.md) | Detector / meter split | Locked 2026-05-08 | port of `the-inverted-stack/.pao-inbox/_decisions/2026-05-08-prose-telemetry-platform.md` |
| [0002](0002-galley-as-editorial-home.md) | Galley as editorial home (recast) | Locked 2026-05-14 | port of `2026-05-14-prose-telemetry-galley-recast-upf` (this session's recast plan) |
| [0003](0003-freestylo-skipped.md) | FreeStylo skipped — license + coverage | Locked 2026-05-14 | port of FreeStylo evaluation spike (this session) |
| [0004](0004-mit-license.md) | Galley relicensed to MIT | Locked 2026-05-14 | this session |
| [0005](0005-prose-first-class-tool-family.md) | `prose/` as first-class tool family within galley | Locked 2026-05-14 | this session |
| [0006](0006-openapi-cross-stack.md) | OpenAPI schema as single source of truth | Locked 2026-05-14 | this session |
| [0007](0007-sunfish-local-first-editorial.md) | Galley as Sunfish editorial example — local-first commitments | Locked 2026-05-14 | this session |

## Format

Standard short-form template:

```markdown
# ADR-NNNN — Title

**Status:** Locked YYYY-MM-DD
**Supersedes:** ADR-MMMM (if applicable)
**Source:** path/to/original/decision-doc.md (if porting)

## Context
(1–2 paragraphs: what was the situation, what was the constraint)

## Decision
(1–2 paragraphs: what was decided, in active voice)

## Consequences
(what this enables, what it forecloses, what it costs)

## Notes
(optional: open questions, future re-evaluation triggers)
```

## When to write a new ADR

- A choice that affects more than one phase of the roadmap.
- A choice that closes off an alternative that would otherwise come up again.
- A license, architecture, or naming decision.
- A scope inclusion or exclusion that future contributors might re-debate.

Implementation details, threshold tuning, and detector-specific calibration do not require ADRs — they belong in CHANGELOG or in the relevant module's docstring.
