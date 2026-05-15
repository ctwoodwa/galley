# Galley install guide — Mac, Windows, Linux

Galley runs in three distinct configurations. Pick the one that matches what you're building toward, install the prereqs for it, then follow the corresponding setup track. The three tracks compose: a full production install layers all three onto a Tailnet of user-owned devices.

| Track | Where it runs | What you get | Required for |
|---|---|---|---|
| **1. Web + book-server (dev)** | Any OS | The Galley web app + book server in a browser at `localhost:5173`. Cross-platform; no native bundling. | Trying galley out, working on the web UI, contributing to galley itself. |
| **2. Native desktop app** | Mac or Windows (Linux works but isn't a release target) | A `.app`/`.dmg` (Mac) or `.msi`/`.exe` (Windows) that wraps the web app + supervises book-server + adds a tray menu. | Day-to-day editorial use; "feels like an app." |
| **3. GPU worker host** | Typically Windows or Linux with NVIDIA / Apple Silicon | TTS / STT / image / music workers reachable over a Tailnet. | Audio production, image generation, audiobook rendering. |

The conventional production topology is **Mac as editing client (tracks 1 + 2) ↔ Windows or Linux as GPU host (track 3) over Tailscale**, but everything works single-machine if your local hardware can run the workers you want.

---

## Track 1 — Web + book-server (dev mode)

The fastest way to see galley working. Cross-platform; nothing native to build.

### Prerequisites

| Tool | Version | Mac | Windows | Linux |
|---|---|---|---|---|
| **Node.js** | ≥ 22 LTS | `brew install node@22` or `nvm install 22` | `winget install OpenJS.NodeJS.LTS` or [nodejs.org installer](https://nodejs.org/) | `nvm install 22` or your distro's package manager |
| **pnpm** | 10.33.4 (pinned via `packageManager`) | `corepack enable && corepack prepare pnpm@10.33.4 --activate` | Same | Same |
| **Git** | Any recent | preinstalled via Xcode CLT (`xcode-select --install`) | `winget install Git.Git` | `apt install git` / equivalent |

> **Why pnpm 10.33.4 specifically?** The root `package.json` pins `packageManager: "pnpm@10.33.4"` so every contributor gets the same lockfile resolution. `corepack` auto-installs that version when you run `pnpm` for the first time inside the repo.

### Setup

```bash
git clone https://github.com/ctwoodwa/galley.git
cd galley
pnpm install
```

### Run

```bash
pnpm dev
```

This boots Vite on `http://localhost:5173` and the book-server on `http://localhost:3080` via Turbo. Open the URL in your browser.

> **Port 3080 collision?** A leftover book-server from a prior session may still be holding the port. Free it with:
>
> - **Mac / Linux:** `lsof -ti tcp:3080 | xargs kill`
> - **Windows (PowerShell):** `Stop-Process -Id (Get-NetTCPConnection -LocalPort 3080).OwningProcess -Force`

### Smoke-test

Visit `http://localhost:5173`, click into `/library`, and verify the UI loads. With no books configured the library is empty — see `integrations/the-inverted-stack/sync.config.example.json` for the per-book config, or use Settings → Books to add one through the UI.

### Run tests

```bash
pnpm --filter @galley/web test          # web component tests
pnpm --filter @galley/api-client test   # API client unit tests
```

### Production web build

```bash
pnpm build
```

Outputs to `apps/web/dist/`. Static files; serve with any web server.

---

## Track 2 — Native desktop app (Tauri)

Wraps the web app in a native shell with a tray menu and book-server supervision. Requires the Rust toolchain plus a platform-specific build chain. The detailed cookbook lives in [`apps/desktop/README.md`](../apps/desktop/README.md); what follows is the cross-platform prereq matrix + the canonical commands.

> **Status:** v0.1.0 is scaffolded. The first cross-platform CI build is in flight (Sunfish PR #850 unblocks the build's `beforeBuildCommand`); local builds work today given the prereqs below.

### Prerequisites

All three OSes need Track 1's prereqs (Node + pnpm) **plus**:

| Component | Mac | Windows | Linux |
|---|---|---|---|
| **Rust toolchain** | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` then `source "$HOME/.cargo/env"` | [rustup-init.exe](https://rustup.rs/) — pick the default MSVC host triple | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| **Native build chain** | Xcode Command Line Tools: `xcode-select --install` | [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) — select **"Desktop development with C++"** workload. Includes MSVC + Windows SDK. | `apt install libwebkit2gtk-4.1-dev libgtk-3-dev libappindicator3-dev librsvg2-dev patchelf` (Ubuntu/Debian) or distro equivalent |
| **WebView runtime** | preinstalled (WKWebView) | WebView2 (preinstalled on Windows 11; for Windows 10 install from [Microsoft Edge WebView2](https://developer.microsoft.com/microsoft-edge/webview2/)) | preinstalled with webkit2gtk |
| **Tauri CLI** | `cargo install tauri-cli@^2` | Same (in PowerShell or Developer Command Prompt) | Same |

### Setup

```bash
cd apps/desktop
cargo tauri icon src-tauri/icons/source.png    # one-time icon generation
```

> **Source PNG:** any 1024×1024 PNG works; the CLI generates every required size + format (`.icns` for Mac, `.ico` for Windows, multi-size PNGs for Linux).

### Dev workflow

```bash
cd apps/desktop
cargo tauri dev
```

This invokes Tauri's `beforeDevCommand` which boots `pnpm --filter @galley/web dev` (Vite on `localhost:5173`), then loads that URL into the native window. The tray icon appears in the menu bar (Mac) / system tray (Windows) / system tray (Linux GNOME/KDE — varies by DE).

If you want to run book-server yourself rather than letting Tauri supervise it (e.g., for `node --watch`), set:

```bash
export GALLEY_BOOK_SERVER_PATH=/dev/null   # Mac/Linux — blocks the spawn
# or on Windows (PowerShell):
$env:GALLEY_BOOK_SERVER_PATH = "NUL"
```

### Production build

```bash
cd apps/desktop
cargo tauri build
```

| Platform | Output paths |
|---|---|
| **Mac (arm64)** | `src-tauri/target/release/bundle/dmg/Galley_<v>_aarch64.dmg` + `src-tauri/target/release/bundle/macos/Galley.app` |
| **Mac (Intel)** | `src-tauri/target/release/bundle/dmg/Galley_<v>_x64.dmg` + same `.app` (different architecture) |
| **Windows (x64)** | `src-tauri/target/release/bundle/msi/Galley_<v>_x64_en-US.msi` + `src-tauri/target/release/bundle/nsis/Galley_<v>_x64-setup.exe` |
| **Windows (arm64)** | `src-tauri/target/release/bundle/msi/Galley_<v>_arm64_en-US.msi` |
| **Linux (x64)** | `src-tauri/target/release/bundle/appimage/Galley_<v>_amd64.AppImage` + `.deb` / `.rpm` per `tauri.conf.json` config |

For cross-target builds (Windows from Mac, etc.) see the [Tauri CI docs](https://tauri.app/distribute/) — the cleanest path is GitHub Actions matrix builds, modelled on Sunfish's `tauri-build.yml` workflow.

### Code-signing

**Unsigned v0.1.0 caveat — Mac:**

```bash
# After copying Galley.app to /Applications, strip the quarantine bit:
xattr -dr com.apple.quarantine /Applications/Galley.app
```

**Unsigned v0.1.0 caveat — Windows:**

SmartScreen will warn on first run; click **More info** → **Run anyway**. Or right-click the `.msi` → Properties → **Unblock**.

Signed-and-notarized builds (Apple Developer ID + Windows EV/OV cert) are scheduled as a follow-up sprint. Full env-var checklist is in [`apps/desktop/README.md`](../apps/desktop/README.md#mac-codesigning--notarization).

---

## Track 3 — GPU worker host

Each capability slot (`tts/fast`, `tts/quality`, `stt/fast`, `stt/quality`, `image`, `music`, `llm`) is filled by one self-hosted worker process. Workers expose an HTTP API; galley's client talks to them via configured URLs. They're independent of the galley repo — most are upstream projects galley imports as plugins, not vendors.

### Tailnet setup (recommended)

```
[Mac editing client]                [Windows/Linux GPU host]
  galley web + book-server  <--->     TTS / STT / image / music workers
```

Both machines join the same [Tailscale](https://tailscale.com/) tailnet. Galley's Settings → Services points each slot at the GPU host's MagicDNS name (e.g., `http://windows-box.tailnet.ts.net:8881`).

For non-Tailnet setups (LAN-only, port-forwarded VPN), substitute any reachable URL — galley doesn't care how packets get there.

### Worker installation

The **plugin manifests** at `packages/plugins/plugins/<id>/manifest.json` declare each worker's install command, launch command, and health probe. The galley desktop tray (track 2) can Start / Stop / Restart any worker for which the `localCommand` slot field is populated. Manual install procedures, by capability:

| Capability | Default worker | Upstream | Notes |
|---|---|---|---|
| `tts/fast` | [Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI) | Apache-2.0 | Mac CPU works; GPU on Windows/Linux for fast turnaround. `./start-cpu.sh` or `./start-gpu.sh`. |
| `tts/quality` | [higgs-audio](https://github.com/boson-ai/higgs-audio) | Apache-2.0 | GPU-required. Mac arm64 + Linux + Windows supported; Mac Intel is **unsupported** (PyTorch wheel drop). |
| `stt/fast` | [whisper.cpp](https://github.com/ggerganov/whisper.cpp) | MIT | CPU; runs everywhere. Build from source via `make`. |
| `stt/quality` | [Faster-Whisper](https://github.com/SYSTRAN/faster-whisper) | MIT | GPU recommended; CPU works on small models. |
| `image` | [ComfyUI](https://github.com/comfyanonymous/ComfyUI) | GPL-3.0 | GPU-required for real workflows. Galley loads it as a subprocess so license boundary is preserved. |
| `music` | [MusicGen](https://github.com/facebookresearch/audiocraft) or `higgs-audio music` | MIT / Apache-2.0 | GPU. |
| `llm` | (no default local worker shipped) | — | Cloud plugins via Anthropic / OpenAI / Google. Local LLM support lands when a credible local model is registered. |

Per-worker install walkthroughs (`docs/services/tts-fast.md`, `tts-quality.md`, etc.) are queued — see `STATUS.md` deferred-moves item #4. Until then, each upstream README is authoritative.

### Wiring galley to your workers

Open galley → Settings → Services → pick a slot → set:

- **Enabled:** on
- **Provider:** match the plugin (e.g., `kokoro-fastapi` for `tts/fast`)
- **Base URL:** `http://<host>:<port>` (e.g., `http://windows-box.tailnet.ts.net:8881`)
- **API key:** for plugins that need one. Today's 8 cloud plugins all use static API keys. (OAuth-protected plugins — Phase 2 of the auth-taxonomy workstream — render a "Sign in with <provider>" button instead.)
- **Advanced → Local launch command:** when the worker runs on _this_ machine, set this so the tray menu can Start/Stop/Restart it (e.g., `cd ~/Projects/Kokoro-FastAPI && ./start-cpu.sh`).

The slot resolver (`packages/api-client/src/services.ts`) does the rest: each capability call dispatches to the matching slot, with a shared-default fallback for single-machine deployments. See [`docs/services/README.md`](services/README.md) for the routing model.

---

## Optional integrations

### Book repo (e.g., the-inverted-stack)

Galley reads chapters from any directory layed out per the book-server's conventions. To wire one:

```bash
cp integrations/the-inverted-stack/sync.config.example.json \
   integrations/the-inverted-stack/sync.config.json
$EDITOR integrations/the-inverted-stack/sync.config.json    # set bookRoot
```

Or use Settings → Books → Add Book in the UI.

### Cloud plugins (Anthropic / OpenAI / Google / Stability / etc.)

Cloud plugins are **opt-in per slot**. Open Settings → Services, select the slot, pick the provider, paste your API key (lives in the local Zustand store; never transmitted to any galley service). See [`docs/architecture/galley-platform-spec.md#authentication--2fa`](architecture/galley-platform-spec.md#authentication--2fa) for the full auth model (bearer / api-key / OAuth2 / OIDC / mTLS) and the 2FA story.

### Sunfish kernel sidecar (planned)

Multi-device sync via Sunfish's `kernel-sync` gossip daemon is queued in the accelerator roadmap. See [`docs/architecture/galley-as-sunfish-accelerator.md`](architecture/galley-as-sunfish-accelerator.md). Not required for single-device install.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `pnpm: command not found` | Corepack disabled | `corepack enable` (Node 16.10+ ships it; older Nodes: `npm i -g pnpm@10.33.4`) |
| `Error: listen EADDRINUSE :::3080` | Stale book-server | See "Port 3080 collision" in Track 1 |
| `error: linker 'link.exe' not found` on Windows during `cargo tauri build` | MSVC Build Tools missing | Install with the "Desktop development with C++" workload selected |
| `xcrun: error: invalid active developer path` on Mac | Xcode CLT missing or stale | `xcode-select --install` |
| `error[E0463]: can't find crate for 'webkit2gtk'` on Linux | webkit2gtk-4.1-dev missing | Ubuntu/Debian: `apt install libwebkit2gtk-4.1-dev`. Other distros: equivalent package |
| TTS/STT/image slot reports "unreachable" | Worker not running, wrong base URL, or Tailnet down | `curl http://<host>:<port>/health` from the editing client; check `tailscale status` |
| Tauri tray icon doesn't appear on Linux GNOME | GNOME hides tray icons by default | Install [TopIcons Plus](https://extensions.gnome.org/extension/2890/tray-icons-reloaded/) or equivalent |
| Gatekeeper blocks `.app` on first launch (Mac) | Unsigned v0.1.0 | `xattr -dr com.apple.quarantine /Applications/Galley.app` |
| SmartScreen warns "unrecognised app" (Windows) | Unsigned v0.1.0 | Click **More info** → **Run anyway**, or unblock the `.msi` via right-click → Properties |

---

## See also

- [`README.md`](../README.md) — quickstart and stack summary
- [`STATUS.md`](../STATUS.md) — current build state, shipped surfaces, deferred work
- [`apps/desktop/README.md`](../apps/desktop/README.md) — Tauri shell deep-dive
- [`docs/services/README.md`](services/README.md) — capability slot routing model
- [`docs/architecture/galley-platform-spec.md`](architecture/galley-platform-spec.md) — twelve-capability scope + local-first contract
- [`docs/architecture/plugin-architecture.md`](architecture/plugin-architecture.md) — plugin manifest schema, registry, auth/2FA flow
