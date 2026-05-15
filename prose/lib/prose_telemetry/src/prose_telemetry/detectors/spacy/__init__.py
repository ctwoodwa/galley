"""spaCy-tier detector wrappers — registry-compatible.

The four spaCy detectors (`isocolon`, `distributed_chiasmus`,
`nominalization`, `antithesis_within_sentence`) live in
`prose_telemetry.spacy_detectors` and have historically run via the
legacy `analyze_chapter()` pipeline. The wrappers in this package
re-expose them through the central registry so:

  - They're discoverable via `discover(tier='spacy')`.
  - They participate in `dispatch.run_registry` like every other
    detector — preset scaling reaches them, `DetectorConfig.enabled`
    toggles them, and their findings flow into `registry_pipeline`.
  - Their config knobs (e.g. `min_run` for isocolon, `window` for
    distributed_chiasmus) become live values on `DetectorConfig.extra`
    via the per-book yaml.

Each wrapper expects a parsed spaCy `Doc` on the `doc` keyword — the
dispatch passes one when the spaCy pipeline is enabled. When no doc
is supplied the wrapper returns an empty list (spaCy-tier detectors
cannot run on raw text).

Importing this package auto-registers all four wrappers under
`tier='spacy'` with their original family (`literary_device` for
three of them, `anti_ai` is not applicable — antithesis is rhetorical).
"""

from prose_telemetry.detectors.spacy import (  # noqa: F401
    antithesis,
    distributed_chiasmus,
    isocolon,
    nominalization,
)

__all__ = ["antithesis", "distributed_chiasmus", "isocolon", "nominalization"]
