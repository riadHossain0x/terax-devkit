mod session;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, RwLock};

use tauri::ipc::{Channel, Response};

use crate::modules::workspace::{authorize_spawn_cwd, WorkspaceEnv, WorkspaceRegistry};
use session::DapSession;

pub struct DapState {
    sessions: RwLock<HashMap<u32, Arc<DapSession>>>,
    next_id: AtomicU32,
}

impl Default for DapState {
    fn default() -> Self {
        Self {
            sessions: RwLock::new(HashMap::new()),
            next_id: AtomicU32::new(1),
        }
    }
}

impl DapState {
    pub(super) fn take(&self, id: u32) -> Option<Arc<DapSession>> {
        self.sessions.write().unwrap().remove(&id)
    }

    pub fn kill_all(&self) {
        let drained: Vec<Arc<DapSession>> =
            self.sessions.write().unwrap().drain().map(|(_, s)| s).collect();
        for session in drained {
            session.kill();
        }
    }
}

#[tauri::command]
pub async fn dap_detect_netcoredbg() -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || {
        // 1. Check PATH via resolve_binary
        if let Some(path) = crate::modules::lsp::env::resolve_binary("netcoredbg") {
            return Some(path.to_string_lossy().into_owned());
        }

        // 2. Check ~/.terax/bin/netcoredbg (direct file or directory/file)
        if let Some(home) = dirs::home_dir() {
            let bin_dir = home.join(".terax").join("bin");
            let user_bin = bin_dir.join("netcoredbg");
            if user_bin.is_file() {
                return Some(user_bin.to_string_lossy().into_owned());
            }
            let sub_bin = bin_dir.join("netcoredbg").join("netcoredbg");
            if sub_bin.is_file() {
                return Some(sub_bin.to_string_lossy().into_owned());
            }

            // 3. Check ~/.dotnet/tools/netcoredbg
            let dotnet_tool = home.join(".dotnet").join("tools").join("netcoredbg");
            if dotnet_tool.is_file() {
                return Some(dotnet_tool.to_string_lossy().into_owned());
            }
        }

        // 4. Standard Mac/Linux paths
        for path in [
            "/opt/homebrew/bin/netcoredbg",
            "/usr/local/bin/netcoredbg",
            "/usr/bin/netcoredbg",
        ] {
            let p = PathBuf::from(path);
            if p.is_file() {
                return Some(p.to_string_lossy().into_owned());
            }
        }

        None
    })
    .await
    .ok()
    .flatten()
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn dap_spawn(
    app: tauri::AppHandle,
    state: tauri::State<'_, DapState>,
    registry: tauri::State<'_, WorkspaceRegistry>,
    command: String,
    args: Vec<String>,
    env: Option<HashMap<String, String>>,
    root: String,
    workspace: Option<WorkspaceEnv>,
    on_message: Channel<Response>,
    on_exit: Channel<session::DapExit>,
) -> Result<u32, String> {
    let workspace = WorkspaceEnv::from_option(workspace);
    if workspace.is_wsl() {
        return Err("dap: WSL workspaces are not supported yet".into());
    }
    let root = authorize_spawn_cwd(&registry, Some(root.as_str()), &workspace)?
        .ok_or("dap: workspace root is required")?;

    let id = state.next_id.fetch_add(1, Ordering::Relaxed);
    let spawn_log = format!("cmd={command} root={}", root.display());
    let session = tauri::async_runtime::spawn_blocking(move || {
        let binary = crate::modules::lsp::env::resolve_binary(&command)
            .or_else(|| {
                let p = PathBuf::from(&command);
                if p.is_file() {
                    Some(p)
                } else {
                    None
                }
            })
            .ok_or_else(|| format!("dap: binary not found: {command}"))?;
        let extra_env = env.unwrap_or_default();
        session::spawn(
            id, app, &binary, &args, &extra_env, &root, on_message, on_exit,
        )
    })
    .await
    .map_err(|e| e.to_string())??;

    state.sessions.write().unwrap().insert(id, session);
    let exited = state
        .sessions
        .read()
        .unwrap()
        .get(&id)
        .map(|s| s.exited.load(Ordering::Acquire))
        .unwrap_or(false);
    if exited {
        state.take(id);
    }
    log::info!("dap spawned id={id} {spawn_log}");
    Ok(id)
}

#[tauri::command]
pub async fn dap_send(
    state: tauri::State<'_, DapState>,
    id: u32,
    message: String,
) -> Result<(), String> {
    let session = state
        .sessions
        .read()
        .unwrap()
        .get(&id)
        .cloned()
        .ok_or_else(|| format!("dap_send: unknown id={id}"))?;
    session.write_message(&message)
}

#[tauri::command]
pub fn dap_kill(state: tauri::State<'_, DapState>, id: u32) {
    if let Some(session) = state.take(id) {
        session.kill();
        log::info!("dap killed id={id}");
    }
}
