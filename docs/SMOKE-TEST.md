# Galley Smoke Test

Quick checks to verify the consolidated app is wired correctly after the
inference-studio merge.

## Prereqs

- Mac on the same network as the Windows inference host (`desktop-umt08rn`)
- `pnpm install` from the galley root
- Windows API running at `http://desktop-umt08rn:8881` (verify with `curl http://desktop-umt08rn:8881/api/v1/health` — should return `{"status":"ok","model_loaded":true,...}`)
- Optional: book-server running on `http://localhost:3080` for the editorial features

## Run

```bash
pnpm --filter @galley/web dev
# Vite serves http://localhost:5173
```

## Verify

| URL | Expected |
|---|---|
| `http://localhost:5173/` | Galley library page; "→ Inference Studio" link in header |
| `http://localhost:5173/inference` | Redirects to `/inference/voices` |
| `http://localhost:5173/inference/voices` | TTS panel; health pill in top-right says "Ready" (green) within ~2s |
| `http://localhost:5173/inference/stt` | STT panel; voices/health connect to Windows API |
| `http://localhost:5173/inference/image` | Image-generation panel |
| `http://localhost:5173/inference/music` | Music library panel; first call lists tracks |
| Settings gear (top-right) | Drawer opens; baseUrl pre-filled `http://desktop-umt08rn:8881` |

## End-to-end checks

1. **TTS:** Voices tab → pick a voice → "Generate" with sample text → audio plays.
2. **Image:** Image tab → enter prompt → click Generate → image appears within ~3 min.
3. **Music:** Music tab → tracks load; favorite/unfavorite a track persists.
4. **Settings:** edit `baseUrl` to a bogus value → health pill goes red within 30s; restore → goes green.

## Known limits / future work

- Bundle size warning at build (>500KB pre-gzip). Phase 4 follow-up:
  add `manualChunks` config in `vite.config.ts` to split inference panels
  from editorial code.
- React parity: only Blazor / vanilla React on this codebase. Per CO directive
  2026-05-08, React `SunfishChat` parity is out of scope until further notice.
- ePub assembly, audiobook final assembly, pre-publish review gate, and
  distribution adapters are NOT YET BUILT — see future-work section in
  README.md.
