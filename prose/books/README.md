# galley/prose/books — book profile registry

Per-book configuration for the prose pipeline. Each profile is a yaml file
matching the schema in [`_schema.yaml`](_schema.yaml) and describes:

- **Voice identity** — drives Anna-style calibration when set.
- **Per-detector overrides** — thresholds, stopwords, motif caps, held-lines
  pointer. Detectors not mentioned use built-in defaults.
- **Compute routing** — CPU / local GPU / user-controlled remote, per
  ADR-0007 local-first commitments.

## How a book registers

Two ways a book profile becomes available:

1. **Registry copy (canonical):** drop a yaml file in this directory named
   `<book-id>.yaml`. This is the version galley's tests, dashboards, and
   corpus tools consult.

2. **Book-repo copy (working):** the book repo ships a `book.editorial.yaml`
   at its root. The `prose` CLI auto-detects this by walking up from the
   chapter path.

Convention: when a book reaches a stable phase, the registry copy mirrors
the working copy. Until then, the working copy is the source of truth and
the registry entry can be a minimal stub pointing at the book's identity.

## Adding a new book

1. Choose a stable `book_id` (directory-friendly slug, e.g.
   `the-inverted-stack`, `nightingale-protocols`).

2. Copy `_schema.yaml` field-by-field into a new `<book-id>.yaml`,
   keeping only the fields your book actually overrides.

3. Minimum useful profile:

   ```yaml
   book_id: my-book
   voice: null               # or 'my-narrator-name'
   genre: literary-fiction
   held_lines_dir: null      # or 'path/relative/to/repo-root'
   compute:
     gpu_mode: auto
     remote_base_url: null   # local-only by default
   detectors: {}
   ```

4. Verify the profile loads:

   ```bash
   python -c "
   from prose_telemetry._common.types import BookProfile
   p = BookProfile.from_yaml('galley/prose/books/my-book.yaml')
   print(p.book_id, p.voice, p.compute.gpu_mode)
   "
   ```

5. (Phase 1+) Run editorial tests against the profile to confirm
   detector dispatch picks it up.

## Existing profiles

| File | Book | Voice | Notes |
|---|---|---|---|
| [`the-inverted-stack.yaml`](the-inverted-stack.yaml) | The Inverted Stack | Anna | First customer. Phase 1 stub; full Anna calibration extraction lands in Phase 4 per [`../ROADMAP.md`](../ROADMAP.md). |

## Schema validation

The [`_schema.yaml`](_schema.yaml) file is JSON Schema (Draft 7). Phase 1's
loader does loose validation (missing-field tolerance, type checking on
the fields it knows about). Strict validation tightens in later phases as
the field set stabilizes.

To validate by hand:

```bash
# Install ajv-cli once (Node.js); or use any JSON Schema validator.
npx ajv-cli validate -s _schema.yaml -d my-book.yaml
```

## ADR pointers

- [ADR-0005](../docs/adrs/0005-prose-first-class-tool-family.md) — why
  this directory exists at the tool-family root rather than deeper.
- [ADR-0007](../docs/adrs/0007-sunfish-local-first-editorial.md) — why
  `compute.remote_base_url` always means a user-owned server.
