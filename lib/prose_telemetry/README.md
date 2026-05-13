# prose-telemetry

Detect literary devices and looping patterns in chapter prose. CPU-tier
detectors run in-process; medium-tier detectors (isocolon, antithesis,
distributed chiasmus) use spaCy POS + dependency parsing.

## Setup

```bash
# One-time on a fresh machine:
brew install uv

cd galley/lib/prose_telemetry
uv venv --python 3.11 .venv
source .venv/bin/activate
uv pip install -e .
python -m spacy download en_core_web_sm
```

## Usage (from the venv)

```bash
# Measure a chapter
python -m prose_telemetry measure path/to/chapter.md

# Or import programmatically
python -c "
from prose_telemetry import measure_with_spacy
result = measure_with_spacy('path/to/chapter.md')
print(result['rollup']['verdict'])
"
```

## Architecture

This package extends the stdlib-tier handcount script at
`the-inverted-stack/build/prose_telemetry_handcount.py` with spaCy-tier
detectors that require POS tagging and dependency parsing:

- **isocolon** — parallel grammatical structure across consecutive clauses
- **distributed_chiasmus** — ABBA structure with lemma matching
- **antithesis_within_sentence** — opposing concepts joined within one clause
- **nominalization_density** — verbs converted to abstract nouns

The stdlib handcount produces the per-chapter `.prose-metrics.json` artifact;
this package can be invoked separately to *augment* that artifact with
spaCy-tier findings, or run end-to-end (calling the handcount via subprocess
plus its own analyzers).

See `.pao-inbox/_decisions/2026-05-08-prose-telemetry-platform.md` in the
book repo for the full architecture doc.

## Why a separate venv

spaCy + en_core_web_sm + thinc + blis weigh ~250 MB and require Python 3.10+.
Keeping this in its own venv inside galley/ isolates the dependency lifecycle
from the book repo's stdlib-only scripts. The handcount script in the book
repo still runs on system Python 3.9 without any installs.

## Files

- `pyproject.toml` — package definition + dependency pins
- `src/prose_telemetry/__init__.py` — public API
- `src/prose_telemetry/spacy_detectors.py` — POS/dependency-tier detectors
- `.venv/` — gitignored Python 3.11 environment
