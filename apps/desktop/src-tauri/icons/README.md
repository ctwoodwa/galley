# Tauri icons

`cargo tauri build` requires real PNG/ICO/ICNS icons at the paths
listed in `tauri.conf.json`'s `bundle.icon` array:

  32x32.png
  128x128.png
  128x128@2x.png
  icon.icns       (macOS)
  icon.ico        (Windows)

The fastest way to populate them: drop a single 1024×1024 PNG named
`source.png` here, then run:

    cd apps/desktop
    cargo tauri icon src-tauri/icons/source.png

That command generates every required size + format from one source.

Until icons land here, `cargo tauri dev` still runs (it uses Tauri's
built-in dev icon); only `cargo tauri build` (production bundling)
fails.
