//! Tray icon + menu construction and event dispatch.
//!
//! Menu layout (per spec):
//!
//!   Galley · v0.1.0
//!   Status: ● Services running        ← updated by probes module
//!   ─────────────────────────────────
//!   Open Galley                       ⌘O
//!   Open Reader (active book)         ⌘R
//!   ─────────────────────────────────
//!   Books         ▸
//!     <recent books, populated dynamically>
//!     ─────────
//!     Add a Book…
//!     Manage Books…
//!   Tools         ▸
//!     Voices / STT / Image / Music
//!     ─────────
//!     Measure Current Chapter…
//!   Services      ▸
//!     <book-server status>
//!     Restart book-server / Stop book-server
//!     Refresh worker probes / Open log folder
//!   ─────────────────────────────────
//!   Settings…                         ⌘,
//!   About Galley
//!   ─────────────────────────────────
//!   Quit Galley                       ⌘Q
//!
//! Navigation is event-driven: Rust emits `galley://navigate` with a
//! path payload, the React app listens via `@tauri-apps/api/event` and
//! calls react-router's `navigate()`. This avoids running arbitrary JS
//! through `webview.eval`.

use serde::Serialize;
use tauri::{
    menu::{MenuBuilder, MenuEvent, MenuItemBuilder, SubmenuBuilder},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, Runtime,
};

#[derive(Serialize, Clone)]
struct NavigatePayload<'a> {
    path: &'a str,
}

pub fn create_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let menu = build_menu(app)?;

    let _tray = TrayIconBuilder::with_id("galley-tray")
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("Galley — editorial production")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(handle_menu_event)
        .build(app)?;

    Ok(())
}

fn build_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<tauri::menu::Menu<R>> {
    let header = MenuItemBuilder::with_id("header", format!("Galley · v{}", env!("CARGO_PKG_VERSION")))
        .enabled(false)
        .build(app)?;
    let status = MenuItemBuilder::with_id("status_line", "Status: starting…")
        .enabled(false)
        .build(app)?;

    let open_galley = MenuItemBuilder::with_id("open_galley", "Open Galley")
        .accelerator("CmdOrCtrl+O")
        .build(app)?;
    let open_reader = MenuItemBuilder::with_id("open_reader", "Open Reader")
        .accelerator("CmdOrCtrl+R")
        .build(app)?;

    // Books submenu — recent-books rows belong here, populated when
    // bookRegistry mutates. v1 ships the static Add / Manage pair so
    // the tray works without an IPC round-trip; recent-books slot in
    // when the React side emits a `bookRegistry/changed` event.
    let add_book = MenuItemBuilder::with_id("add_book", "Add a Book…").build(app)?;
    let manage_books = MenuItemBuilder::with_id("manage_books", "Manage Books…").build(app)?;
    let books_menu = SubmenuBuilder::new(app, "Books")
        .item(&add_book)
        .item(&manage_books)
        .build()?;

    // Tools submenu — opens the inference-studio surfaces today; when
    // those merge into a unified /tools route, IDs stay stable.
    let tool_voices = MenuItemBuilder::with_id("tool_voices", "Voices").build(app)?;
    let tool_stt = MenuItemBuilder::with_id("tool_stt", "Speech-to-Text").build(app)?;
    let tool_image = MenuItemBuilder::with_id("tool_image", "Image").build(app)?;
    let tool_music = MenuItemBuilder::with_id("tool_music", "Music").build(app)?;
    let tool_measure = MenuItemBuilder::with_id("tool_measure", "Measure Current Chapter…").build(app)?;
    let tools_menu = SubmenuBuilder::new(app, "Tools")
        .item(&tool_voices)
        .item(&tool_stt)
        .item(&tool_image)
        .item(&tool_music)
        .separator()
        .item(&tool_measure)
        .build()?;

    // Services submenu — book-server has full lifecycle; worker slots
    // are read-only health probes (different machines on tailnet).
    let svc_status = MenuItemBuilder::with_id("svc_status", "book-server: starting…")
        .enabled(false)
        .build(app)?;
    let svc_restart = MenuItemBuilder::with_id("svc_restart", "Restart book-server").build(app)?;
    let svc_stop = MenuItemBuilder::with_id("svc_stop", "Stop book-server").build(app)?;
    let svc_refresh = MenuItemBuilder::with_id("svc_refresh", "Refresh worker probes").build(app)?;
    let svc_logs = MenuItemBuilder::with_id("svc_logs", "Open log folder").build(app)?;
    let services_menu = SubmenuBuilder::new(app, "Services")
        .item(&svc_status)
        .item(&svc_restart)
        .item(&svc_stop)
        .separator()
        .item(&svc_refresh)
        .item(&svc_logs)
        .build()?;

    let settings = MenuItemBuilder::with_id("settings", "Settings…")
        .accelerator("CmdOrCtrl+,")
        .build(app)?;
    let about = MenuItemBuilder::with_id("about", "About Galley").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit Galley")
        .accelerator("CmdOrCtrl+Q")
        .build(app)?;

    MenuBuilder::new(app)
        .item(&header)
        .item(&status)
        .separator()
        .item(&open_galley)
        .item(&open_reader)
        .separator()
        .item(&books_menu)
        .item(&tools_menu)
        .item(&services_menu)
        .separator()
        .item(&settings)
        .item(&about)
        .separator()
        .item(&quit)
        .build()
}

fn handle_menu_event<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    let id = event.id().as_ref();
    match id {
        "open_galley" => navigate(app, "/"),
        "open_reader" => navigate(app, "/read"),
        "add_book" => navigate(app, "/?addBook=1"),
        "manage_books" => navigate(app, "/settings#books"),
        "tool_voices" => navigate(app, "/inference/voices"),
        "tool_stt" => navigate(app, "/inference/stt"),
        "tool_image" => navigate(app, "/inference/image"),
        "tool_music" => navigate(app, "/inference/music"),
        "tool_measure" => measure_chapter_picker(app),
        "svc_restart" => crate::services::restart_book_server(app),
        "svc_stop" => crate::services::stop_book_server(app),
        "svc_refresh" => crate::probes::refresh_all(app),
        "svc_logs" => open_logs_folder(app),
        "settings" => navigate(app, "/settings"),
        "about" => navigate(app, "/?about=1"),
        "quit" => {
            crate::services::stop_all(app);
            app.exit(0);
        }
        _ => {}
    }
}

fn navigate<R: Runtime>(app: &AppHandle<R>, path: &str) {
    // Bring the main window forward + emit the navigation event. The
    // React side wires a `listen('galley://navigate', …)` to react-
    // router's `navigate`.
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
    let _ = app.emit("galley://navigate", NavigatePayload { path });
}

fn measure_chapter_picker<R: Runtime>(app: &AppHandle<R>) {
    use tauri_plugin_dialog::DialogExt;
    let handle = app.clone();
    app.dialog()
        .file()
        .add_filter("Chapter markdown", &["md"])
        .pick_file(move |path| {
            if let Some(path) = path {
                crate::services::run_measure_async(&handle, path.to_string());
            }
        });
}

fn open_logs_folder<R: Runtime>(app: &AppHandle<R>) {
    use tauri_plugin_opener::OpenerExt;
    if let Some(logs) = crate::services::logs_dir() {
        let _ = app.opener().reveal_item_in_dir(logs);
    }
}
