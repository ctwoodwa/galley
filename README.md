# Galley

Editorial production platform for book publishing workflows.

## Apps
- `apps/web` — React SPA (reader, review, queue, studio)
- `apps/api` — Windows GPU API (TTS, STT, image, music)
- `apps/menubar` — macOS launcher/controller

## Services
- `services/book-server` — Mac-local Express server (chapters, audio, review session)
- `services/python-workers` — Python TTS/STT/image/music workers

## Setup
1. Copy `integrations/the-inverted-stack/sync.config.example.json` → `sync.config.json` and set your book repo path
2. `pnpm install`
3. `pnpm dev`
