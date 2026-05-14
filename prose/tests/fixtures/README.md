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
