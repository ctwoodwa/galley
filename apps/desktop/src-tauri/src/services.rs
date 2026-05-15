//! book-server lifecycle supervision.
//!
//! Spawns the Node/Express book-server (services/book-server/server.js)
//! as a child process when the desktop app starts, restarts it on
//! crash (with a short backoff), and stops it cleanly on Quit.
//!
//! Path resolution walks up from the running executable looking for
//! `services/book-server/server.js`. Falls back to the
//! `GALLEY_BOOK_SERVER_PATH` env var if the walk doesn't find one
//! (useful when shipping a bundled sidecar later).
//!
//! Stop / restart commands are invoked from the tray menu; both go
//! through the same shared state so a "Restart" while supervision is
//! mid-spawn doesn't race.

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use once_cell::sync::Lazy;
use tauri::async_runtime::{spawn, Mutex as AsyncMutex};
use tauri::{AppHandle, Emitter, Runtime};
use tokio::process::{Child, Command};

/// Public flag the supervisor reads on every loop iteration. When the
/// user hits "Quit Galley" we set this to true and the loop exits.
static SHUTDOWN: Lazy<Arc<AsyncMutex<bool>>> = Lazy::new(|| Arc::new(AsyncMutex::new(false)));

/// Currently-running book-server child, if any. Wrapped so the tray
/// can `kill()` it independent of the supervisor.
static CHILD: Lazy<Arc<AsyncMutex<Option<Child>>>> = Lazy::new(|| Arc::new(AsyncMutex::new(None)));

const BACKOFF: Duration = Duration::from_secs(2);

pub fn start_supervision<R: Runtime>(app: AppHandle<R>) {
    spawn(async move {
        loop {
            if *SHUTDOWN.lock().await {
                break;
            }
            match spawn_book_server().await {
                Ok(child) => {
                    *CHILD.lock().await = Some(child);
                    let _ = app.emit("galley://service-status", "book-server: running");
                    // Wait for child to exit, then loop to respawn.
                    if let Some(mut c) = CHILD.lock().await.take() {
                        let _ = c.wait().await;
                    }
                    let _ = app.emit("galley://service-status", "book-server: restarting");
                }
                Err(err) => {
                    let _ = app.emit(
                        "galley://service-status",
                        format!("book-server: failed ({err})"),
                    );
                }
            }
            if *SHUTDOWN.lock().await {
                break;
            }
            tokio::time::sleep(BACKOFF).await;
        }
    });
}

async fn spawn_book_server() -> Result<Child, String> {
    let server_js = resolve_book_server_path().ok_or_else(|| {
        "could not locate services/book-server/server.js (set GALLEY_BOOK_SERVER_PATH)".to_string()
    })?;

    Command::new("node")
        .arg(&server_js)
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("spawn node failed: {e}"))
}

fn resolve_book_server_path() -> Option<PathBuf> {
    if let Ok(explicit) = std::env::var("GALLEY_BOOK_SERVER_PATH") {
        let p = PathBuf::from(explicit);
        if p.exists() {
            return Some(p);
        }
    }
    // Walk up from current_exe() looking for services/book-server/server.js.
    // In `cargo tauri dev`, current_exe() lives inside the source tree's
    // `target/debug/`, so 4–6 levels up reaches the repo root.
    if let Ok(exe) = std::env::current_exe() {
        let mut p = exe.as_path();
        for _ in 0..12 {
            let candidate = p.join("services/book-server/server.js");
            if candidate.exists() {
                return Some(candidate);
            }
            match p.parent() {
                Some(parent) => p = parent,
                None => break,
            }
        }
    }
    None
}

pub fn stop_book_server<R: Runtime>(app: &AppHandle<R>) {
    let handle = app.clone();
    spawn(async move {
        let mut guard = CHILD.lock().await;
        if let Some(mut c) = guard.take() {
            let _ = c.kill().await;
        }
        let _ = handle.emit("galley://service-status", "book-server: stopped");
    });
}

pub fn restart_book_server<R: Runtime>(app: &AppHandle<R>) {
    // Killing the current child causes the supervision loop to respawn
    // after BACKOFF; no separate restart path needed.
    stop_book_server(app);
}

/// Shuts the supervisor loop down + kills the child. Called from the
/// tray's Quit handler before `app.exit(0)`.
pub fn stop_all<R: Runtime>(app: &AppHandle<R>) {
    let handle = app.clone();
    // Use a blocking shutdown: set the flag, then kill the child. Both
    // operations are async; the tray quit handler awaits the join here.
    // tauri::async_runtime::block_on is safe in the main thread of the
    // desktop app since menu events fire on the GUI thread.
    tauri::async_runtime::block_on(async move {
        *SHUTDOWN.lock().await = true;
        if let Some(mut c) = CHILD.lock().await.take() {
            let _ = c.kill().await;
        }
    });
    let _ = handle.emit("galley://service-status", "book-server: stopped");
}

/// Spawn `prose-telemetry measure --stdout` on a chapter path and
/// emit the resulting JSON via a Tauri event for the React app to
/// surface as a notification. Async; menu callback returns immediately.
pub fn run_measure_async<R: Runtime>(app: &AppHandle<R>, chapter_path: String) {
    let handle = app.clone();
    spawn(async move {
        let python = resolve_prose_python();
        let output = Command::new(python)
            .args([
                "-m",
                "prose_telemetry.cli",
                "measure",
                &chapter_path,
                "--no-spacy",
                "--no-stdlib",
                "--stdout",
            ])
            .output()
            .await;
        match output {
            Ok(out) if out.status.success() => {
                let json = String::from_utf8_lossy(&out.stdout).to_string();
                let _ = handle.emit("galley://measure-result", json);
            }
            Ok(out) => {
                let err = String::from_utf8_lossy(&out.stderr).to_string();
                let _ = handle.emit("galley://measure-error", err);
            }
            Err(e) => {
                let _ = handle.emit("galley://measure-error", e.to_string());
            }
        }
    });
}

fn resolve_prose_python() -> String {
    std::env::var("GALLEY_PROSE_PYTHON").unwrap_or_else(|_| {
        // Default to the venv that prose_telemetry ships with.
        // The path is relative to the galley repo root; falls back to
        // bare "python3" if the venv isn't present.
        if let Some(server_js) = resolve_book_server_path() {
            if let Some(repo) = server_js.parent().and_then(|p| p.parent()).and_then(|p| p.parent()) {
                let venv_py = repo.join("prose/lib/prose_telemetry/.venv/bin/python");
                if venv_py.exists() {
                    return venv_py.to_string_lossy().into_owned();
                }
            }
        }
        "python3".to_string()
    })
}

/// Returns the directory where galley stores its operational logs.
/// Today this is just the book-server's emitted-on-stdout output;
/// when supervision starts capturing stdio it lands here.
pub fn logs_dir() -> Option<String> {
    if let Some(server_js) = resolve_book_server_path() {
        if let Some(parent) = server_js.parent() {
            return Some(parent.to_string_lossy().into_owned());
        }
    }
    None
}
