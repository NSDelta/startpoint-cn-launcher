// StartPoint CN Launcher — Tauri backend.
// Ports the former Electron config.js + serverManager.js, plus a reqwest-based
// API proxy so the native admin UI can talk to the local Node server without CORS.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_dialog::DialogExt;

// Default to the working packaged server from this session until we vendor our own copy.
const DEFAULT_SERVER_PATH: &str = "D:/世界弹射物语国服/3. 服务端主体/startpoint_cn";
// Default public GitHub repo hosting the CDN release assets (split tar parts).
const DEFAULT_CDN_REPO: &str = "dennis96292/.cdn";
// Dev location of bundled resources (node / server / tools); P3 installer ships these via resource_dir.
const RESOURCES_DEV: &str = "D:/starpoint-cn-launcher/resources";

// Resolve the bundled-resources directory: prefer the packaged resource_dir, fall back to the dev path.
fn resources_dir(app: &AppHandle) -> PathBuf {
    if let Ok(rd) = app.path().resource_dir() {
        let p = rd.join("resources");
        if p.join("server").exists() || p.join("node").exists() {
            return p;
        }
    }
    PathBuf::from(RESOURCES_DEV)
}

// Strip the Windows extended-length (verbatim) prefix `\\?\` — Node mis-resolves it
// (its realpath splits `\\?\C:` into a bare `C:` component → EISDIR lstat 'C:').
fn strip_verbatim(s: String) -> String {
    s.strip_prefix(r"\\?\").map(|x| x.to_string()).unwrap_or(s)
}

// The CDN lives under the server dir (`<serverRoot>/.cdn`), i.e. inside the install dir.
// This is the server's own default location (`process.env.CDN_DIR || ".cdn"`), so the launcher
// and server agree without any env override, and the NSIS uninstaller removes it in one sweep —
// everything stays under one folder, no scatter, clean uninstall.
fn cdn_dir(app: &AppHandle) -> PathBuf {
    PathBuf::from(read_launcher_config(app).server_path).join(".cdn")
}

// Bundled node.exe if present, else fall back to system "node".
fn node_exe(app: &AppHandle) -> String {
    let p = resources_dir(app).join("node").join("node.exe");
    if p.exists() {
        strip_verbatim(p.to_string_lossy().to_string())
    } else {
        "node".to_string()
    }
}

// The APK patch script lives in <bundle>/tools/patch-apk.mjs (sibling of resources/).
fn patch_script(app: &AppHandle) -> String {
    if let Some(parent) = resources_dir(app).parent() {
        let p = parent.join("tools").join("patch-apk.mjs");
        if p.exists() {
            return strip_verbatim(p.to_string_lossy().to_string());
        }
    }
    strip_verbatim(PATCH_SCRIPT.to_string())
}

// The iOS IPA patch script lives in <bundle>/tools/patch-ipa.mjs (sibling of resources/).
fn ipa_patch_script(app: &AppHandle) -> String {
    if let Some(parent) = resources_dir(app).parent() {
        let p = parent.join("tools").join("patch-ipa.mjs");
        if p.exists() {
            return strip_verbatim(p.to_string_lossy().to_string());
        }
    }
    strip_verbatim("D:/starpoint-cn-launcher/tools/patch-ipa.mjs".to_string())
}

// ---------- shared server state ----------

#[derive(Default)]
struct ServerState {
    pid: Option<u32>,
    status: String, // stopped | starting | running | error
    // Bumped on every start. Background threads (reaper, warmup) capture the generation of the run
    // they belong to and only mutate pid/status if it still matches — so a slow reaper/warmup from a
    // just-stopped run can't clobber the pid/status of a fresh restart.
    generation: u64,
}

struct AppState(Mutex<ServerState>);

// ---------- config types ----------

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct LauncherConfig {
    server_path: String,
    #[serde(default)]
    cdn_repo: Option<String>,
    #[serde(default)]
    debug_log: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AppConfig {
    server_path: String,
    host: String,
    port: String,
    cdn_base_url: String,
    res_version: String,
    cdn_repo: String,
    debug_log: bool,
    session_port: String,
    cloud_cdn: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveUi {
    server_path: Option<String>,
    host: Option<String>,
    port: Option<String>,
    res_version: Option<String>,
    cdn_repo: Option<String>,
    session_port: Option<String>,
    cloud_cdn: Option<bool>,
}

// ---------- config helpers (port of config.js) ----------

fn launcher_config_path(app: &AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_config_dir()
        .unwrap_or_else(|_| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));
    let _ = std::fs::create_dir_all(&dir);
    dir.join("launcher-config.json")
}

fn read_launcher_config(app: &AppHandle) -> LauncherConfig {
    let p = launcher_config_path(app);
    if let Ok(text) = std::fs::read_to_string(&p) {
        if let Ok(cfg) = serde_json::from_str::<LauncherConfig>(&text) {
            return cfg;
        }
    }
    // Default to the bundled/vendored server if present, else the legacy external path.
    let vendored = resources_dir(app).join("server");
    let default_sp = if vendored.join("out").join("cn-server.js").exists() {
        strip_verbatim(vendored.to_string_lossy().to_string())
    } else {
        DEFAULT_SERVER_PATH.to_string()
    };
    LauncherConfig {
        server_path: default_sp,
        cdn_repo: None,
        debug_log: false,
    }
}

fn write_launcher_config(app: &AppHandle, cfg: &LauncherConfig) {
    let p = launcher_config_path(app);
    if let Ok(text) = serde_json::to_string_pretty(cfg) {
        let _ = std::fs::write(&p, text);
    }
}

// ---------- debug file logging (gated by 除錯模式; default OFF = webview-only, no disk) ----------
// Every log line always goes to the webview (capped there, so the UI never bloats). When 除錯模式 is
// ON it is ALSO appended to <serverRoot>/logs/current.log, which rotates+zips at ~50MB (≈5MB .zip
// via deflate) keeping the last 9 archives + the active file. OFF = zero disk usage for normal users.
static DEBUG_LOG: AtomicBool = AtomicBool::new(false);
// Guards the "listening → running" transition so only the first "listening" log line schedules the
// readiness gate (both stdout+stderr readers match "listening"). Reset to false on each start.
static SERVER_READYING: AtomicBool = AtomicBool::new(false);
// Guards the CDN download/import operations (both mutate the same .cdn/_dl dir) against a second
// concurrent run from a double-click, which would race on the same part files and corrupt them.
static CDN_BUSY: AtomicBool = AtomicBool::new(false);
// Resets a busy flag when dropped — moved into the worker thread so the flag clears on ANY exit
// (normal return or panic), never leaving the operation permanently blocked.
struct BusyGuard(&'static AtomicBool);
impl Drop for BusyGuard {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}
static LOG_STATE: OnceLock<Mutex<LogState>> = OnceLock::new();
const LOG_ROTATE_BYTES: u64 = 50 * 1024 * 1024; // ~50MB uncompressed → ~5MB .zip
const LOG_KEEP_ZIPS: usize = 9;

struct LogState {
    dir: PathBuf,
    file: Option<std::fs::File>,
    bytes: u64,
}
fn log_state() -> &'static Mutex<LogState> {
    LOG_STATE.get_or_init(|| {
        Mutex::new(LogState {
            dir: PathBuf::new(),
            file: None,
            bytes: 0,
        })
    })
}

// Central sink for every launcher/server log line: file (if debug on) + webview (always).
fn log_line(app: &AppHandle, line: String) {
    if DEBUG_LOG.load(Ordering::Relaxed) {
        if let Ok(mut st) = log_state().lock() {
            if st.file.is_none() {
                open_log_file(&mut st);
            }
            if let Some(f) = st.file.as_mut() {
                let _ = f.write_all(line.as_bytes());
                let _ = f.write_all(b"\n");
                st.bytes += line.len() as u64 + 1;
            }
            if st.bytes >= LOG_ROTATE_BYTES {
                rotate_log(&mut st);
            }
        }
    }
    let _ = app.emit("server-log", line);
}

fn open_log_file(st: &mut LogState) {
    if st.dir.as_os_str().is_empty() {
        return;
    }
    let _ = std::fs::create_dir_all(&st.dir);
    let path = st.dir.join("current.log");
    if let Ok(f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
    {
        st.bytes = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
        st.file = Some(f);
    }
}

fn rotate_log(st: &mut LogState) {
    st.file = None; // close current.log
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let cur = st.dir.join("current.log");
    let raw = st.dir.join(format!("wf-{stamp}.log"));
    if std::fs::rename(&cur, &raw).is_ok() {
        let zip_path = st.dir.join(format!("wf-{stamp}.log.zip"));
        if zip_file(&raw, &zip_path, &format!("wf-{stamp}.log")).is_ok() {
            let _ = std::fs::remove_file(&raw);
        }
        prune_log_zips(&st.dir);
    }
    st.bytes = 0;
    open_log_file(st);
}

fn zip_file(src: &Path, dst: &Path, entry_name: &str) -> Result<(), String> {
    let mut input = std::fs::File::open(src).map_err(|e| e.to_string())?;
    let out = std::fs::File::create(dst).map_err(|e| e.to_string())?;
    let mut zw = zip::ZipWriter::new(out);
    let opts = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    zw.start_file(entry_name, opts).map_err(|e| e.to_string())?;
    std::io::copy(&mut input, &mut zw).map_err(|e| e.to_string())?;
    zw.finish().map_err(|e| e.to_string())?;
    Ok(())
}

fn prune_log_zips(dir: &Path) {
    let mut zips: Vec<PathBuf> = std::fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().map(|x| x == "zip").unwrap_or(false))
        .collect();
    zips.sort(); // wf-<epoch>.log.zip → lexicographic == oldest-first
    while zips.len() > LOG_KEEP_ZIPS {
        let _ = std::fs::remove_file(zips.remove(0));
    }
}

// Enable/disable debug file logging (persisted); opens/closes the active log file accordingly.
#[tauri::command]
fn set_debug_log(app: AppHandle, enabled: bool) -> Result<(), String> {
    let mut lc = read_launcher_config(&app);
    lc.debug_log = enabled;
    write_launcher_config(&app, &lc);
    DEBUG_LOG.store(enabled, Ordering::Relaxed);
    if let Ok(mut st) = log_state().lock() {
        st.dir = PathBuf::from(&lc.server_path).join("logs");
        if enabled {
            if st.file.is_none() {
                open_log_file(&mut st);
            }
        } else {
            st.file = None;
        }
    }
    let _ = app.emit(
        "server-log",
        format!(
            "[launcher] 除錯模式(寫檔)：{}",
            if enabled { "開" } else { "關" }
        ),
    );
    Ok(())
}

// Initialise debug logging from persisted config at startup.
fn init_debug_log(app: &AppHandle) {
    let lc = read_launcher_config(app);
    if lc.debug_log {
        DEBUG_LOG.store(true, Ordering::Relaxed);
        if let Ok(mut st) = log_state().lock() {
            st.dir = PathBuf::from(&lc.server_path).join("logs");
            open_log_file(&mut st);
        }
    }
}

#[tauri::command]
fn open_log_dir(app: AppHandle) -> Result<(), String> {
    let lc = read_launcher_config(&app);
    let dir = PathBuf::from(&lc.server_path).join("logs");
    let _ = std::fs::create_dir_all(&dir);
    #[cfg(windows)]
    {
        let _ = Command::new("explorer").arg(&dir).spawn();
    }
    Ok(())
}

fn env_path(server_path: &str) -> PathBuf {
    PathBuf::from(server_path).join(".env")
}

fn read_env(server_path: &str) -> HashMap<String, String> {
    let mut out = HashMap::new();
    if let Ok(text) = std::fs::read_to_string(env_path(server_path)) {
        for raw in text.lines() {
            let line = raw.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            if let Some(eq) = line.find('=') {
                let key = line[..eq].trim().to_string();
                let mut val = line[eq + 1..].trim().to_string();
                if val.len() >= 2
                    && ((val.starts_with('"') && val.ends_with('"'))
                        || (val.starts_with('\'') && val.ends_with('\'')))
                {
                    val = val[1..val.len() - 1].to_string();
                }
                out.insert(key, val);
            }
        }
    }
    out
}

// Escape a value for a double-quoted .env line: backslash + quote escaped, newlines stripped
// (a raw newline or unescaped quote would corrupt the line for Node's --env-file parser).
fn env_escape(v: &str) -> String {
    v.replace('\\', "\\\\").replace('"', "\\\"").replace(['\n', '\r'], "")
}

// Update the server's .env in place, preserving unrelated lines/comments.
fn set_env(server_path: &str, updates: &[(String, String)]) {
    let p = env_path(server_path);
    let existing = std::fs::read_to_string(&p).unwrap_or_default();
    let mut remaining: HashMap<&str, &str> =
        updates.iter().map(|(k, v)| (k.as_str(), v.as_str())).collect();

    let mut out_lines: Vec<String> = Vec::new();
    for raw in existing.lines() {
        let t = raw.trim();
        if t.is_empty() || t.starts_with('#') {
            out_lines.push(raw.to_string());
            continue;
        }
        if let Some(eq) = t.find('=') {
            let key = t[..eq].trim();
            if let Some(v) = remaining.remove(key) {
                out_lines.push(format!("{key}=\"{}\"", env_escape(v)));
                continue;
            }
        }
        out_lines.push(raw.to_string());
    }
    // Append any keys that weren't present.
    for (k, v) in updates.iter() {
        if remaining.contains_key(k.as_str()) {
            out_lines.push(format!("{k}=\"{}\"", env_escape(v)));
        }
    }
    // Atomic write: temp file + rename, so a crash mid-write can't leave a truncated .env
    // (which would stop the server from starting). If the temp write fails, the old .env is untouched.
    let content = out_lines.join("\n") + "\n";
    let tmp = std::path::PathBuf::from(format!("{}.tmp", p.to_string_lossy()));
    if std::fs::write(&tmp, &content).is_ok() {
        let _ = std::fs::rename(&tmp, &p);
    }
}

// ---------- config commands ----------

// Beta: when the "cloud CDN" toggle is on, the server hands clients this origin so they download
// the game archives straight from our Cloudflare R2 + CDN (fast, and the host PC needn't store the
// ~10GB). Written to .env as CDN_ARCHIVE_ORIGIN; empty string = off (server serves from local .cdn).
const CLOUD_CDN_ORIGIN: &str = "https://cdn.dennis96292.dev/cn";

#[tauri::command]
fn get_config(app: AppHandle) -> AppConfig {
    let lc = read_launcher_config(&app);
    let env = read_env(&lc.server_path);
    let host = env
        .get("CN_LISTEN_HOST")
        .cloned()
        .unwrap_or_else(|| "127.0.0.1".to_string());
    let port = env
        .get("CN_LISTEN_PORT")
        .cloned()
        .unwrap_or_else(|| "8001".to_string());
    AppConfig {
        cdn_base_url: env
            .get("CDN_BASE_URL")
            .cloned()
            .unwrap_or_else(|| format!("http://{host}:{port}/patch/cn")),
        res_version: env
            .get("CN_RES_VERSION")
            .cloned()
            .unwrap_or_else(|| "1.4.54".to_string()),
        cdn_repo: lc
            .cdn_repo
            .clone()
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| DEFAULT_CDN_REPO.to_string()),
        debug_log: lc.debug_log,
        session_port: env
            .get("SESSION_PORT")
            .cloned()
            .unwrap_or_else(|| "8003".to_string()),
        cloud_cdn: env
            .get("CDN_ARCHIVE_ORIGIN")
            .map(|s| !s.is_empty())
            .unwrap_or(false),
        server_path: lc.server_path,
        host,
        port,
    }
}

// High-level save: keeps host/port/cdn in sync (the IP feeds both server binding and CDN base).
#[tauri::command]
fn save_config(app: AppHandle, ui: SaveUi) -> AppConfig {
    let mut lc = read_launcher_config(&app);
    let mut lc_changed = false;
    if let Some(sp) = ui.server_path.filter(|s| !s.is_empty()) {
        lc.server_path = sp;
        lc_changed = true;
    }
    if let Some(repo) = ui.cdn_repo.filter(|s| !s.is_empty()) {
        lc.cdn_repo = Some(repo);
        lc_changed = true;
    }
    if lc_changed {
        write_launcher_config(&app, &lc);
    }
    let host = ui
        .host
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "127.0.0.1".to_string());
    let port = ui
        .port
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "8001".to_string());

    let mut updates: Vec<(String, String)> = vec![
        ("CN_LISTEN_HOST".to_string(), host.clone()),
        ("CN_LISTEN_PORT".to_string(), port.clone()),
        (
            "CDN_BASE_URL".to_string(),
            format!("http://{host}:{port}/patch/cn"),
        ),
    ];
    if let Some(rv) = ui.res_version.filter(|s| !s.is_empty()) {
        updates.push(("CN_RES_VERSION".to_string(), rv));
    }
    if let Some(sp) = ui.session_port.filter(|s| !s.is_empty()) {
        updates.push(("SESSION_PORT".to_string(), sp));
    }
    if let Some(cloud) = ui.cloud_cdn {
        // on → clients fetch archives from the R2/CDN origin; off → "" (server serves from local .cdn)
        let origin = if cloud { CLOUD_CDN_ORIGIN } else { "" };
        updates.push(("CDN_ARCHIVE_ORIGIN".to_string(), origin.to_string()));
    }
    set_env(&lc.server_path, &updates);
    get_config(app)
}

#[tauri::command]
fn pick_dir(app: AppHandle) -> Option<String> {
    app.dialog()
        .file()
        .blocking_pick_folder()
        .and_then(|fp| fp.into_path().ok())
        .map(|pb| pb.to_string_lossy().to_string())
}

// ---------- server lifecycle (port of serverManager.js) ----------

fn set_status(app: &AppHandle, status: &str) {
    {
        let st = app.state::<AppState>();
        let mut s = st.0.lock().unwrap();
        s.status = status.to_string();
    }
    let _ = app.emit("server-state", status.to_string());
}

// The server prints "listening" the instant fastify binds, but the (post-merge, much larger) server
// needs a short warm-up before the game client's first login burst succeeds — launching in the first
// ~1s hits a cold-start window and the login fails (client retries and works on the 2nd try). So on
// the first "listening" line we don't flip to "running" immediately: we probe currentTime until it
// answers, then hold a short warm buffer, THEN mark running — so the user only launches once ready.
fn on_server_listening(app: &AppHandle, gen: u64) {
    if SERVER_READYING.swap(true, Ordering::SeqCst) {
        return; // already handled (stdout+stderr both emit a "listening" line)
    }
    let app = app.clone();
    std::thread::spawn(move || {
        let env = read_env(&read_launcher_config(&app).server_path);
        let host = env.get("CN_LISTEN_HOST").cloned().unwrap_or_else(|| "127.0.0.1".to_string());
        let port = env.get("CN_LISTEN_PORT").cloned().unwrap_or_else(|| "8001".to_string());
        let url = format!("http://{host}:{port}/api/server/currentTime");
        let client = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(2))
            .build()
            .ok();
        // Wait until HTTP actually answers (up), then a fixed warm buffer (settles the larger runtime).
        for _ in 0..25 {
            let ok = client
                .as_ref()
                .and_then(|c| c.get(&url).send().ok())
                .map(|r| r.status().is_success())
                .unwrap_or(false);
            if ok {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(200));
        }
        std::thread::sleep(std::time::Duration::from_millis(3000));
        // Only flip to running if THIS run is still current — bail if the server was stopped
        // (pid cleared) or superseded by a restart (generation moved on) during the warm-up window.
        {
            let st = app.state::<AppState>();
            let s = st.0.lock().unwrap();
            if s.pid.is_none() || s.generation != gen {
                return;
            }
        }
        set_status(&app, "running");
    });
}

#[tauri::command]
fn start_server(app: AppHandle) -> Result<(), String> {
    {
        let st = app.state::<AppState>();
        if st.0.lock().unwrap().pid.is_some() {
            return Err("伺服器已在執行".to_string());
        }
    }

    let lc = read_launcher_config(&app);
    let server_path = PathBuf::from(&lc.server_path);
    let entry = server_path.join("out").join("cn-server.js");
    if !entry.exists() {
        let msg = format!(
            "找不到伺服器進入點：{}（請先在伺服器目錄 npm run build）",
            entry.display()
        );
        let _ = log_line(&app, format!("[launcher] {msg}"));
        set_status(&app, "error");
        return Err(msg);
    }

    SERVER_READYING.store(false, Ordering::SeqCst); // arm the readiness gate for this run
    set_status(&app, "starting");
    let _ = log_line(&app, format!("[launcher] 啟動 {}", entry.display()));

    // Mirror the server's own start command: node --env-file=.env out/cn-server.js
    // CDN + DB use the server's own defaults (<serverRoot>/.cdn, <serverRoot>/.database) — no env
    // override — so everything lives under the install dir and uninstall removes it in one sweep.
    let mut cmd = Command::new(node_exe(&app));
    cmd.args(["--env-file=.env", "out/cn-server.js"])
        .current_dir(&server_path)
        // The server watches this PID and self-exits if the launcher dies (crash/force-close) — so a
        // node orphan can't linger holding the ports. Cross-platform, no Job-object FFI needed.
        .env("LAUNCHER_PID", std::process::id().to_string())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            let _ = log_line(&app, format!("[launcher] 啟動失敗: {e}"));
            set_status(&app, "error");
            return Err(e.to_string());
        }
    };

    let pid = child.id();
    // Bump generation as we claim the pid; the reader/reaper/warmup threads capture this `gen` and
    // only touch shared state while it's still current.
    let gen = {
        let st = app.state::<AppState>();
        let mut s = st.0.lock().unwrap();
        s.generation = s.generation.wrapping_add(1);
        s.pid = Some(pid);
        s.generation
    };

    let stdout = child.stdout.take().expect("piped stdout");
    let stderr = child.stderr.take().expect("piped stderr");

    // stderr reader
    {
        let app2 = app.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                if line.to_lowercase().contains("listening") {
                    on_server_listening(&app2, gen);
                }
                let _ = log_line(&app2, line);
            }
        });
    }

    // stdout reader; this thread owns `child` and reaps it on exit.
    {
        let app3 = app.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                if line.to_lowercase().contains("listening") {
                    on_server_listening(&app3, gen);
                }
                let _ = log_line(&app3, line);
            }
            // stdout closed → the process has exited; reap it. Only clear pid / flip to "stopped" if
            // this reaper's run is still current — a quick stop→start may have already replaced it.
            let _ = child.wait();
            let is_current = {
                let st = app3.state::<AppState>();
                let mut s = st.0.lock().unwrap();
                if s.generation == gen {
                    s.pid = None;
                    true
                } else {
                    false
                }
            };
            if is_current {
                set_status(&app3, "stopped");
                let _ = log_line(&app3, "[launcher] 伺服器結束".to_string());
            }
        });
    }

    Ok(())
}

#[tauri::command]
fn stop_server(app: AppHandle) -> Result<(), String> {
    let pid = {
        let st = app.state::<AppState>();
        let p = st.0.lock().unwrap().pid;
        p
    };
    let Some(pid) = pid else {
        return Ok(());
    };
    let _ = log_line(&app, "[launcher] 停止伺服器…".to_string());

    // Kill the whole tree (node + any children) and WAIT for taskkill to finish (was fire-and-forget
    // .spawn(), which raced a subsequent restart). Then clear pid immediately so restart isn't blocked
    // by the async child-exit watcher lagging.
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let mut c = Command::new("taskkill");
        c.args(["/pid", &pid.to_string(), "/T", "/F"])
            .creation_flags(0x0800_0000);
        let _ = c.output(); // wait for the kill to complete
    }
    #[cfg(not(windows))]
    {
        let _ = Command::new("kill").arg(pid.to_string()).status();
    }
    {
        let st = app.state::<AppState>();
        let mut s = st.0.lock().unwrap();
        s.pid = None;
        s.generation = s.generation.wrapping_add(1); // retire this run so its reaper/warmup go quiet
    }
    set_status(&app, "stopped");
    Ok(())
}

#[derive(Serialize)]
struct StateInfo {
    status: String,
    pid: Option<u32>,
}

#[tauri::command]
fn server_state(app: AppHandle) -> StateInfo {
    let st = app.state::<AppState>();
    let s = st.0.lock().unwrap();
    StateInfo {
        status: if s.status.is_empty() {
            "stopped".to_string()
        } else {
            s.status.clone()
        },
        pid: s.pid,
    }
}

// ---------- API proxy (avoids webview CORS to the LAN Node server) ----------

#[derive(Serialize)]
struct ApiResponse {
    status: u16,
    body: String,
    location: Option<String>,
}

#[tauri::command]
async fn api_request(
    app: AppHandle,
    method: String,
    path: String,
    body: Option<String>,
    content_type: Option<String>,
) -> Result<ApiResponse, String> {
    let cfg = get_config(app);
    let url = format!("http://{}:{}{}", cfg.host, cfg.port, path);

    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| e.to_string())?;

    let m = reqwest::Method::from_bytes(method.to_uppercase().as_bytes())
        .map_err(|e| e.to_string())?;
    let mut req = client.request(m, &url);
    if let Some(ct) = content_type {
        req = req.header("content-type", ct);
    }
    if let Some(b) = body {
        req = req.body(b);
    }

    let resp = req.send().await.map_err(|e| e.to_string())?;
    let status = resp.status().as_u16();
    let location = resp
        .headers()
        .get("location")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let text = resp.text().await.unwrap_or_default();

    Ok(ApiResponse {
        status,
        body: text,
        location,
    })
}

// ---------- first-run CDN download (P1) ----------

#[derive(Serialize)]
struct CdnStatus {
    present: bool,
    cn_dir: String,
}

#[tauri::command]
fn cdn_status(app: AppHandle) -> CdnStatus {
    let cn = cdn_dir(&app).join("cn");
    // "Present" means a COMPLETE download/import, proven by the `.complete` marker that the
    // download/import writes ONLY after the whole tar extracts successfully. A folder that merely
    // has some files (e.g. extraction was interrupted, or only part of the split tar was imported)
    // is NOT complete — so we never trust "the dir has content", only the marker.
    let present = cdn_complete_marker(&cdn_dir(&app)).exists();
    CdnStatus {
        present,
        cn_dir: cn.to_string_lossy().to_string(),
    }
}

// The completion marker — present iff a download/import fully finished.
fn cdn_complete_marker(cdn_root: &Path) -> PathBuf {
    cdn_root.join(".complete")
}

// Delete the downloaded CDN to reclaim disk without uninstalling the whole app.
// (Uninstall already removes it via the NSIS hook; this is just a manual "free space" button.)
#[tauri::command]
fn cdn_clear(app: AppHandle) -> Result<(), String> {
    let cdn = cdn_dir(&app);
    if cdn.exists() {
        std::fs::remove_dir_all(&cdn).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[derive(Deserialize)]
struct CdnPart {
    name: String,
    size: u64,
    sha256: String,
}

#[derive(Deserialize)]
struct CdnManifest {
    parts: Vec<CdnPart>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CdnProgress {
    phase: String, // download | extract
    current: u64,
    total: u64,
    percent: u32,
    label: String,
}

// A Read that concatenates several files in order (streamed reassembly of the split tar).
struct MultiFileReader {
    paths: Vec<PathBuf>,
    idx: usize,
    cur: Option<std::fs::File>,
}
impl MultiFileReader {
    fn new(paths: Vec<PathBuf>) -> Self {
        Self {
            paths,
            idx: 0,
            cur: None,
        }
    }
}
impl Read for MultiFileReader {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        loop {
            if self.cur.is_none() {
                if self.idx >= self.paths.len() {
                    return Ok(0);
                }
                self.cur = Some(std::fs::File::open(&self.paths[self.idx])?);
                self.idx += 1;
            }
            let n = self.cur.as_mut().unwrap().read(buf)?;
            if n == 0 {
                self.cur = None;
                continue;
            }
            return Ok(n);
        }
    }
}

fn hex(bytes: impl AsRef<[u8]>) -> String {
    bytes.as_ref().iter().map(|b| format!("{:02x}", b)).collect()
}

fn sha256_file(p: &Path) -> std::io::Result<String> {
    let mut f = std::fs::File::open(p)?;
    let mut h = Sha256::new();
    let mut buf = vec![0u8; 1 << 20];
    loop {
        let n = f.read(&mut buf)?;
        if n == 0 {
            break;
        }
        h.update(&buf[..n]);
    }
    Ok(hex(h.finalize()))
}

fn emit_progress(app: &AppHandle, phase: &str, current: u64, total: u64, label: &str) {
    let percent = if total > 0 {
        ((current as f64 / total as f64) * 100.0) as u32
    } else {
        0
    };
    let _ = app.emit(
        "cdn-progress",
        CdnProgress {
            phase: phase.to_string(),
            current,
            total,
            percent,
            label: label.to_string(),
        },
    );
}

// The pinned 1.4.54 CDN unpacks to 706 tar entries (`tar -C .cdn cn` = the `cn/` dir + all files).
// Used as the completeness floor: a truncated stream (missing/short/misordered parts) or skipped
// entries end well below this. Bump if the shipped CDN version changes.
const EXPECTED_MIN_CDN_ENTRIES: u64 = 706;

// Extract the reassembled split-tar into `cdn_root`. Counts ONLY entries actually written — tar's
// `unpack_in` returns Ok(false) for entries it silently skips (unsafe/invalid paths), which must
// NOT count as success. A truncated stream ends the iterator with no error, so we also require the
// unpacked count to reach EXPECTED_MIN_CDN_ENTRIES; otherwise the CDN is incomplete and the caller
// must NOT write the `.complete` marker (which is what made partial CDNs pass as complete → the
// "game runs but no 立繪" bug, since the large late assets never extracted).
fn extract_cdn_tar(app: &AppHandle, parts: Vec<PathBuf>, cdn_root: &Path) -> Result<u64, String> {
    let mut archive = tar::Archive::new(MultiFileReader::new(parts));
    let mut unpacked: u64 = 0;
    let mut skipped: u64 = 0;
    for entry in archive.entries().map_err(|e| e.to_string())? {
        let mut e = entry.map_err(|er| er.to_string())?;
        if e.unpack_in(cdn_root).map_err(|er| er.to_string())? {
            unpacked += 1;
        } else {
            skipped += 1;
        }
        if (unpacked + skipped) % 25 == 0 {
            emit_progress(app, "extract", unpacked + skipped, EXPECTED_MIN_CDN_ENTRIES, "解壓中");
        }
    }
    if skipped > 0 {
        let _ = app.emit(
            "server-log",
            format!("[cdn] ⚠ 有 {skipped} 個條目被略過(路徑不安全/無效)"),
        );
    }
    if unpacked < EXPECTED_MIN_CDN_ENTRIES {
        return Err(format!(
            "CDN 解壓不完整:只解出 {unpacked} 項(應至少 {EXPECTED_MIN_CDN_ENTRIES} 項{})。\
             資源可能缺卷、分卷順序錯誤或損毀 — 請重新下載,或確認匯入時已選齊「全部」分卷(part.00～part.05)。",
            if skipped > 0 { format!(",另有 {skipped} 項被略過") } else { String::new() }
        ));
    }
    emit_progress(app, "extract", unpacked, unpacked, "解壓完成");
    Ok(unpacked)
}

// Authoritative parts of the pinned cdn-1.4.54 release (mirrors cdn-manifest.json). Lets the IMPORT
// path verify OFFLINE (GitHub blocked → users import) and report exactly which parts are missing /
// wrong-size / corrupt ("缺啥補啥"). Update alongside EXPECTED_MIN_CDN_ENTRIES when the CDN version
// changes. (The download path fetches this same manifest live over the network.)
const EXPECTED_CDN_PARTS: &[(&str, u64, &str)] = &[
    ("cn-cdn.tar.part.00", 1992294400, "7bc90950f663b7e9d2f728ca68919ecdf58031702bd592df49d68347c97a585d"),
    ("cn-cdn.tar.part.01", 1992294400, "772079676898bf7c79e5f2991d1e59dca4b85d5495f89d0a3d6c9e75968bd5f3"),
    ("cn-cdn.tar.part.02", 1992294400, "0f90abadd7734ef25d35c0a410df9cbdb16eb90ba367b66f2ad51c2c98db9d0c"),
    ("cn-cdn.tar.part.03", 1992294400, "28c453cfd307ca39c9611adf8899ee46d06097992faec8d7964735d444dbee5d"),
    ("cn-cdn.tar.part.04", 1992294400, "2a24a538c942af0f068679f0706c6f22e2e95c802fd1fbf99144eadb059b8c8b"),
    ("cn-cdn.tar.part.05", 921968640,  "3d7c97bd7d64ab91906427f2b1492aeac0e2d81b3d4203ac51e15755a26ed8b3"),
];

// Verify imported split-tar parts against the manifest; error names exactly which parts are missing,
// truncated (wrong size), or corrupt (bad sha256) so the user supplies only those ("缺啥補啥").
fn verify_imported_parts(app: &AppHandle, parts: &[PathBuf]) -> Result<(), String> {
    use std::collections::HashMap;
    let by_name: HashMap<String, PathBuf> = parts
        .iter()
        .filter_map(|p| p.file_name().map(|n| (n.to_string_lossy().to_string(), p.clone())))
        .collect();
    // Presence + size (instant) — catches missing卷 and truncated卷.
    let mut missing: Vec<String> = Vec::new();
    let mut wrong_size: Vec<String> = Vec::new();
    for (name, size, _sha) in EXPECTED_CDN_PARTS {
        match by_name.get(*name) {
            None => missing.push((*name).to_string()),
            Some(p) => {
                if !std::fs::metadata(p).map(|m| m.len() == *size).unwrap_or(false) {
                    wrong_size.push((*name).to_string());
                }
            }
        }
    }
    if !missing.is_empty() || !wrong_size.is_empty() {
        let mut msg = String::from("資源分卷不齊,請補齊後重試(需要全部 6 卷 part.00～part.05):");
        if !missing.is_empty() {
            msg += &format!("\n  缺少: {}", missing.join(", "));
        }
        if !wrong_size.is_empty() {
            msg += &format!("\n  大小不符(未下載完/損毀): {}", wrong_size.join(", "));
        }
        return Err(msg);
    }
    // All present + correct size → sha256 integrity check; name exactly which is corrupt.
    let n = EXPECTED_CDN_PARTS.len() as u64;
    let mut corrupt: Vec<String> = Vec::new();
    for (i, (name, _size, sha)) in EXPECTED_CDN_PARTS.iter().enumerate() {
        let p = match by_name.get(*name) {
            Some(p) => p,
            None => continue,
        };
        emit_progress(app, "verify", i as u64, n, &format!("校驗 {name}"));
        if sha256_file(p).map(|h| h == *sha).unwrap_or(false) {
            let _ = log_line(&app, format!("[cdn] {name} 校驗 OK"));
        } else {
            corrupt.push((*name).to_string());
        }
    }
    if !corrupt.is_empty() {
        return Err(format!("以下分卷損毀(sha256 不符),請重新取得: {}", corrupt.join(", ")));
    }
    Ok(())
}

#[tauri::command]
fn cdn_download(app: AppHandle, mirror: Option<String>) -> Result<(), String> {
    let lc = read_launcher_config(&app);
    let cfg = get_config(app.clone());
    let repo = lc
        .cdn_repo
        .clone()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| DEFAULT_CDN_REPO.to_string());
    let tag = format!("cdn-{}", cfg.res_version);
    let cdn_root = cdn_dir(&app).to_string_lossy().to_string();
    let mirror = mirror.unwrap_or_default();

    if CDN_BUSY.swap(true, Ordering::SeqCst) {
        return Err("CDN 作業進行中，請稍候".to_string());
    }
    let guard = BusyGuard(&CDN_BUSY);
    std::thread::spawn(move || {
        let _guard = guard; // clears CDN_BUSY when this thread ends (success, error, or panic)
        // Auto-repair: run up to 3 rounds. Each round RESUMES (already-correct parts are skipped by
        // size+sha256, only missing/bad ones re-fetched) and re-checks completeness at extract. Only
        // give up (surface cdn-error) after 3 failed rounds — then the message suggests a mirror swap.
        let mut last_err = String::new();
        // Parts verified good in an earlier round are recorded here so later rounds skip re-hashing
        // them (re-sha256 of ~10GB every retry is slow). Good parts are never rewritten mid-run, so
        // caching their verified state within this single download is safe.
        let mut verified: std::collections::HashSet<String> = std::collections::HashSet::new();
        for attempt in 1..=3u32 {
            match run_cdn_download(&app, &repo, &tag, &cdn_root, &mirror, &mut verified) {
                Ok(()) => return,
                Err(e) => {
                    last_err = e;
                    let _ = log_line(&app, format!("[cdn] 第 {attempt}/3 輪失敗: {last_err}"));
                    if attempt < 3 {
                        let _ = log_line(&app, "[cdn] 自動續傳重試中(只補缺/損壞的分卷)…".to_string());
                        std::thread::sleep(std::time::Duration::from_secs(3));
                    }
                }
            }
        }
        let _ = log_line(&app, format!("[cdn] 失敗: {last_err}"));
        let _ = app.emit("cdn-error", last_err);
    });
    Ok(())
}

// Download one part with categorized errors; deletes the file on checksum failure so a
// retry re-fetches it (and the skip-if-already check won't wrongly accept a bad file).
fn download_one(
    app: &AppHandle,
    client: &reqwest::blocking::Client,
    url: &str,
    dest: &Path,
    expected_sha: &str,
    base_done: u64,
    total: u64,
    name: &str,
) -> Result<(), String> {
    let mut resp = client.get(url).send().map_err(|e| format!("連線失敗: {e}"))?;
    let st = resp.status();
    if !st.is_success() {
        return Err(format!("HTTP {}（來源回應錯誤,可能限流或失效）", st.as_u16()));
    }
    let mut file = std::fs::File::create(dest).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 1 << 20];
    let mut cur: u64 = 0;
    loop {
        let n = resp.read(&mut buf).map_err(|e| format!("傳輸中斷: {e}"))?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n]).map_err(|e| e.to_string())?;
        hasher.update(&buf[..n]);
        cur += n as u64;
        emit_progress(app, "download", base_done + cur, total, name);
    }
    drop(file);
    if hex(hasher.finalize()) != expected_sha {
        let _ = std::fs::remove_file(dest);
        return Err("內容校驗失敗(來源可能回傳錯誤頁或檔案不完整)".to_string());
    }
    Ok(())
}

fn run_cdn_download(app: &AppHandle, repo: &str, tag: &str, cdn_root: &str, mirror: &str, verified: &mut std::collections::HashSet<String>) -> Result<(), String> {
    // A China mirror prefixes the github URL, e.g. https://gh-proxy.com/https://github.com/owner/repo/...
    let gh = format!("https://github.com/{repo}/releases/download/{tag}");
    let base = if mirror.is_empty() { gh } else { format!("{mirror}{gh}") };
    let _ = log_line(&app, format!("[cdn] 來源: {base}"));
    let _ = app.emit(
        "server-log",
        format!("[cdn] 讀取 manifest: {base}/cdn-manifest.json"),
    );

    let client = reqwest::blocking::Client::builder()
        .build()
        .map_err(|e| e.to_string())?;

    // Fetch the manifest with up to 3 retries (mirrors are flaky).
    let manifest: CdnManifest = {
        let mut last = String::new();
        let mut got = None;
        for attempt in 1..=3u32 {
            match client
                .get(format!("{base}/cdn-manifest.json"))
                .send()
                .and_then(|r| r.error_for_status())
                .and_then(|r| r.json::<CdnManifest>())
            {
                Ok(m) => {
                    got = Some(m);
                    break;
                }
                Err(e) => {
                    last = e.to_string();
                    let _ = log_line(&app, format!("[cdn] manifest 第 {attempt}/3 次失敗: {last}"));
                    if attempt < 3 {
                        std::thread::sleep(std::time::Duration::from_secs(2 * attempt as u64));
                    }
                }
            }
        }
        got.ok_or_else(|| {
            format!("無法取得資源清單: {last}（GitHub 可能被牆;請在「下載來源」改選鏡像,或改用「匯入本地資源檔」）")
        })?
    };

    let dl_dir = PathBuf::from(cdn_root).join("_dl");
    std::fs::create_dir_all(&dl_dir).map_err(|e| e.to_string())?;

    // Mark the CDN incomplete until the whole extraction finishes — so if this run is interrupted
    // (app closed mid-download/extract), the leftover files are correctly treated as incomplete.
    let marker = cdn_complete_marker(Path::new(cdn_root));
    let _ = std::fs::remove_file(&marker);

    let total: u64 = manifest.parts.iter().map(|p| p.size).sum();
    let mut done: u64 = 0; // bytes from fully-completed parts

    // Download + verify each part, with up to 3 retries (already-correct parts skipped → resumable).
    for part in &manifest.parts {
        let dest = dl_dir.join(&part.name);
        // Already verified good earlier in this run → only cheap size-check (guard against the file
        // vanishing), no re-hash. Otherwise full size + sha256 check.
        let already = if verified.contains(&part.name) {
            dest.metadata().map(|m| m.len() == part.size).unwrap_or(false)
        } else {
            dest.metadata().map(|m| m.len() == part.size).unwrap_or(false)
                && sha256_file(&dest).map(|h| h == part.sha256).unwrap_or(false)
        };
        if already {
            verified.insert(part.name.clone());
            done += part.size;
            emit_progress(app, "download", done, total, &format!("{} 已存在", part.name));
            let _ = log_line(&app, format!("[cdn] {} 已存在(略過)", part.name));
            continue;
        }

        let _ = log_line(&app, format!("[cdn] 下載 {}", part.name));
        let url = format!("{base}/{}", part.name);
        let mut ok = false;
        let mut last = String::new();
        for attempt in 1..=3u32 {
            match download_one(app, &client, &url, &dest, &part.sha256, done, total, &part.name) {
                Ok(_) => {
                    ok = true;
                    break;
                }
                Err(e) => {
                    last = e;
                    let _ = log_line(&app, format!("[cdn] {} 第 {attempt}/3 次失敗: {last}", part.name));
                    if attempt < 3 {
                        std::thread::sleep(std::time::Duration::from_secs(2 * attempt as u64));
                    }
                }
            }
        }
        if !ok {
            return Err(format!(
                "{}：{last}（已重試 3 次。請在「下載來源」改選其他鏡像,或改用「匯入本地資源檔」）",
                part.name
            ));
        }
        done += part.size;
        verified.insert(part.name.clone()); // freshly downloaded + sha-verified → don't re-hash next round
        let _ = log_line(&app, format!("[cdn] {} 校驗 OK", part.name));
    }

    // Extract: stream the parts straight into tar (no intermediate full tar on disk).
    let _ = log_line(&app, "[cdn] 解壓中…".to_string());
    let cdn_root = PathBuf::from(cdn_root);
    let part_paths: Vec<PathBuf> = manifest.parts.iter().map(|p| dl_dir.join(&p.name)).collect();
    // Extraction verifies completeness (>= EXPECTED_MIN_CDN_ENTRIES); on shortfall it errors and we
    // never reach the marker write below → an incomplete CDN is correctly left un-marked.
    let count = extract_cdn_tar(app, part_paths, &cdn_root)?;

    // Everything unpacked → write the completion marker. Only now is the CDN considered present.
    std::fs::write(&marker, format!("count={count}\n")).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_dir_all(&dl_dir);
    let _ = log_line(&app, format!("[cdn] 完成（{count} 個項目）"));
    let _ = app.emit("cdn-done", count);
    Ok(())
}

// ---------- APK patch / redirect (P2) ----------

// Dev path to the patcher script; P3 will bundle this as a Tauri resource.
const PATCH_SCRIPT: &str = "D:/starpoint-cn-launcher/tools/patch-apk.mjs";

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ApkProgress {
    current: u32,
    total: u32,
    label: String,
}

#[tauri::command]
fn pick_file(app: AppHandle) -> Option<String> {
    app.dialog()
        .file()
        .add_filter("APK", &["apk"])
        .blocking_pick_file()
        .and_then(|fp| fp.into_path().ok())
        .map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
fn patch_apk(app: AppHandle, apk_path: String) -> Result<(), String> {
    if apk_path.is_empty() {
        return Err("請先選擇原始 APK".to_string());
    }
    let apk = PathBuf::from(&apk_path);
    if !apk.exists() {
        return Err(format!("APK 不存在：{apk_path}"));
    }
    let cfg = get_config(app.clone());
    let out = apk
        .parent()
        .unwrap_or(Path::new("."))
        .join("wf-redirected.apk")
        .to_string_lossy()
        .to_string();
    let ks = launcher_config_path(&app)
        .parent()
        .map(|d| d.join("launcher.jks"))
        .unwrap_or_else(|| PathBuf::from("launcher.jks"))
        .to_string_lossy()
        .to_string();
    let host = cfg.host.clone();
    let port = cfg.port.clone();
    let script = patch_script(&app);

    std::thread::spawn(move || {
        let _ = app.emit(
            "server-log",
            format!("[apk] 開始打包：{apk_path} → {out}（{host}:{port}）"),
        );
        let _ = log_line(&app, format!("[apk] node={} | script={}", node_exe(&app), script));
        let mut cmd = Command::new(node_exe(&app));
        cmd.arg(&script)
            .arg(format!("--apk={apk_path}"))
            .arg(format!("--host={host}"))
            .arg(format!("--port={port}"))
            .arg(format!("--out={out}"))
            .arg(format!("--keystore={ks}"))
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000);
        }
        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                let _ = app.emit("apk-error", format!("無法啟動 node：{e}"));
                return;
            }
        };
        let stdout = child.stdout.take().expect("stdout");
        let stderr = child.stderr.take().expect("stderr");
        {
            let a = app.clone();
            std::thread::spawn(move || {
                for l in BufReader::new(stderr).lines().map_while(Result::ok) {
                    let _ = log_line(&a, format!("[apk] {l}"));
                }
            });
        }
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if let Some(rest) = line.strip_prefix("STEP ") {
                let mut it = rest.splitn(2, ' ');
                let frac = it.next().unwrap_or("");
                let label = it.next().unwrap_or("").to_string();
                let mut fp = frac.split('/');
                let current = fp.next().and_then(|s| s.parse().ok()).unwrap_or(0);
                let total = fp.next().and_then(|s| s.parse().ok()).unwrap_or(8);
                let _ = app.emit("apk-progress", ApkProgress { current, total, label });
            } else if let Some(p) = line.strip_prefix("DONE ") {
                let _ = app.emit("apk-done", p.to_string());
            } else if let Some(m) = line.strip_prefix("ERROR ") {
                let _ = app.emit("apk-error", m.to_string());
            }
            let _ = log_line(&app, format!("[apk] {line}"));
        }
        let _ = child.wait();
    });
    Ok(())
}

// ---------- iOS IPA patch / redirect (CN-aligned, no proxy) ----------

#[tauri::command]
fn pick_ipa(app: AppHandle) -> Option<String> {
    app.dialog()
        .file()
        .add_filter("IPA", &["ipa"])
        .blocking_pick_file()
        .and_then(|fp| fp.into_path().ok())
        .map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
fn patch_ipa(app: AppHandle, ipa_path: String) -> Result<(), String> {
    if ipa_path.is_empty() {
        return Err("請先選擇原始 IPA".to_string());
    }
    let ipa = PathBuf::from(&ipa_path);
    if !ipa.exists() {
        return Err(format!("IPA 不存在：{ipa_path}"));
    }
    let cfg = get_config(app.clone());
    let out = ipa
        .parent()
        .unwrap_or(Path::new("."))
        .join("wf-redirected.ipa")
        .to_string_lossy()
        .to_string();
    // Embed the SAME host the server is bound to (cfg.host = CN_LISTEN_HOST = the PC IP the launcher
    // auto-detected on setup). Identical source to patch_apk → the IPA always points to exactly where
    // the server listens, so client and server can never diverge. (To follow a changed PC IP: re-detect
    // in 設定 → it updates cfg.host + the server bind, then re-package.)
    let host = cfg.host.clone();
    let port = cfg.port.clone();
    let script = ipa_patch_script(&app);

    std::thread::spawn(move || {
        let _ = app.emit(
            "server-log",
            format!("[ipa] 開始打包：{ipa_path} → {out}（{host}:{port}）"),
        );
        let _ = log_line(&app, format!("[ipa] node={} | script={}", node_exe(&app), script));
        let mut cmd = Command::new(node_exe(&app));
        cmd.arg(&script)
            .arg(format!("--ipa={ipa_path}"))
            .arg(format!("--host={host}"))
            .arg(format!("--port={port}"))
            .arg(format!("--out={out}"))
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000);
        }
        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                let _ = app.emit("ipa-error", format!("無法啟動 node：{e}"));
                return;
            }
        };
        let stdout = child.stdout.take().expect("stdout");
        let stderr = child.stderr.take().expect("stderr");
        {
            let a = app.clone();
            std::thread::spawn(move || {
                for l in BufReader::new(stderr).lines().map_while(Result::ok) {
                    let _ = log_line(&a, format!("[ipa] {l}"));
                }
            });
        }
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if let Some(rest) = line.strip_prefix("STEP ") {
                let mut it = rest.splitn(2, ' ');
                let frac = it.next().unwrap_or("");
                let label = it.next().unwrap_or("").to_string();
                let mut fp = frac.split('/');
                let current = fp.next().and_then(|s| s.parse().ok()).unwrap_or(0);
                let total = fp.next().and_then(|s| s.parse().ok()).unwrap_or(4);
                let _ = app.emit("ipa-progress", ApkProgress { current, total, label });
            } else if let Some(p) = line.strip_prefix("DONE ") {
                let _ = app.emit("ipa-done", p.to_string());
            } else if let Some(m) = line.strip_prefix("ERROR ") {
                let _ = app.emit("ipa-error", m.to_string());
            }
            let _ = log_line(&app, format!("[ipa] {line}"));
        }
        let _ = child.wait();
    });
    Ok(())
}

// ---------- misc helpers (P3 polish) ----------

// Pick any file (used for importing a save JSON).
#[tauri::command]
fn pick_file_any(app: AppHandle) -> Option<String> {
    app.dialog()
        .file()
        .blocking_pick_file()
        .and_then(|fp| fp.into_path().ok())
        .map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

// Save text to a user-chosen path (used to export a player's save JSON).
#[tauri::command]
fn save_text_file(app: AppHandle, default_name: String, content: String) -> Result<bool, String> {
    match app
        .dialog()
        .file()
        .set_file_name(&default_name)
        .blocking_save_file()
        .and_then(|fp| fp.into_path().ok())
    {
        Some(p) => {
            std::fs::write(&p, content).map_err(|e| e.to_string())?;
            Ok(true)
        }
        None => Ok(false),
    }
}

// Pick multiple files (used for importing all CDN split parts at once).
#[tauri::command]
fn pick_files_any(app: AppHandle) -> Vec<String> {
    app.dialog()
        .file()
        .blocking_pick_files()
        .map(|v| {
            v.into_iter()
                .filter_map(|fp| fp.into_path().ok())
                .map(|p| p.to_string_lossy().to_string())
                .collect()
        })
        .unwrap_or_default()
}

// ---------- network helpers (P3 polish) ----------

// Detect the primary LAN IPv4 by opening a UDP socket toward a public IP (no traffic sent).
#[tauri::command]
fn local_ip() -> String {
    use std::net::UdpSocket;
    UdpSocket::bind("0.0.0.0:0")
        .and_then(|s| {
            s.connect("8.8.8.8:80")?;
            s.local_addr()
        })
        .map(|a| a.ip().to_string())
        .unwrap_or_else(|_| "127.0.0.1".to_string())
}

// True if the given host:port can be bound (i.e. the port is free).
#[tauri::command]
fn port_available(host: String, port: u16) -> bool {
    let h = if host.is_empty() { "0.0.0.0".to_string() } else { host };
    std::net::TcpListener::bind((h.as_str(), port)).is_ok()
}

// List the next `count` UNOCCUPIED ports at or above `start` (for the settings port dropdowns).
#[tauri::command]
fn list_free_ports(host: String, start: u16, count: u16) -> Vec<u16> {
    let mut out = Vec::new();
    let mut p = start;
    loop {
        if out.len() >= count as usize || p >= 65500 {
            break;
        }
        if port_available(host.clone(), p) {
            out.push(p);
        }
        p = p.saturating_add(1);
    }
    out
}

// Import the CDN from a local archive (for users who can't reach GitHub).
// Accepts the single `cn-cdn.tar` or any one of the `cn-cdn.tar.part.NN` split parts
// (siblings are gathered + concatenated), and stream-extracts into <serverPath>/.cdn.
#[tauri::command]
fn cdn_import(app: AppHandle, archive_paths: Vec<String>) -> Result<(), String> {
    let cdn_root = cdn_dir(&app).to_string_lossy().to_string();
    if CDN_BUSY.swap(true, Ordering::SeqCst) {
        return Err("CDN 作業進行中，請稍候".to_string());
    }
    let guard = BusyGuard(&CDN_BUSY);
    std::thread::spawn(move || {
        let _guard = guard; // clears CDN_BUSY when this thread ends
        if let Err(e) = run_cdn_import(&app, archive_paths, &cdn_root) {
            let _ = log_line(&app, format!("[cdn] 匯入失敗: {e}"));
            let _ = app.emit("cdn-error", e);
        }
    });
    Ok(())
}

fn run_cdn_import(app: &AppHandle, archive_paths: Vec<String>, cdn_root: &str) -> Result<(), String> {
    let _ = log_line(&app, format!("[cdn] 匯入本地資源（{} 個檔）", archive_paths.len()));
    let cdn_root = PathBuf::from(cdn_root);
    std::fs::create_dir_all(&cdn_root).map_err(|e| e.to_string())?;
    let marker = cdn_complete_marker(&cdn_root);
    let _ = std::fs::remove_file(&marker); // incomplete until extraction succeeds

    let parts: Vec<PathBuf> = if archive_paths.len() > 1 {
        // user multi-selected the parts → sort by name and concatenate
        let mut v: Vec<PathBuf> = archive_paths.iter().map(PathBuf::from).collect();
        v.sort();
        v
    } else {
        // single pick: if it's one split part, gather its siblings; else a single tar
        let picked = PathBuf::from(archive_paths.first().cloned().unwrap_or_default());
        let name = picked
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        if name.contains(".tar.part.") {
            let dir = picked.parent().unwrap_or(Path::new("."));
            let stem = format!("{}.part.", name.split(".part.").next().unwrap_or(""));
            let mut v: Vec<PathBuf> = std::fs::read_dir(dir)
                .map_err(|e| e.to_string())?
                .filter_map(|e| e.ok().map(|e| e.path()))
                .filter(|x| {
                    x.file_name()
                        .map(|n| n.to_string_lossy().starts_with(&stem))
                        .unwrap_or(false)
                })
                .collect();
            v.sort();
            v
        } else {
            vec![picked]
        }
    };
    if parts.is_empty() {
        return Err("找不到資源檔".to_string());
    }
    // If the user imported the SPLIT parts, verify them against the manifest first and name exactly
    // what's missing/truncated/corrupt ("缺啥補啥") — so an incomplete import fails clearly BEFORE
    // extraction instead of silently producing a half CDN. (A single whole cn-cdn.tar skips this and
    // relies on the extract completeness guard.)
    let is_split = parts
        .iter()
        .any(|p| p.file_name().map(|n| n.to_string_lossy().contains(".tar.part.")).unwrap_or(false));
    if is_split {
        let _ = log_line(&app, "[cdn] 驗證分卷齊全與完整性…".to_string());
        verify_imported_parts(app, &parts)?;
    }
    let _ = log_line(&app, format!("[cdn] 解壓 {} 個檔案", parts.len()));
    emit_progress(app, "extract", 0, 706, "解壓中");

    // Same completeness guard as download: a short/misordered/incomplete set of imported parts makes
    // the tar stream truncate → fewer entries → this errors (no marker), instead of silently leaving
    // a partial CDN that passes cdn_status but is missing the large late assets (立繪).
    let count = extract_cdn_tar(app, parts, &cdn_root)?;
    std::fs::write(&marker, format!("count={count}\n")).map_err(|e| e.to_string())?;
    let _ = log_line(&app, format!("[cdn] 匯入完成（{count} 個項目）"));
    let _ = app.emit("cdn-done", count);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState(Mutex::new(ServerState {
            pid: None,
            status: "stopped".to_string(),
            generation: 0,
        })))
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            init_debug_log(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_config,
            save_config,
            set_debug_log,
            open_log_dir,
            pick_dir,
            start_server,
            stop_server,
            server_state,
            api_request,
            cdn_status,
            cdn_download,
            cdn_import,
            cdn_clear,
            pick_file,
            patch_apk,
            pick_ipa,
            patch_ipa,
            local_ip,
            port_available,
            list_free_ports,
            pick_file_any,
            pick_files_any,
            read_text_file,
            save_text_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
