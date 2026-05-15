"""Chain-loop detector pack — Phase 8 batch 2b.

Three per-paragraph repetition detectors migrated from
`prose_telemetry_handcount.py`:

  - `lexical_chain_loop`  — same content word repeated past a density
                            threshold within one paragraph.
  - `bigram_chain_loop`   — phrase-level (2-word) repetition.
  - `trigram_chain_loop`  — phrase-level (3-word) repetition.

Stopword model (Option A — book-aware):

  Each detector ships a *generic English* stopword default (function
  words, very common pronouns, plural variants). The per-book
  `book.editorial.yaml` can add domain-specific stopwords on top of
  the defaults via:

    detectors:
      lexical_chain_loop:
        stopwords:
          - consortium      # Anna-voice register, not loop
          - architecture
      bigram_chain_loop:
        extra:
          stopword_bigrams:
            - ["staff", "history"]
      trigram_chain_loop:
        extra:
          stopword_trigrams:
            - ["the", "staff", "history"]

  The detector merges `defaults | yaml.stopwords` at run time.

Importing this package auto-registers all three under
`family='literary_device', tier='stdlib'`.
"""

from prose_telemetry.detectors.chain import (  # noqa: F401
    bigram_chain,
    lexical_chain,
    trigram_chain,
)

__all__ = ["bigram_chain", "lexical_chain", "trigram_chain"]
