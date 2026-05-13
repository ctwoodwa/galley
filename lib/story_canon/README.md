# story-canon

Continuity verification for fiction. Extracts factual claims (dates,
durations, ages, relationships) from chapter prose and reconciles them
against a story-canon YAML.

## What it catches

| Bug family | Caught? |
|---|---|
| **Date / duration math** ("93 days since Nov 4" when Nov 4 → Feb 14 = 102 days) | ✅ |
| **Age contradictions** (canon says Diana is 5; prose says "Diana, age six") | ✅ (with canon) |
| **Relationship inventory** (catalogs every "my brother / her father" mention for review) | ✅ |
| **Date claims without canon support** (date in prose not in canon timeline) | ⚠ informational |
| **Knowledge-state contradictions** ("did not know" vs "had been told") | ❌ semantic |
| **Implied-but-not-stated contradictions** | ❌ needs reasoning |

The tool is deterministic and stdlib-friendly. Catches numerical /
entity-level contradictions reliably; semantic contradictions require
author review (which the inventory report supports).

## Setup

```bash
cd galley/lib/story_canon
# Reuses the prose_telemetry venv (Python 3.11 + uv)
uv pip install --python ../prose_telemetry/.venv/bin/python -e .
```

Or create a fresh venv:

```bash
uv venv --python 3.11 .venv
source .venv/bin/activate
uv pip install -e .
```

## Usage

```bash
# Validate a chapter against its auto-detected canon
story-canon validate vol-2/act-1/ch01-departure.trial.md

# Or with explicit canon path
story-canon validate <chapter.md> --canon <canon.yaml>

# Just extract facts without validation (useful for first-pass canon building)
story-canon extract vol-2/act-1/ch01-departure.trial.md

# Machine-readable JSON
story-canon validate <chapter.md> --json
```

## Canon YAML schema

See `vol-2/_series/canon.yaml` in the-inverted-stack repo for a worked
example. Top-level keys the validator reads:

- `timeline.chapter_date` — present-tense date of the chapter
- `timeline.*` — other fixed dates
- `characters.<name>.age` — character age (validated against prose)
- `characters.<name>.relationships.*` — relationship facts
- `objects.*` — object specs (validator reports inventory)
- `places.*`, `mission.*`, `events.*` — informational; future schema

The validator only consults keys it knows. Additional notes are safe
to add for the author's own reference.

## Auto-detection

If `--canon` is omitted, the validator walks up the directory tree
from the chapter looking for:
  - `_series/canon.yaml`
  - `canon.yaml`
  - `_bookshelf/canon.yaml`

## Phase 2 roadmap (not yet implemented)

- spaCy-based entity extraction (better than regex for relationships)
- Cross-chapter canon-state propagation
- Knowledge-state tracking (per-character, per-event)
- Web dashboard rendering of all canon facts and prose mentions
- Auto-canon-population from chapter prose (with author review)
