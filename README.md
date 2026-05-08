# Galley

Editorial production platform for book publishing workflows + raw AI inference exploration.

A consolidated local-first app for authoring, audio production, image generation, and ePub / audiobook assembly + distribution. Talks to a local Express server for book content and a GPU server for inference.

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

See [`apps/web/SMOKE-TEST.md`](apps/web/SMOKE-TEST.md) for the URL + API verification checklist.

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
