# galley/prose/tests/fixtures

Synthetic prose fixtures used to validate the prose pipeline without depending
on any real book repo. The two non-book fixtures (`non_book_a/`, `non_book_b/`)
are the operational definition of multi-book support: if both produce sensible,
profile-distinct findings against their own `book.editorial.yaml`, the pipeline
is portable.

## Layout

```
fixtures/
├── README.md
├── non_book_a/
│   ├── book.editorial.yaml          — strict thresholds; literary-fiction
│   └── sample.md                    — short prose with deliberate anaphora + filler
├── non_book_b/
│   ├── book.editorial.yaml          — loose thresholds; technical-nonfiction
│   └── sample.md                    — short prose with copula avoidance + signposting
└── (inverted_stack/                  — added in Phase 2 for parity-regression)
```

## Adding a fixture

1. Create a directory under `fixtures/` named like a `book_id`.
2. Drop a `book.editorial.yaml` matching [`../../books/_schema.yaml`](../../books/_schema.yaml).
3. Drop one or more `*.md` files containing the prose to exercise.
4. Reference the fixture from a test in `../tests/`.

## What the existing fixtures cover

- **non_book_a** — calibrated for catching anaphora cascades and filler-word
  density. Strict thresholds (warning at low counts). Use to verify that strict
  profiles produce more findings than loose ones on the same prose.

- **non_book_b** — calibrated for catching anti-AI copula avoidance and
  signposting tells. Loose thresholds (warning at high counts). Use to verify
  the same detector with different config produces different findings.

## Known false positive — Claude Code security-guidance hook

When the Claude Code `claude-plugins-official:security-guidance` plugin is
active, its security-reminder hook does a **bare substring match** on file
contents before Write/Edit operations. The match is not language-,
context-, or word-boundary-aware, so it blocks writes containing certain
literal substrings even when the surrounding context is plainly innocuous
(Markdown prose, YAML config, literary examples).

This was discovered the hard way while writing the alliteration test
fixtures in this directory: the canonical "/P/" alliteration example
contains a substring that matches the Python-serialization-module rule.
A separate write attempt for the upstream-PR draft (`galley/docs/upstream-prs/`)
hit the same problem when trying to *describe* what the hook checks for.

**Project convention for galley test fixtures:** when writing prose
samples that need alliteration or other phoneme-level patterns, choose
example words and phrases that don't include the literal trigger
substrings the hook scans for. Equivalent alliteration is easy to
construct with other consonants or other initial letters:

| Phoneme | Substitute example |
|---|---|
| `/P/` | "Peter Piper plucked plump peppers" |
| `/S/` | "Sally sold seven small seashells beside the silent seashore" |
| `/B/` | "Brisk brown bears boldly battled beside the brook" |

Phoneme-detection logic is unchanged by the substitution; only the
example words differ.

A more permanent fix lives at the hook level. See
[`../../../docs/upstream-prs/security-guidance-substring-matching.md`](../../../docs/upstream-prs/security-guidance-substring-matching.md)
for the draft upstream proposal: make the substring matcher
context-aware (word-boundary regex + file-extension gating +
import-presence gating + optional project-side allow-list).
