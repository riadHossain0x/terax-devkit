use std::io::{Read, Write};
use std::process::{ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;

use shared_child::SharedChild;
use tauri::ipc::{Channel, Response};
use tauri::Manager;

use crate::modules::lsp::framing::{encode_frame, FrameDecoder};

const READ_BUF: usize = 32 * 1024;
const STDERR_TAIL_LINES: usize = 16;

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DapExit {
    pub code: Option<i32>,
    pub stderr_tail: String,
    pub reason: Option<String>,
}

pub struct DapSession {
    #[cfg(windows)]
    _job: Option<crate::modules::proc::job::ProcessJob>,
    child: Arc<SharedChild>,
    stdin: Mutex<Option<ChildStdin>>,
    pub(super) exited: Arc<AtomicBool>,
}

impl DapSession {
    pub fn write_message(&self, payload: &str) -> Result<(), String> {
        let mut guard = self.stdin.lock().unwrap();
        let stdin = guard.as_mut().ok_or("dap session stdin closed")?;
        stdin
            .write_all(&encode_frame(payload))
            .and_then(|_| stdin.flush())
            .map_err(|e| format!("dap write failed: {e}"))
    }

    pub fn kill(&self) {
        *self.stdin.lock().unwrap() = None;
        #[cfg(unix)]
        unsafe {
            libc::kill(-(self.child.id() as libc::pid_t), libc::SIGKILL);
        }
        let _ = self.child.kill();
    }
}

impl Drop for DapSession {
    fn drop(&mut self) {
        self.kill();
    }
}

#[allow(clippy::too_many_arguments)]
pub fn spawn(
    id: u32,
    app: tauri::AppHandle,
    binary: &std::path::Path,
    args: &[String],
    extra_env: &std::collections::HashMap<String, String>,
    root: &std::path::Path,
    on_message: Channel<Response>,
    on_exit: Channel<DapExit>,
) -> Result<Arc<DapSession>, String> {
    let mut cmd = Command::new(binary);
    cmd.args(args)
        .current_dir(root)
        .envs(crate::modules::lsp::env::server_env_overlay())
        .envs(extra_env)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    crate::modules::proc::hide_console(&mut cmd);
    #[cfg(unix)]
    unsafe {
        use std::os::unix::process::CommandExt;
        cmd.pre_exec(|| {
            libc::setpgid(0, 0);
            Ok(())
        });
    }

    let child = Arc::new(
        SharedChild::spawn(&mut cmd)
            .map_err(|e| format!("dap spawn failed for {}: {e}", binary.display()))?,
    );
    let kill_on_fail = || {
        let _ = child.kill();
    };
    let stdin = child.take_stdin().ok_or_else(|| {
        kill_on_fail();
        "dap: no stdin pipe".to_string()
    })?;
    let mut stdout = child.take_stdout().ok_or_else(|| {
        kill_on_fail();
        "dap: no stdout pipe".to_string()
    })?;
    let mut stderr = child.take_stderr().ok_or_else(|| {
        kill_on_fail();
        "dap: no stderr pipe".to_string()
    })?;

    #[cfg(windows)]
    let job = match crate::modules::proc::job::ProcessJob::create_for(child.id()) {
        Ok(j) => Some(j),
        Err(e) => {
            log::warn!("dap job-object setup failed for pid={}: {e}", child.id());
            None
        }
    };

    let exited = Arc::new(AtomicBool::new(false));
    let session = Arc::new(DapSession {
        #[cfg(windows)]
        _job: job,
        child: child.clone(),
        stdin: Mutex::new(Some(stdin)),
        exited: exited.clone(),
    });

    let session_reader = session.clone();
    thread::Builder::new()
        .name(format!("terax-dap-reader-{id}"))
        .spawn(move || {
            let mut decoder = FrameDecoder::default();
            let mut buf = [0u8; READ_BUF];
            loop {
                match stdout.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => match decoder.push(&buf[..n]) {
                        Ok(messages) => {
                            for text in messages {
                                let resp = Response::new(text.into_bytes());
                                if on_message.send(resp).is_err() {
                                    session_reader.kill();
                                    return;
                                }
                            }
                        }
                        Err(e) => {
                            log::error!("dap id={id}: {e}; killing debugger");
                            session_reader.kill();
                            return;
                        }
                    },
                    Err(e) => {
                        log::debug!("dap id={id} stdout ended: {e}");
                        break;
                    }
                }
            }
        })
        .map_err(|e| format!("dap reader thread failed: {e}"))?;

    let stderr_tail: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
    let stderr_tail_collector = stderr_tail.clone();
    thread::Builder::new()
        .name(format!("terax-dap-stderr-{id}"))
        .spawn(move || {
            use std::io::BufRead;
            let reader = std::io::BufReader::new(&mut stderr);
            for line in reader.lines().map_while(Result::ok) {
                let mut tail = stderr_tail_collector.lock().unwrap();
                if tail.len() >= STDERR_TAIL_LINES {
                    tail.remove(0);
                }
                tail.push(line);
            }
        })
        .map_err(|e| format!("dap stderr thread failed: {e}"))?;

    let waiter_child = child.clone();
    let waiter_exited = exited;
    thread::Builder::new()
        .name(format!("terax-dap-waiter-{id}"))
        .spawn(move || {
            let code = match waiter_child.wait() {
                Ok(status) => status.code(),
                Err(e) => {
                    log::warn!("dap id={id} wait failed: {e}");
                    None
                }
            };
            waiter_exited.store(true, Ordering::Release);
            if let Some(state) = app.try_state::<super::DapState>() {
                state.take(id);
            }
            let tail = stderr_tail.lock().unwrap().join("\n");
            let exit = DapExit {
                code,
                stderr_tail: tail,
                reason: None,
            };
            let _ = on_exit.send(exit);
        })
        .map_err(|e| format!("dap waiter thread failed: {e}"))?;

    Ok(session)
}
