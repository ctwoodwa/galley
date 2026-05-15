# Galley Desktop — Tauri 2.x shell

A native Mac (`.app` / `.dmg`) and Windows (`.exe` / `.msi`) wrapper
around the Galley web app, with a system tray / menu-bar icon that:

- launches and supervises the local `book-server` (Node/Express)
- probes worker slot health (TTS / STT / image / music) every 30s
- exposes Add Book, Open Reader, Open Tools, Measure Current Chapter,
  Restart Services, Settings, and Quit from a single menu
- stops every supervised service when the user picks Quit Galley

## Status

**v0.1.0 — scaffolded; not yet compiled in this session.**
Awaiting first build to confirm the Rust + Tauri 2.x toolchain on
your machine. The scaffold below is complete; once Rust is
installed, `cargo tauri dev` should bring it up.

## One-time install

You'll need the Rust toolchain plus the Tauri CLI. On macOS:

    # Rust
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
    source "$HOME/.cargo/env"

    # Xcode Command Line Tools (required for native Mac builds)
    xcode-select --install

    # Tauri CLI
    cargo install tauri-cli@^2

On Windows: install Rust via [rustup-init.exe](https://rustup.rs/) +
the [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/),
then `cargo install tauri-cli@^2`.

You'll also want Node + pnpm (already used by the rest of galley) so
the web app can build:

    pnpm --version    # expect 10.x

## First-run icons

`cargo tauri build` requires real PNG/ICO/ICNS icons at the paths
listed in `tauri.conf.json` / `bundle.icon`. The fastest way:

    cd apps/desktop
    cargo tauri icon src-tauri/icons/source.png

…where `source.png` is any 1024×1024 PNG. The CLI generates every
required size + format. `cargo tauri dev` runs without icons (uses
Tauri's built-in dev icon); only production bundling needs them.

## Dev workflow

From `apps/desktop/`:

    cargo tauri dev

This invokes the `beforeDevCommand` in `tauri.conf.json` —
`pnpm --filter @galley/web dev` — which boots the Vite dev server at
`localhost:5173`. The Tauri shell then loads that URL in its native
window and the tray icon appears in the menu bar / system tray.

The desktop shell also spawns `services/book-server/server.js` as a
child process. If you'd prefer to run book-server yourself (e.g. with
`node --watch`), set:

    export GALLEY_BOOK_SERVER_PATH=/dev/null   # blocks the spawn
    # OR
    export GALLEY_DISABLE_SUPERVISOR=1         # (when implemented)

…and start book-server in another terminal as usual.

## Production build

    cargo tauri build

Produces:

  - macOS:   `src-tauri/target/release/bundle/dmg/Galley_<v>_aarch64.dmg`
             `src-tauri/target/release/bundle/macos/Galley.app`
  - Windows: `src-tauri/target/release/bundle/msi/Galley_<v>_x64_en-US.msi`
             `src-tauri/target/release/bundle/nsis/Galley_<v>_x64-setup.exe`

### Mac codesigning + notarization

**v0.1.0 ships unsigned.** macOS users will hit a Gatekeeper warning
on first launch. Workaround for testing:

    # Strip the quarantine attribute after copying Galley.app to
    # /Applications.
    xattr -dr com.apple.quarantine /Applications/Galley.app

For signed distribution, you'll need:

  1. An Apple Developer Program account ($99/yr) and a Developer ID
     Application certificate in your login keychain.
  2. An app-specific password for `xcrun notarytool`.
  3. `TAURI_SIGNING_PRIVATE_KEY` and `APPLE_*` env vars per the
     [Tauri codesigning docs](https://tauri.app/distribute/sign/macos/).

Signed builds + notarization are scheduled as a follow-up sprint.

### Windows codesigning

Same story — unsigned for v0.1.0; SmartScreen will warn on first
run. A `signtool` integration with an EV/OV certificate lands in the
same follow-up sprint.

## Wiring the React app

The web app needs one new import on bootstrap so the tray's
navigation events drive react-router. From a top-level entry
(typically `apps/web/src/app/App.jsx`):

```tsx
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { mountDesktopIntegration } from './desktopIntegration'

function DesktopWiring() {
  const navigate = useNavigate()
  useEffect(() => {
    let unmount: (() => void) | undefined
    mountDesktopIntegration(navigate).then((u) => { unmount = u })
    return () => unmount?.()
  }, [navigate])
  return null
}
```

Render `<DesktopWiring />` inside `<RouterProvider>`. In a plain
browser session `mountDesktopIntegration` is a no-op (it checks
`window.__TAURI_INTERNALS__` first), so the same build runs in both
contexts.

Add `@tauri-apps/api` to `apps/web/package.json` for the events:

    pnpm --filter @galley/web add @tauri-apps/api

## Layout

```
apps/desktop/
├── package.json                    # tauri-cli devDependency, dev/build scripts
├── README.md                       # you are here
├── .gitignore                      # target/, gen/, lock files
└── src-tauri/
    ├── Cargo.toml                  # Rust deps: tauri, reqwest, tokio…
    ├── tauri.conf.json             # window + bundle + dev config
    ├── build.rs                    # tauri-build
    ├── capabilities/default.json   # window permissions
    ├── icons/                      # production icons (see icons/README.md)
    └── src/
        ├── main.rs                 # thin entry point
        ├── lib.rs                  # wires tray + supervision + probes
        ├── tray.rs                 # menu construction + event dispatch
        ├── services.rs             # book-server lifecycle
        └── probes.rs               # worker slot health probes
```

## Roadmap

- [ ] First successful `cargo tauri dev` run (gates everything else)
- [ ] Wire `mountDesktopIntegration` into `apps/web/src/app/App.jsx`
- [ ] Dynamic Books submenu populated from `useBookRegistry`
- [ ] Per-slot `localCommand` for worker Start/Stop from the tray
- [ ] Login Items registration (macOS) + Startup shortcut (Windows)
- [ ] Code signing + notarization
- [ ] Tauri sidecar for bundled Node + Python (remove "host has Node
      installed" assumption)
- [ ] Auto-updater
