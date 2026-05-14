# Galley capability slots

Galley apps reach four families of inference services: **tts**, **stt**,
**image**, and **music**. Each family may have one or more tier slots
(`fast`, `quality`, or a single default). A galley installation that
doesn't host these workers locally routes them over the network to
another galley node that does — most commonly, an editing client on a
laptop calling a GPU host on the same Tailscale network.

## Slot vocabulary

| Slot identifier | Meaning |
|---|---|
| `<family>` (no suffix) | Single tier — used when the family doesn't differentiate (today: `image`, `music`) |
| `<family>/fast` | Latency-optimized provider |
| `<family>/quality` | Fidelity-optimized provider |
| `<family>/cheap` | Cost-optimized (relevant when routing to a paid API) |
| `<family>/local` | Forced local-hardware provider; no remote fallback |

Two reserved-but-not-yet-used suffixes (`/cheap`, `/local`) round out the
namespace; today's deployments use only `/fast` and `/quality` for TTS
and STT.

## Family → tier matrix (current)

| Family | Slots | Notes |
|---|---|---|
| `tts` | `tts/fast`, `tts/quality` | Fast: Kokoro-FastAPI. Quality: higgs-audio (or hosted API). |
| `stt` | `stt/fast`, `stt/quality` | Fast: whisper-small via Faster-Whisper. Quality: whisper-large-v3. |
| `image` | `image` | Single tier today (ComfyUI / SDNext). `/fast` reserved for future turbo models. |
| `music` | `music` | Single tier today (higgs-audio's music endpoint, MusicGen). |

## Slots vs. routes — separation of concerns

A **slot** is a client-side preference. A **route** is the URL path the
worker actually exposes. They are deliberately decoupled.

- Workers expose one route per family — `POST /v1/tts/synthesize`,
  `POST /v1/stt/transcribe`, `POST /v1/image/generate`,
  `POST /v1/music/generate`. The worker has no concept of tier.
- Galley clients carry a tier preference in the request (`tier: "fast"`
  or `tier: "quality"`) which the client resolves to a slot, looks up
  the slot's `baseUrl`, and dispatches.
- Tier is a labeling decision galley owns. A model that's "quality"
  today becomes "fast" tomorrow when something faster lands — the slot
  moves; worker code doesn't.

## What lives in a slot's config

```ts
interface ServiceConfig {
  baseUrl: string           // Full URL of the worker (Tailscale hostname is fine)
  apiKey: string            // Bearer token; empty string if worker requires none
  enabled: boolean          // Slot disabled → UI hides actions that need it
  provider?: string         // Human-readable label: "kokoro-fastapi", "higgs-audio"
  flavor?: string           // Optional API-shape hint for client-side adapters
}
```

`provider` is informational only — it shows in the Settings drawer so a
human reading the config knows what they're pointing at. Galley's
runtime never branches on it.

`flavor` is the workaround for upstream worker APIs that don't conform
to galley's canonical request/response schema. Kokoro-FastAPI's
OpenAI-compatible Speech endpoint uses different path prefixes
(`/v1/audio/...` vs `/api/v1/audio/...`) and slightly different
response shapes than the inference-server "standard" flavor; the
TTSClient reads `flavor` to pick the right adapter. New workers that
implement the canonical schema set `flavor` to `"standard"` or omit it.

## Fallback semantics — single-machine and shared-default modes

A galley installation that hosts its workers on the same host writes
nothing to slot URLs; one shared `baseUrl` + `apiKey` field at the
config root acts as the fallback for every empty slot. This is the
single-machine mode (legacy galley behavior, preserved for back-compat).

When a slot has a non-empty `baseUrl`, that slot's URL wins over the
shared fallback. When a slot is disabled, the UI suppresses actions
that depend on it — even if a fallback exists.

Resolution order, per capability identifier `c`:

1. If `services[c].enabled` is `false` → no service available.
2. If `services[c].baseUrl` is non-empty → use the slot's `baseUrl` + `apiKey`.
3. Else use the shared `baseUrl` + `apiKey` at the config root.
4. If both are empty → no service available.

Helper: `getService(config, capability)` in `@galley/api-client`
returns either a `{ baseUrl, apiKey, flavor }` triple or `null`.

## Per-worker docs

Each tier slot has at least one supported worker. The per-family docs
spell out installation, the canonical request/response contract, and
per-worker adapter quirks:

- [`tts-fast.md`](./tts-fast.md) — Kokoro-FastAPI, alternatives (Piper,
  edge-tts).
- [`tts-quality.md`](./tts-quality.md) — higgs-audio, alternatives
  (ElevenLabs, OpenAI Speech).
- [`stt.md`](./stt.md) — Faster-Whisper (fast + quality tiers from one
  install), alternatives.
- [`image.md`](./image.md) — ComfyUI, alternatives (SDNext, FLUX
  servers).
- [`music.md`](./music.md) — higgs-audio music endpoint, alternatives
  (MusicGen).

These are stubs at the time of writing; they fill in as each worker
gets its galley adapter wired.

## Multi-machine pattern (Tailscale)

The dominant deployment topology is two machines on a Tailscale tailnet:
the editing client (laptop, often without a usable GPU) and a GPU host
(workstation or desktop). The GPU host runs the worker services and
binds them to `0.0.0.0:<port>`. The editing client points each slot at
the GPU host via MagicDNS:

```
services["tts/fast"].baseUrl    = "http://windows-box.tailnet.ts.net:8880"
services["tts/quality"].baseUrl = "http://windows-box.tailnet.ts.net:8881"
services["stt/fast"].baseUrl    = "http://windows-box.tailnet.ts.net:8810"
services["image"].baseUrl       = "http://windows-box.tailnet.ts.net:8820"
services["music"].baseUrl       = "http://windows-box.tailnet.ts.net:8830"
```

Tailscale provides device-level identity and encrypted transport. The
bearer token on each slot is defense-in-depth.

## Node manifest (planned)

A galley node will eventually advertise its hosted capabilities at
`GET /api/manifest`, returning the families it serves and their canonical
base paths. A paired client can pre-populate Settings from the manifest
rather than typing URLs by hand. The manifest is per-family (not
per-tier) since tier labeling is the client's choice.

```json
{
  "node": "windows-box.tailnet.ts.net",
  "version": "0.x.y",
  "capabilities": [
    { "family": "tts",   "base_path": "/v1/tts",   "auth": "bearer" },
    { "family": "stt",   "base_path": "/v1/stt",   "auth": "bearer" },
    { "family": "image", "base_path": "/v1/image", "auth": "bearer" },
    { "family": "music", "base_path": "/v1/music", "auth": "bearer" }
  ]
}
```

## Why this layout

Three properties this slot model preserves:

1. **Vendor-neutral.** No identifier in galley code names a specific
   provider. Swapping Kokoro for Piper is a Settings change, not a
   refactor.
2. **Tier-mobile.** A model's tier label is editable per-deployment.
   What's "quality" on a laptop may be "fast" on a workstation with a
   newer GPU.
3. **Forward-compatible with new tiers.** Adding `tts/ultra-fast` for
   live-captioning is one new slot key; no change to the worker contract
   or to existing slot consumers.

The contract is: workers implement family routes; slots label them; the
client routes by tier.
