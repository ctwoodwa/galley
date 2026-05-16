//! Galley desktop shell entry point.
//!
//! Wires four subsystems together:
//!
//!   - `tray`      — system tray / menu-bar icon + the menu users
//!                   actually interact with (Open / Books / Tools /
//!                   Services / Settings / Quit).
//!   - `services`  — supervises the local book-server child process
//!                   (Node/Express). Spawns on startup, restarts on
//!                   crash, stops cleanly on Quit.
//!   - `probes`    — periodic health probes of the configured worker
//!                   slot URLs (TTS, STT, image, music). These usually
//!                   live on a separate tailnet host; the desktop
//!                   shell can't control them, only observe.
//!   - `oauth`     — authorization-code-pkce flow for cloud plugins
//!                   declaring `authentication.type = oauth2`. Tokens
//!                   land in the OS keychain.

mod oauth;
mod probes;
mod services;
mod tray;

use tauri::{AppHandle, Runtime};

#[tauri::command]
async fn oauth_begin<R: Runtime>(
    app: AppHandle<R>,
    plugin_id: String,
) -> Result<oauth::BeginResult, String> {
    oauth::begin(app, plugin_id).await
}

#[tauri::command]
fn oauth_status(plugin_id: String) -> oauth::StatusResult {
    oauth::status(&plugin_id)
}

#[tauri::command]
async fn oauth_signout(plugin_id: String) -> Result<(), String> {
    oauth::signout(&plugin_id).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            oauth_begin,
            oauth_status,
            oauth_signout,
        ])
        .setup(|app| {
            tray::create_tray(app.handle())?;
            services::start_supervision(app.handle().clone());
            probes::start_probe_loop(app.handle().clone());
            Ok(())
        })
        .on_window_event(|window, event| {
            // The close button (red dot / X) hides the window instead of
            // quitting the app. To actually exit, use Quit Galley from
            // the tray (which also stops supervised services).
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running galley desktop");
}
