# prose-cli

Unified `prose` CLI for galley's prose tool family. Dispatches to:

- `prose measure <chapter.md>` → `prose-telemetry measure` (literary-device detectors + meters + verdict)
- `prose validate <chapter.md>` → `story-canon validate` (continuity validation against canon yaml)
- `prose extract <chapter.md>` → `story-canon extract` (dates / durations / ages / relationships dump)

This package adds no logic — it only routes `sys.argv` to the underlying CLI's `main()` and forwards all flags transparently. Each subcommand's `--help` describes its own flag set.

## Install

```bash
cd galley/prose/lib/prose_telemetry
uv venv --python 3.11 .venv
source .venv/bin/activate

# Editable installs into the shared venv:
uv pip install -e .                 # prose-telemetry
uv pip install -e ../story_canon    # story-canon
uv pip install -e ../../apps/cli    # prose-cli (this package)
python -m spacy download en_core_web_sm
```

After install, `prose` is on the venv's PATH:

```bash
prose measure /path/to/chapter.md
prose validate /path/to/chapter.md
prose extract /path/to/chapter.md
```

## License

MIT, inherited from galley root [`LICENSE`](../../../LICENSE).

## Status

Phase 0.5 — minimal subcommand dispatcher. Future work:
- `prose diff` — wraps `prose_telemetry_diff.py` once relocated in Phase 8
- `prose dashboard` — wraps `prose_telemetry_dashboard.py` once relocated in Phase 8
- `prose corpus` — wraps `prose_telemetry_corpus.py` once relocated in Phase 8
- `prose --book <id>` — book-profile selection once `BookProfile` lands in Phase 1
