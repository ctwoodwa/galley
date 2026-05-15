"""Detector packs for galley/prose.

Importing this package imports every sub-package below, which triggers
the `@register(...)` decorator on each detector. After this import,
`_common.registry.discover()` returns the full set of production
detectors.

Sub-packages:

- `anti_ai_lexical/` — regex-driven lookup detectors for the anti-AI-tells
  catalog. One LexicalLookupDetector class + N yaml data files; each
  yaml registers as its own named detector via the central registry
  (family='anti_ai', tier='lexical').
- `anti_ai_structural/` — markdown-AST-driven detectors: -ing tail-
  phrases, rule-of-three density, false ranges, inline-header bullets,
  title-case headings, fragmented headers.
- `devices/` — mid-complexity literary devices (Phase 5/6): epistrophe,
  symploce, antimetabole, hypophora, erotema, prolepsis, concession,
  distinctio, definition-by-negation, simile, litotes, climax.
- `sonics/` — phoneme-level alliteration / assonance / consonance via
  the `pronouncing` library + CMU dict.
- `voice/` — Anna-decoupled detectors driven by BookProfile config:
  filter_words, motif_overuse, self_referential_frame.
- `integrations/` — third-party detector adapters (proselint).
"""

# Side-effect imports: each module's @register decorators fire when
# the module is loaded. `noqa: F401` suppresses unused-import warnings.
from prose_telemetry.detectors import anti_ai_lexical  # noqa: F401
from prose_telemetry.detectors import anti_ai_structural  # noqa: F401
from prose_telemetry.detectors import devices  # noqa: F401
from prose_telemetry.detectors import sonics  # noqa: F401
from prose_telemetry.detectors import voice  # noqa: F401
from prose_telemetry.detectors import integrations  # noqa: F401
from prose_telemetry.detectors import spacy  # noqa: F401  spaCy-tier wrappers
from prose_telemetry.detectors import classical_rhetoric  # noqa: F401  Phase 8 batch 1
from prose_telemetry.detectors import repetition  # noqa: F401  Phase 8 batch 2a
