# galley/prose/books — book profile registry

Per-book configuration for the prose pipeline. Each profile is a yaml file
matching the schema in [`_schema.yaml`](_schema.yaml) and describes:

- **Voice identity** — drives Anna-style calibration when set.
- **Per-detector overrides** — thresholds, stopwords, motif caps,
  per-lemma soft caps, reduced-confidence lemmas, held-lines pointer.
  Detectors not mentioned use built-in defaults. See **Gradient
  thresholds** below.
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

## Gradient thresholds

A binary `stopwords: [foo, bar]` list throws away too much information.
A word like `mission` or `question` is content vocabulary up to some
reasonable count, then becomes over-use beyond it. Binary "always
count" over-flags interview / domain-heavy chapters; binary "always
ignore" hides genuine over-use. Two detectors now use **gradient
thresholds** instead of binary stopword sets:

### `nominalization` — per-lemma soft caps

Each lemma has a maximum-content count. Occurrences up to and including
the cap are treated as content vocabulary and not emitted. Occurrence
`#(cap+1)` and beyond fire as findings with `occurrence_index` and
`over_cap_by` in the payload so downstream tools see exactly which
mentions are over-use and by how much.

```yaml
detectors:
  nominalization:
    extra:
      soft_caps:
        mission: 12      # heavy mention expected for this book's subject
        partition: 8     # technical term central to the architecture
        protocol: 8
        recruitment: 4   # chapter title — mentioned beyond 4 = over-use
```

The detector ships with built-in defaults for common abstract nouns
(`question: 8`, `conversation: 5`, `decision: 5`, `moment: 8`,
`information: 4`, etc.) so a new book gets sensible behavior with no
configuration. Book overrides layer on top and override individual
default entries by lemma.

For backwards compatibility, the legacy `stopwords: [foo, bar]` form
is still accepted — bare-string entries are treated as `{lemma: 999}`
(effectively unlimited / always-content).

### `distributed_chiasmus` — reduced-confidence pairs

Chiasmus is a one-shot detection (the ABBA structure either exists or
doesn't), so a soft-cap doesn't fit. Instead, pairs touching a
reduced-confidence lemma are still detected but emit at confidence
`0.4` instead of `0.7`. The finding stays in the JSON for inspection;
the verdict layer uses **high-confidence count only** for the warning
trigger.

```yaml
detectors:
  distributed_chiasmus:
    stopwords:
      - record           # held closing chant — record/speak is deliberate
      - speak
      - printout         # interview prop staging
      - office
      - counter
```

The detector ships with built-in reduced-confidence lemmas covering
universal cross-pair noise:

- speech-act verbs: ask, answer, say, tell, speak, talk
- cognition verbs: think, know, remember, notice, wonder, decide
- motion verbs: come, go, walk, run, turn, move, leave, arrive
- perception verbs: look, see, hear, watch, listen
- common action verbs: take, give, put, get, make, do
- state verbs: be, have, wait, stand, sit, stop
- temporal nouns: time, minute, hour, day, night, year, moment
- body parts: hand, eye, foot, head, face, voice
- generic narrative nouns: thing, way, place, person, word, name, ...

A new book inherits all of these automatically. Book overrides extend
the set with domain-specific staging vocabulary.

### Why two different mechanisms

| Detector type | Gradient mechanism | Why |
|---|---|---|
| Occurrence-counted (nominalization, lexical_chain) | **soft cap** per lemma | Counts naturally; "first N free, flag the rest" maps directly to content-vs-overuse |
| One-shot detection (chiasmus) | **reduced confidence** per lemma touching | Each match is a discrete event; weighting it preserves the signal without false-suppress |

Both approaches preserve every match in the findings array so authors
can audit. The verdict layer's job is to decide which findings are
worth flagging — not to throw them away.

### Output payload

After gradient processing, the per-detector metric record carries
multiple counts so downstream tools can pick the granularity they need:

```json
{
  "device": "distributed_chiasmus",
  "raw_count": 23,                        // all detected pairs
  "high_confidence_count": 0,             // genuine ABBA rhetoric only
  "weighted_count": 13.14,                // sum of confidence ratios
  "count_per_1k_tokens": 3.73,
  "high_confidence_per_1k_tokens": 0.0
}
```

```json
{
  "device": "nominalization",
  "raw_count": 63,                        // over-cap occurrences
  "count_per_1k_tokens": 10.22
}
```

Individual findings carry `occurrence_index`, `soft_cap`, `over_cap_by`
(nominalization) or `is_common_content_pair` (chiasmus) so a UI can
show which specific occurrences exceeded a per-lemma threshold and by
how much.

## ADR pointers

- [ADR-0005](../docs/adrs/0005-prose-first-class-tool-family.md) — why
  this directory exists at the tool-family root rather than deeper.
- [ADR-0007](../docs/adrs/0007-sunfish-local-first-editorial.md) — why
  `compute.remote_base_url` always means a user-owned server.
