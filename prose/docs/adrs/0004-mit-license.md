# ADR-0004 — Galley relicensed to MIT

**Status:** Locked 2026-05-14
**Supersedes:** (implicit) `Proprietary — galley`

## Context

`galley/lib/prose_telemetry/pyproject.toml` and `galley/lib/story_canon/pyproject.toml` previously declared `license = { text = "Proprietary — galley" }`. With multi-book ambition stated and a F/OSS sourcing landscape that's overwhelmingly permissive (spaCy MIT, textstat MIT, BookNLP MIT, vale MIT, proselint BSD-3, sentence-transformers Apache-2.0, pronouncing BSD-2, markdown-it-py MIT), the proprietary stance was producing license-compatibility friction without buying any defensive value — galley is editorial tooling for a small number of authors, not a network-effect SaaS that AGPL would protect.

## Decision

Galley is licensed MIT, repo-wide, effective 2026-05-14.

- Root `galley/LICENSE` — standard MIT text, `Copyright (c) 2026 C. T. Wood`.
- `galley/prose/lib/prose_telemetry/LICENSE` — same.
- `galley/prose/lib/story_canon/LICENSE` — same.
- Both `pyproject.toml` files updated to `license = { text = "MIT" }` + `license-files = ["LICENSE"]`.
- `galley/package.json` updated to add `"license": "MIT"`. `"private": true` retained (npm-publish guard, separate from licensing).

The proprietary-galley pyproject string is gone everywhere it appeared.

## Consequences

- All permissive-licensed dependencies (MIT, BSD-2/3, Apache-2.0, ISC, MPL-2.0) are cleanly consumable.
- LGPL-2.1 dependencies (notably LanguageTool) are usable via dynamic linking or subprocess without legal hygiene concerns.
- GPL-3.0 dependencies (FreeStylo, pyphen) remain incompatible with direct linkage — they would either taint galley's MIT label or require subprocess/HTTP isolation. ADR-0003 separately concludes FreeStylo isn't worth that complexity.
- The platform-doc-suggested promotion to `SunfishSoftware/prose-telemetry/` standalone repo (2026-05-08) is now legally unblocked. Not executed; reserved for the case where galley grows beyond one author / book.

## Notes

Trademark on the name "Galley" is a separate question from copyright on the code; kept reserved by default. NPM publish remains gated by `"private": true` until a deliberate publish decision is made. NOTICE file for Apache-2.0 dependencies (stanza, sentence-transformers) is added at the point those deps are actually integrated.

Other internal artifacts that may reference proprietary stance (e.g., `apps/web/` defaults, vendor hostnames, integration configs) are not audited as part of this ADR — the prose libs were the gating constraint.
