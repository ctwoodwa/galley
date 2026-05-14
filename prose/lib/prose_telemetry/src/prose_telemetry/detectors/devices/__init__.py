"""Mid-complexity rhetorical-device detector pack.

Nine detectors covering A2 epistrophe, A3 symploce, B11 antimetabole,
D24 hypophora, D25 erotema, E28 prolepsis, E29 concession,
E30 distinctio, E32 definition-by-negation from the literary-devices
catalog. Each is implemented with regex + sentence segmentation (no
spaCy POS/dep parsing required in this phase — Phase 6+ can promote
specific ones to spaCy-tier if precision needs it).

Importing this package auto-registers all nine detectors under
family='literary_device', tier='stdlib'.
"""

from prose_telemetry.detectors.devices import (  # noqa: F401
    antimetabole,
    climax,
    concession,
    definition_by_negation,
    distinctio,
    epistrophe,
    erotema,
    hypophora,
    litotes,
    prolepsis,
    simile,
    symploce,
)

__all__ = [
    "antimetabole",
    "climax",
    "concession",
    "definition_by_negation",
    "distinctio",
    "epistrophe",
    "erotema",
    "hypophora",
    "litotes",
    "prolepsis",
    "simile",
    "symploce",
]
