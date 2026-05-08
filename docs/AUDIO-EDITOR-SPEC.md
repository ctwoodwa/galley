# Audio-First Prose Editor — Spec

Galley's reader is being rebuilt as an audio-first editing surface for the
creator (not a consumer ebook reader — those exist). The audio is the primary
"reading" interface (think accessibility-aligned, ear-first); editing is the
primary task. The page is for localization (which sentence) and edit mechanics;
the ears do the reading.

## Locked design decisions

| Decision | Choice |
|---|---|
| Primary interface for reading | Audio (continuous playback) |
| Primary task | Editing prose + audio render state |
| Granularity | Sentence (matches the audio chunks) |
| Voice model | One voice per chapter |
| Render tiers | Remote Kokoro (GPU, fast) = edit-loop preview; Remote Chatterbox = ship voice; Local Kokoro Docker = backup only |
| Auto-scroll | Eased; current sentence stays in view |
| Chapter advance | Audiobook-style auto-advance |
| Undo | Per-edit (each sentence-commit = one undo step) |
| Stale audio behavior | Play old audio + soft chime; regen runs in background |
| Edit-while-listening | Pause-on-focus (cursor entering an editable sentence pauses audio) |
| Edit commit boundary | **Explicit ⌘↵ only** — typing, blur, Esc do NOT commit. ⌘↵ commits + queues render |
| Begin-listening flow | **Splash with options:** ▶ Resume from sentence X · ▶ From start · ▶ Browse |
| Mark-for-review queue | **Reuses existing `/review` panel** — flags are short-bodied comments under the hood |
| Selection while listening | Selection alone does NOT pause; opening textarea / starting to type DOES pause |
| Stale-audio chime sound | Tone-pitched whoosh (~0.4s, fades). Off-toggleable. |

## Foundation that already exists

The Inverted Stack's build system already provides the data model:

- **Content-addressed chunk cache** (`build/audiobook.py:1293`):
  ```
  cache_key = sha256(model | voice | speed | exaggeration | cfg | temp | text)[:24]
  build/output/audiobook/_chunk_cache/<key>.mp3
  ```
- **Per-chunk alignment JSON** at `chapters/_voice-drafts/_alignments/<chapter>.json`:
  each entry has `chunk_id`, `chunk_index`, `text`, `source_text`, `is_pause`,
  `start_seconds`, `end_seconds`, `duration_seconds`.
- **EPUB 3 Media Overlays generator** (`build/build_overlays.py`): already
  injects `<span class="overlay-fragment" id="...">` into EPUB output and
  generates SMIL files. We're consuming the same data structure in-app.

Editing one sentence changes its text → changes the cache key → cache miss
→ that one chunk re-renders. Other chunks are cache hits. **The build system
can already do surgical edit-driven regen; galley just needs to drive it.**

## UI shape

```
┌──────────────────────────────────────────────────────────┐
│  [chapter content, eased auto-scroll]                    │
│                                                          │
│   Some sentence here. ●  ← stale dot (queued)            │
│   ▌Another sentence — being read now (audio cursor)      │
│   The one after.                                         │
│                                                          │
└──────────────────────────────────────────────────────────┘
┌── floating reader bar ───────────────────────────────────┐
│ ⏯ ◀▶ ◀◀▶▶ │ Ch 3 · ¶ 14 · 3/6 · 1.0× │ 🎙 │ 📌 (3) ✎ ▼  │
└──────────────────────────────────────────────────────────┘
```

- **Persistent floating reader bar** — primary control surface
- **Per-sentence margin dot** — render state (clean/stale/rendering/failed/edited-this-session)
- **Hover-reveal sentence chrome** — `▶ ✎ 💬 🎙` icons fade in on hover
- **Selection floater** — unified action menu when text is selected (edit, dictate-replace, comment, render now, queue render, voice-as)

## Key gestures

| Gesture | Action |
|---|---|
| `Space` | Play / pause (also: stop-and-localize selection floater on current sentence) |
| `←` / `→` | ±1 sentence |
| `Shift + ← / →` | ±1 paragraph |
| `R` | Repeat last sentence (back-stack: hold to scrub back) |
| `B` | Bookmark / mark-for-review (creates empty-bodied comment on current sentence) |
| `⌘ Z` | Undo last sentence-edit |
| `⌘ ↵` | Commit the current edit |
| Click a sentence | Pauses audio, places cursor (or enters edit mode if already focused) |
| Type a key while edit-cursor in a sentence | Sentence becomes editable; audio paused |
| `Esc` | Cancel current edit (revert sentence, no commit) |
| `Tab` / blur | Move focus, but does NOT commit (unsaved edits remain) |
| `⌘ Shift D` (global) | Dictate-to-comment on current sentence (uses Phase 11 DictationButton) |

## Render-now vs queued

When committing an edit, two paths via the selection floater:

- **Render now** — audio playback waits at this sentence until the new render lands. Used when "I want to hear it right now".
- **Queue** (default on edit-blur) — render runs in the background. When playback reaches the stale sentence, soft chime plays, then the OLD audio plays through. The new render replaces the audio without interrupting once ready.

## Stale audio chime

- Sound: tone-pitched whoosh (~0.4s, fades). Off-toggleable in settings.
- Fires once per stale sentence per playback (no spam during loops).
- Visual indicator stays on the margin until render lands.

## Phasing

| # | Phase | Deliverable | Approx |
|---|---|---|---|
| A | book-server APIs | alignment / staleness / chunk-stream / regen endpoints | ~5h |
| B | Sentence layer | ChapterView refactored to alignment-driven spans | ~5h |
| C | ReaderBar | Floating bar + sentence-shuttle + auto-scroll + auto-advance | ~6h |
| D | Listening loop | Stop-and-localize, repeat, mark, resume | ~4h |
| E | Edit loop | Sentence chip + commit + queued regen + per-edit undo | ~6h |
| F | Stale + chime | Play-old + chime; render-now waits | ~3h |
| G | Dictate-to-comment | Global hotkey, audio-attached comments | ~3h |
| H | Render-now vs queued | UI + queue surfacing | ~4h |
| I | Polish | Chime library, marked list, render-all-stale gate | ~4h |
|   | **Total** | | **~40h** |

Phases A + B unlock click-to-play + visible state.
Phases C + D give the listening reader experience.
Phases E + F + G + H complete the edit loop.
Phase I is polish.

## Out of scope (for now)

- Per-sentence voice assignment (one voice per chapter is the current reality)
- Voice variant A/B comparison (chunk cache supports it; not in v0)
- Cross-device sync of listen position
- "Quick local-Kokoro draft to fill stale gaps" (option D from earlier brainstorm; defer)
- Inline markdown editor outside of sentence chips (keep edits sentence-scoped)
- Diff view between markdown revisions (Git already does this; can layer later)

## Architecture notes

- `services/book-server` orchestrates; the Mac-local Express server already
  serves chapter audio + jobs.
- Partial regen worker wraps `the-inverted-stack/build/audiobook.py`, which
  is already chunk-cache-aware (no synthesis change needed; just orchestration
  + alignment update + chapter restitch).
- Render queue uses the existing `/api/queue` infrastructure (jobQueue +
  stagedQueue + serializeQueue + SSE broadcast). New job type:
  `regen-chunks { bookId, chapterSlug, chunk_ids[] }`.
- Frontend talks to book-server (not directly to the Windows TTS server)
  for everything sentence-scoped — book-server has the alignment data, the
  filesystem chunk cache, and the chapter manifest.
