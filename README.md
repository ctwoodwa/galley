# Galley

**A local-first, self-hosted editorial production platform** — built on Sunfish architecture principles for book publishing workflows. Authoring, prose analysis, audio production, image generation, and ePub / audiobook assembly all run on the user's own machine, with optional routing to user-controlled remote compute when a GPU is needed. No third-party SaaS dependencies for core functionality.

See [`docs/architecture/galley-platform-spec.md`](docs/architecture/galley-platform-spec.md) for the full twelve-capability scope (prose & world editor, story bible, script/dialogue, EPUB/audiobook, graphic novel layout, storyboard/keyframes, animatic/timing, visual style/NPR, scene graph, voice & interaction, output/render, integration & API). Each capability is local-first by default with explicit per-slot opt-in cloud plugins.

Talks to a local Express server for book content and an optional GPU server (user-deployed) for inference. The device is the truth; the network is an optimization.

Galley grows by tool family — each addressing one editorial medium with the same internal pattern. See [`prose/`](prose/) for the first family (prose analysis: literary-device detection, anti-AI-tell catching, continuity validation). Future families: `speech/` (TTS/STT-driven editing), `comics/`, `video/`.

## Surfaces

The app has two complementary surfaces over the same backends:

| Surface | URL | Purpose |
|---|---|---|
| **Editorial** | `/library` → `/read/:bookId/...` | Chapter-aware book editing: library, reader, review/comments, render queue, build logs, chapter-aware studio |
| **Inference Studio** | `/inference/...` | Raw API exploration: TTS / STT / Image / Music — not chapter-aware |

Backends:
- **local Express** (`services/book-server` on `:3080`) — chapter content, jobs, MP3 ID3 tags
- **Remote GPU API** (`http://desktop-umt08rn:8881` by default) — TTS (Kokoro / Chatterbox), STT, image generation (ComfyUI), music library

Settings drawer in the inference studio header lets you change the API base URL + Bearer token (persisted in localStorage).

## Layout

```
apps/
├── web/                      Vite + React 19 + TypeScript + Tailwind + shadcn/ui
├── api/                      Windows GPU API (TS stub)
└── menubar/                  macOS launcher (Swift)

packages/
├── api-client/               Typed clients for Windows API (TTS, Image, Music)
├── ui/                       (shared UI scaffold)
├── types/                    (shared types scaffold)
├── hooks/                    (shared hooks scaffold)
├── config/                   (config scaffold)
├── markdown/                 (markdown scaffold)
├── app-shell/                (shell scaffold)
├── editorial-domain/         (editorial domain scaffold)
├── reader-domain/            (reader domain scaffold)
├── production-domain/        (production domain scaffold)
└── media-tools-domain/       (media-tools domain scaffold)

services/
├── book-server/              Mac-local Express server (chapters, jobs, MP3 tags)
└── python-workers/           Python TTS / STT / image / music workers

prose/                        Tool family: prose analysis (see prose/README.md)
├── lib/prose_telemetry/      Literary-device detectors + meters + verdict + held-lines
├── lib/story_canon/          Continuity validators (dates, durations, ages, relationships)
├── apps/                     CLI, dashboard, vale-bridge, corpus tooling (filling in by phase)
├── books/                    Per-book profile registry
├── docs/                     Architecture, integration, BOOK-CONFIG schema, ADR trail
└── tests/                    Fixtures + reference corpus

(speech/, comics/, video/ reserved as sibling tool families)

integrations/
└── the-inverted-stack/       Book repo sync config
```

## Stack

- **React 19** + **TypeScript** + **Vite 6**
- **Tailwind 3** + **shadcn/ui** (Radix-based components, copy-paste)
- **TanStack Query v5** for server state (health polling, fetch caching)
- **Zustand** with `persist` middleware for cross-page client state (API config)
- **react-router-dom 7** for routing
- **Vitest 4** + **Testing Library** for unit/component tests
- **pnpm + Turbo** workspace

## Setup

```bash
pnpm install
```

Optional one-time:
- Copy `integrations/the-inverted-stack/sync.config.example.json` → `sync.config.json` and set your book repo path (book-editing features only).

## Dev

```bash
pnpm dev
```

Vite serves `http://localhost:5173`. The book-server starts via Turbo if it's wired into your `turbo.json` dev pipeline; if not, run it separately with `pnpm --filter @galley/book-server dev`.

See [`docs/SMOKE-TEST.md`](docs/SMOKE-TEST.md) for the URL + API verification checklist, and [`docs/AUDIO-EDITOR-SPEC.md`](docs/AUDIO-EDITOR-SPEC.md) for the audio-first prose editor design + phase plan.

## Test

```bash
pnpm --filter @galley/web test          # web component tests
pnpm --filter @galley/api-client test   # API client unit tests
```

## Build

```bash
pnpm build
```

## Future work

The current scope (editorial + inference studio + base settings) is the foundation. The longer-horizon production pipeline — already discussed but NOT yet built — includes:

- **Per-chapter cover-art generation** tied to the render manifest (vs. the current free-form Image panel)
- **STT-as-QC**: auto-transcribe generated audio + diff against source text
- **Music timeline editor** for adding beds / intros / outros to audiobook chapters
- **ePub final-assembly pipeline**: TOC + frontmatter + chapters + cover → polished ePub
- **Audiobook final-assembly**: chapter MP3s + music + intro/outro → polished M4B/MP3 with chapter markers + Whisper-based final review
- **Pre-publish review gate**: explicit sign-off + version-lock before distribution
- **Distribution adapters**: Leanpub / ACX / retailer-specific packaging + upload

These are separate workstreams to scope when ready.

## Notes

- **React parity** for the inference panels (e.g., a React `SunfishChat`-style consolidation in another framework) is explicitly deferred per CO directive 2026-05-08. Today's consolidation is React-only.
- **Two API tiers**, both relevant: the editorial flow goes through `book-server` (chapter context + job orchestration); the inference studio talks to the Windows API directly. Same backends, different UX.
