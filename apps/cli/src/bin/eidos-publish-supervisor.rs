use std::collections::{HashMap, HashSet};
use std::env;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpListener};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread;
use std::time::{Duration, Instant, SystemTime};

use reqwest::blocking::Client;
use reqwest::header::{HeaderName, HeaderValue};
use serde_json::json;
use sha2::{Digest, Sha256};
use tiny_http::{Header, Method, Request, Response, ResponseBox, Server, StatusCode};

const DEFAULT_PORT: u16 = 8420;
const DEFAULT_MAX_ACTIVE: usize = 6;
const DEFAULT_MAX_CACHE_BYTES: u64 = 3 * 1024 * 1024 * 1024;
const DEFAULT_MAX_INFLIGHT: usize = 32;
const MAX_PROXY_REQUEST_BYTES: u64 = 2 * 1024 * 1024;
const IO_CHUNK_BYTES: usize = 64 * 1024;
const VERSION_ID_BYTES: usize = 36;

#[derive(Clone, Debug, Eq, PartialEq)]
struct VersionDescriptor {
    version_id: String,
    source_bytes: u64,
    source_sha256: String,
}

struct RuntimeEntry {
    descriptor: VersionDescriptor,
    source_path: PathBuf,
    port: u16,
    child: Child,
    last_used: SystemTime,
    active_requests: usize,
}

struct SupervisorState {
    versions: HashMap<String, RuntimeEntry>,
    preparing: HashMap<String, u64>,
    retired: HashSet<String>,
    cache_bytes: u64,
    max_active: usize,
    max_cache_bytes: u64,
    max_inflight: usize,
    inflight_requests: usize,
    source_root: PathBuf,
    eidos_binary: PathBuf,
}

type SharedState = Arc<Mutex<SupervisorState>>;

#[derive(Debug)]
struct HttpError {
    status: u16,
    code: &'static str,
    message: String,
}

impl HttpError {
    fn new(status: u16, code: &'static str, message: impl Into<String>) -> Self {
        Self {
            status,
            code,
            message: message.into(),
        }
    }

    fn internal(message: impl Into<String>) -> Self {
        Self::new(500, "supervisor_internal", message)
    }

    fn response(self) -> ResponseBox {
        json_response(
            self.status,
            json!({ "error": { "code": self.code, "message": self.message } }),
        )
    }
}

fn main() {
    if let Err(error) = run() {
        eprintln!("eidos publish supervisor failed: {error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let port = env_u16("EIDOS_SUPERVISOR_PORT", DEFAULT_PORT)?;
    let control_token = env::var("EIDOS_SUPERVISOR_TOKEN")
        .map_err(|_| "EIDOS_SUPERVISOR_TOKEN is required".to_string())?;
    if control_token.len() < 32 {
        return Err("EIDOS_SUPERVISOR_TOKEN must contain at least 32 characters".to_string());
    }
    let max_active = env_usize("EIDOS_RUNTIME_MAX_ACTIVE", DEFAULT_MAX_ACTIVE)?;
    let max_cache_bytes = env_u64("EIDOS_RUNTIME_MAX_CACHE_BYTES", DEFAULT_MAX_CACHE_BYTES)?;
    let max_inflight = env_usize("EIDOS_RUNTIME_MAX_INFLIGHT", DEFAULT_MAX_INFLIGHT)?;
    if max_active == 0 || max_cache_bytes == 0 || max_inflight == 0 {
        return Err("Runtime pool limits must be positive".to_string());
    }

    let source_root = PathBuf::from("/data/versions");
    if source_root.exists() {
        fs::remove_dir_all(&source_root)
            .map_err(|error| format!("clear disposable Runtime cache: {error}"))?;
    }
    fs::create_dir_all(&source_root)
        .map_err(|error| format!("create Runtime cache directory: {error}"))?;

    let state = Arc::new(Mutex::new(SupervisorState {
        versions: HashMap::new(),
        preparing: HashMap::new(),
        retired: HashSet::new(),
        cache_bytes: 0,
        max_active,
        max_cache_bytes,
        max_inflight,
        inflight_requests: 0,
        source_root,
        eidos_binary: PathBuf::from(
            env::var("EIDOS_BINARY").unwrap_or_else(|_| "/usr/local/bin/eidos".to_string()),
        ),
    }));
    let bind = SocketAddr::new(IpAddr::V4(Ipv4Addr::UNSPECIFIED), port);
    let server = Server::http(bind).map_err(|error| format!("bind {bind}: {error}"))?;
    println!(
        "eidos publish supervisor listening on {bind}; max_active={max_active}; max_cache_bytes={max_cache_bytes}; max_inflight={max_inflight}"
    );

    for request in server.incoming_requests() {
        let shared = Arc::clone(&state);
        let token = control_token.clone();
        thread::spawn(move || serve_request(request, &token, shared));
    }
    Ok(())
}

fn serve_request(mut request: Request, control_token: &str, state: SharedState) {
    let path = request
        .url()
        .split('?')
        .next()
        .unwrap_or(request.url())
        .to_string();
    if request.method() == &Method::Get && path == "/__supervisor/health" {
        let _ = request.respond(json_response(200, json!({ "status": "ok" })));
        return;
    }
    if !authorized(&request, control_token) {
        let _ = request.respond(error_response(403, "supervisor_forbidden", "Forbidden"));
        return;
    }

    if let Some(version_id) = path.strip_prefix("/__supervisor/versions/") {
        let result = match *request.method() {
            Method::Get => version_status(version_id, &state),
            Method::Put => prepare_version(&mut request, version_id, &state),
            Method::Delete => retire_version(version_id, &state),
            _ => Err(HttpError::new(
                405,
                "method_not_allowed",
                "Method is not allowed",
            )),
        };
        let response = result.unwrap_or_else(HttpError::response);
        let _ = request.respond(response);
        return;
    }

    if let Some((version_id, runtime_path)) = runtime_route(&path) {
        proxy_runtime(request, version_id, runtime_path, state);
        return;
    }

    let _ = request.respond(error_response(404, "not_found", "Not found"));
}

fn version_status(version_id: &str, state: &SharedState) -> Result<ResponseBox, HttpError> {
    validate_version_id(version_id)?;
    let mut state = lock_state(state)?;
    remove_dead_runtime(&mut state, version_id)?;
    let Some(entry) = state.versions.get(version_id) else {
        return Err(HttpError::new(
            404,
            "runtime_version_not_loaded",
            "Runtime Version is not loaded",
        ));
    };
    Ok(json_response(
        200,
        json!({
            "versionId": entry.descriptor.version_id,
            "sourceBytes": entry.descriptor.source_bytes.to_string(),
            "sourceSha256": entry.descriptor.source_sha256,
        }),
    ))
}

fn prepare_version(
    request: &mut Request,
    version_id: &str,
    state: &SharedState,
) -> Result<ResponseBox, HttpError> {
    validate_version_id(version_id)?;
    let descriptor = descriptor_from_request(request, version_id)?;
    let startup_timeout = required_header(request, "X-Eidos-Startup-Timeout")?
        .parse::<u64>()
        .map_err(|_| HttpError::new(400, "invalid_startup_timeout", "Startup timeout is invalid"))?
        .clamp(1, 900);

    {
        let mut state = lock_state(state)?;
        remove_dead_runtime(&mut state, version_id)?;
        if let Some(existing) = state.versions.get(version_id) {
            return if existing.descriptor == descriptor {
                Ok(json_response(200, json!({ "status": "ready" })))
            } else {
                Err(HttpError::new(
                    409,
                    "runtime_descriptor_conflict",
                    "Runtime Version is bound to different immutable bytes",
                ))
            };
        }
        if state.preparing.contains_key(version_id) {
            return Err(HttpError::new(
                409,
                "runtime_version_preparing",
                "Runtime Version is already being prepared",
            ));
        }
        reserve_capacity(&mut state, version_id, descriptor.source_bytes)?;
        state.retired.remove(version_id);
    }

    match install_and_start(request, &descriptor, startup_timeout, state) {
        Ok(()) => Ok(json_response(201, json!({ "status": "ready" }))),
        Err(error) => {
            release_reservation(state, version_id);
            Err(error)
        }
    }
}

fn install_and_start(
    request: &mut Request,
    descriptor: &VersionDescriptor,
    startup_timeout: u64,
    state: &SharedState,
) -> Result<(), HttpError> {
    let (source_root, eidos_binary) = {
        let state = lock_state(state)?;
        (state.source_root.clone(), state.eidos_binary.clone())
    };
    let source_path = source_root.join(format!("{}.eidos", descriptor.version_id));
    let partial_path = source_root.join(format!("{}.partial", descriptor.version_id));
    let result = write_verified_source(request, descriptor, &partial_path)
        .and_then(|_| {
            fs::rename(&partial_path, &source_path)
                .map_err(|error| HttpError::internal(format!("install Runtime source: {error}")))
        })
        .and_then(|_| {
            let mut permissions = fs::metadata(&source_path)
                .map_err(|error| HttpError::internal(format!("inspect Runtime source: {error}")))?
                .permissions();
            permissions.set_readonly(true);
            fs::set_permissions(&source_path, permissions).map_err(|error| {
                HttpError::internal(format!("make Runtime source read-only: {error}"))
            })
        });
    if let Err(error) = result {
        let _ = fs::remove_file(&partial_path);
        let _ = fs::remove_file(&source_path);
        return Err(error);
    }

    let port = available_loopback_port()?;
    let mut child = Command::new(&eidos_binary)
        .arg("serve")
        .arg(&source_path)
        .arg("--publish")
        .arg("--port")
        .arg(port.to_string())
        .env_remove("EIDOS_SUPERVISOR_TOKEN")
        .stdin(Stdio::null())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|error| {
            HttpError::internal(format!("start eidos serve for Runtime Version: {error}"))
        })?;
    if let Err(error) = wait_until_ready(&mut child, port, Duration::from_secs(startup_timeout)) {
        let _ = child.kill();
        let _ = child.wait();
        let _ = fs::remove_file(&source_path);
        return Err(error);
    }

    let mut state = lock_state(state)?;
    state.preparing.remove(&descriptor.version_id);
    if state.retired.contains(&descriptor.version_id) {
        let _ = child.kill();
        let _ = child.wait();
        let _ = fs::remove_file(&source_path);
        return Err(HttpError::new(
            410,
            "runtime_version_retired",
            "Runtime Version was retired while preparing",
        ));
    }
    state.cache_bytes = state.cache_bytes.saturating_add(descriptor.source_bytes);
    state.versions.insert(
        descriptor.version_id.clone(),
        RuntimeEntry {
            descriptor: descriptor.clone(),
            source_path,
            port,
            child,
            last_used: SystemTime::now(),
            active_requests: 0,
        },
    );
    Ok(())
}

fn write_verified_source(
    request: &mut Request,
    descriptor: &VersionDescriptor,
    partial_path: &Path,
) -> Result<(), HttpError> {
    let mut file = File::create(partial_path)
        .map_err(|error| HttpError::internal(format!("create Runtime source: {error}")))?;
    let mut hasher = Sha256::new();
    let mut remaining = descriptor.source_bytes;
    let mut buffer = vec![0_u8; IO_CHUNK_BYTES];
    while remaining > 0 {
        let wanted = remaining.min(buffer.len() as u64) as usize;
        let read = request
            .as_reader()
            .read(&mut buffer[..wanted])
            .map_err(|error| HttpError::new(400, "source_read_failed", error.to_string()))?;
        if read == 0 {
            return Err(HttpError::new(
                409,
                "source_size_mismatch",
                "Runtime source ended before the declared size",
            ));
        }
        file.write_all(&buffer[..read])
            .map_err(|error| HttpError::internal(format!("write Runtime source: {error}")))?;
        hasher.update(&buffer[..read]);
        remaining -= read as u64;
    }
    let mut extra = [0_u8; 1];
    let extra_read = request
        .as_reader()
        .read(&mut extra)
        .map_err(|error| HttpError::new(400, "source_read_failed", error.to_string()))?;
    if extra_read != 0 {
        return Err(HttpError::new(
            409,
            "source_size_mismatch",
            "Runtime source exceeds the declared size",
        ));
    }
    file.sync_all()
        .map_err(|error| HttpError::internal(format!("sync Runtime source: {error}")))?;
    let actual_sha256 = format!("{:x}", hasher.finalize());
    if actual_sha256 != descriptor.source_sha256 {
        return Err(HttpError::new(
            409,
            "source_digest_mismatch",
            "Runtime source digest does not match the immutable descriptor",
        ));
    }
    Ok(())
}

fn proxy_runtime(mut request: Request, version_id: &str, path: &str, state: SharedState) {
    let port = match begin_runtime_request(&state, version_id) {
        Ok(port) => port,
        Err(error) => {
            let _ = request.respond(error.response());
            return;
        }
    };
    let response = runtime_response(&mut request, port, path).unwrap_or_else(HttpError::response);
    let result = request.respond(response);
    finish_runtime_request(&state, version_id);
    if let Err(error) = result {
        eprintln!(
            "Runtime proxy failed for Version {version_id} on port {port}: {}",
            error
        );
    }
}

fn runtime_response(
    request: &mut Request,
    port: u16,
    path: &str,
) -> Result<ResponseBox, HttpError> {
    let method = reqwest::Method::from_bytes(request.method().as_str().as_bytes())
        .map_err(|_| HttpError::new(405, "method_not_allowed", "Method is not allowed"))?;
    let url = format!("http://127.0.0.1:{port}{path}");
    let client = Client::builder()
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(35))
        .build()
        .map_err(|error| HttpError::internal(format!("build Runtime client: {error}")))?;
    let mut outgoing = client.request(method, url);
    for header in request.headers() {
        let name = header.field.as_str().as_str();
        if proxy_request_header(name) {
            let header_name = HeaderName::from_bytes(name.as_bytes()).map_err(|_| {
                HttpError::new(
                    400,
                    "invalid_runtime_header",
                    "Runtime header name is invalid",
                )
            })?;
            let header_value =
                HeaderValue::from_bytes(header.value.as_str().as_bytes()).map_err(|_| {
                    HttpError::new(
                        400,
                        "invalid_runtime_header",
                        "Runtime header value is invalid",
                    )
                })?;
            outgoing = outgoing.header(header_name, header_value);
        }
    }
    outgoing = outgoing
        .header("Host", format!("127.0.0.1:{port}"))
        .header("Origin", format!("http://127.0.0.1:{port}"));

    if request
        .body_length()
        .is_some_and(|length| length as u64 > MAX_PROXY_REQUEST_BYTES)
    {
        return Err(HttpError::new(
            413,
            "runtime_request_too_large",
            "Runtime request is too large",
        ));
    }
    let mut body = Vec::with_capacity(request.body_length().unwrap_or(0));
    request
        .as_reader()
        .take(MAX_PROXY_REQUEST_BYTES + 1)
        .read_to_end(&mut body)
        .map_err(|error| HttpError::new(400, "runtime_body_failed", error.to_string()))?;
    if body.len() as u64 > MAX_PROXY_REQUEST_BYTES {
        return Err(HttpError::new(
            413,
            "runtime_request_too_large",
            "Runtime request is too large",
        ));
    }
    if request
        .body_length()
        .is_some_and(|length| length != body.len())
    {
        return Err(HttpError::new(
            400,
            "runtime_body_size_mismatch",
            "Runtime request body size is invalid",
        ));
    }
    if !body.is_empty() {
        outgoing = outgoing.body(body);
    }

    let response = outgoing
        .send()
        .map_err(|error| HttpError::new(502, "runtime_unavailable", error.to_string()))?;
    let status = StatusCode(response.status().as_u16());
    let data_length = response
        .content_length()
        .and_then(|length| usize::try_from(length).ok());
    let headers = response
        .headers()
        .iter()
        .filter(|(name, _)| proxy_response_header(name.as_str()))
        .filter_map(|(name, value)| Header::from_bytes(name.as_str(), value.as_bytes()).ok())
        .collect();
    Ok(Response::new(status, headers, response, data_length, None).boxed())
}

fn begin_runtime_request(state: &SharedState, version_id: &str) -> Result<u16, HttpError> {
    validate_version_id(version_id)?;
    let mut state = lock_state(state)?;
    remove_dead_runtime(&mut state, version_id)?;
    ensure_request_capacity(state.inflight_requests, state.max_inflight)?;
    let entry = state.versions.get_mut(version_id).ok_or_else(|| {
        HttpError::new(
            503,
            "runtime_version_not_loaded",
            "Runtime Version is not loaded",
        )
    })?;
    entry.active_requests += 1;
    entry.last_used = SystemTime::now();
    let port = entry.port;
    state.inflight_requests += 1;
    Ok(port)
}

fn ensure_request_capacity(current: usize, maximum: usize) -> Result<(), HttpError> {
    if current < maximum {
        Ok(())
    } else {
        Err(HttpError::new(
            503,
            "runtime_pool_saturated",
            "Runtime pool shard has reached its request concurrency limit",
        ))
    }
}

fn finish_runtime_request(state: &SharedState, version_id: &str) {
    if let Ok(mut state) = state.lock() {
        state.inflight_requests = state.inflight_requests.saturating_sub(1);
        if let Some(entry) = state.versions.get_mut(version_id) {
            entry.active_requests = entry.active_requests.saturating_sub(1);
            entry.last_used = SystemTime::now();
        }
    }
}

fn retire_version(version_id: &str, state: &SharedState) -> Result<ResponseBox, HttpError> {
    validate_version_id(version_id)?;
    let mut state = lock_state(state)?;
    state.retired.insert(version_id.to_string());
    state.preparing.remove(version_id);
    if let Some(entry) = state.versions.remove(version_id) {
        remove_entry(&mut state, entry);
    }
    Ok(json_response(200, json!({ "status": "retired" })))
}

fn reserve_capacity(
    state: &mut SupervisorState,
    version_id: &str,
    source_bytes: u64,
) -> Result<(), HttpError> {
    if source_bytes > state.max_cache_bytes {
        return Err(HttpError::new(
            507,
            "runtime_source_exceeds_cache",
            "Runtime source exceeds this pool shard's cache capacity",
        ));
    }
    while state.versions.len() + state.preparing.len() >= state.max_active
        || state
            .cache_bytes
            .saturating_add(state.preparing.values().sum::<u64>())
            .saturating_add(source_bytes)
            > state.max_cache_bytes
    {
        let candidate = state
            .versions
            .iter()
            .filter(|(_, entry)| entry.active_requests == 0)
            .min_by_key(|(_, entry)| entry.last_used)
            .map(|(version_id, _)| version_id.clone());
        let Some(candidate) = candidate else {
            return Err(HttpError::new(
                507,
                "runtime_pool_saturated",
                "Runtime pool shard has no evictable capacity",
            ));
        };
        if let Some(entry) = state.versions.remove(&candidate) {
            remove_entry(state, entry);
        }
    }
    state.preparing.insert(version_id.to_string(), source_bytes);
    Ok(())
}

fn remove_dead_runtime(state: &mut SupervisorState, version_id: &str) -> Result<(), HttpError> {
    let dead = match state.versions.get_mut(version_id) {
        Some(entry) => entry
            .child
            .try_wait()
            .map_err(|error| HttpError::internal(format!("inspect Runtime process: {error}")))?
            .is_some(),
        None => false,
    };
    if dead && let Some(entry) = state.versions.remove(version_id) {
        remove_entry(state, entry);
    }
    Ok(())
}

fn remove_entry(state: &mut SupervisorState, mut entry: RuntimeEntry) {
    let _ = entry.child.kill();
    let _ = entry.child.wait();
    let _ = fs::remove_file(&entry.source_path);
    state.cache_bytes = state
        .cache_bytes
        .saturating_sub(entry.descriptor.source_bytes);
}

fn release_reservation(state: &SharedState, version_id: &str) {
    if let Ok(mut state) = state.lock() {
        state.preparing.remove(version_id);
    }
}

fn wait_until_ready(child: &mut Child, port: u16, timeout: Duration) -> Result<(), HttpError> {
    let client = Client::builder()
        .connect_timeout(Duration::from_secs(1))
        .timeout(Duration::from_secs(2))
        .build()
        .map_err(|error| HttpError::internal(format!("build readiness client: {error}")))?;
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if let Some(status) = child
            .try_wait()
            .map_err(|error| HttpError::internal(format!("inspect Runtime process: {error}")))?
        {
            return Err(HttpError::new(
                502,
                "runtime_process_exited",
                format!("eidos serve exited before readiness: {status}"),
            ));
        }
        let response = client
            .get(format!("http://127.0.0.1:{port}/api/manifest"))
            .header("Host", format!("127.0.0.1:{port}"))
            .send();
        if response.is_ok_and(|response| response.status().is_success()) {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(250));
    }
    Err(HttpError::new(
        504,
        "runtime_readiness_timeout",
        "eidos serve did not become ready before the source-sized deadline",
    ))
}

fn descriptor_from_request(
    request: &Request,
    version_id: &str,
) -> Result<VersionDescriptor, HttpError> {
    let source_bytes = required_header(request, "X-Eidos-Source-Bytes")?
        .parse::<u64>()
        .map_err(|_| HttpError::new(400, "invalid_source_bytes", "Source byte count is invalid"))?;
    let source_sha256 = required_header(request, "X-Eidos-Source-SHA256")?.to_string();
    if source_sha256.len() != 64
        || !source_sha256
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    {
        return Err(HttpError::new(
            400,
            "invalid_source_sha256",
            "Source SHA-256 is invalid",
        ));
    }
    Ok(VersionDescriptor {
        version_id: version_id.to_string(),
        source_bytes,
        source_sha256,
    })
}

fn runtime_route(path: &str) -> Option<(&str, &str)> {
    let rest = path.strip_prefix("/v/")?;
    let (version_id, runtime_path) = rest.split_once('/')?;
    let runtime_path = runtime_path.strip_prefix("api/")?;
    let runtime_path = match runtime_path {
        "manifest" => "/api/manifest",
        "runtime/open" => "/api/runtime/open",
        "runtime/call" => "/api/runtime/call",
        "runtime/close" => "/api/runtime/close",
        _ => return None,
    };
    Some((version_id, runtime_path))
}

fn validate_version_id(version_id: &str) -> Result<(), HttpError> {
    let valid = version_id.len() == VERSION_ID_BYTES
        && version_id.bytes().enumerate().all(|(index, byte)| {
            if matches!(index, 8 | 13 | 18 | 23) {
                byte == b'-'
            } else {
                byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase()
            }
        });
    if valid {
        Ok(())
    } else {
        Err(HttpError::new(
            400,
            "invalid_version_id",
            "Version ID is invalid",
        ))
    }
}

fn required_header<'a>(request: &'a Request, name: &str) -> Result<&'a str, HttpError> {
    request
        .headers()
        .iter()
        .find(|header| header.field.as_str().as_str().eq_ignore_ascii_case(name))
        .map(|header| header.value.as_str())
        .ok_or_else(|| {
            HttpError::new(
                400,
                "missing_supervisor_header",
                format!("{name} is required"),
            )
        })
}

fn authorized(request: &Request, expected: &str) -> bool {
    let supplied = request
        .headers()
        .iter()
        .find(|header| header.field.equiv("X-Eidos-Supervisor-Token"))
        .map(|header| header.value.as_str())
        .unwrap_or("");
    constant_time_equal(supplied.as_bytes(), expected.as_bytes())
}

fn constant_time_equal(left: &[u8], right: &[u8]) -> bool {
    let length = left.len().max(right.len());
    let mut difference = left.len() ^ right.len();
    for index in 0..length {
        difference |= usize::from(left.get(index).copied().unwrap_or(0))
            ^ usize::from(right.get(index).copied().unwrap_or(0));
    }
    difference == 0
}

fn proxy_request_header(name: &str) -> bool {
    !matches!(
        name.to_ascii_lowercase().as_str(),
        "authorization"
            | "connection"
            | "content-length"
            | "cookie"
            | "host"
            | "keep-alive"
            | "origin"
            | "proxy-authenticate"
            | "proxy-authorization"
            | "te"
            | "trailer"
            | "transfer-encoding"
            | "upgrade"
            | "x-eidos-supervisor-token"
    )
}

fn proxy_response_header(name: &str) -> bool {
    !matches!(
        name.to_ascii_lowercase().as_str(),
        "connection"
            | "content-length"
            | "keep-alive"
            | "proxy-authenticate"
            | "proxy-authorization"
            | "te"
            | "trailer"
            | "transfer-encoding"
            | "upgrade"
    )
}

fn available_loopback_port() -> Result<u16, HttpError> {
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
        .map_err(|error| HttpError::internal(format!("reserve Runtime port: {error}")))?;
    listener
        .local_addr()
        .map(|address| address.port())
        .map_err(|error| HttpError::internal(format!("read Runtime port: {error}")))
}

fn lock_state(state: &SharedState) -> Result<MutexGuard<'_, SupervisorState>, HttpError> {
    state
        .lock()
        .map_err(|_| HttpError::internal("Runtime Supervisor state is poisoned"))
}

fn json_response(status: u16, value: serde_json::Value) -> ResponseBox {
    let mut response =
        Response::from_string(value.to_string()).with_status_code(StatusCode(status));
    response.add_header(
        Header::from_bytes("Content-Type", "application/json; charset=utf-8")
            .expect("static header is valid"),
    );
    response.boxed()
}

fn error_response(status: u16, code: &'static str, message: &'static str) -> ResponseBox {
    HttpError::new(status, code, message).response()
}

fn env_u16(name: &str, default: u16) -> Result<u16, String> {
    env::var(name)
        .map(|value| {
            value
                .parse::<u16>()
                .map_err(|_| format!("{name} must be a decimal u16"))
        })
        .unwrap_or(Ok(default))
}

fn env_usize(name: &str, default: usize) -> Result<usize, String> {
    env::var(name)
        .map(|value| {
            value
                .parse::<usize>()
                .map_err(|_| format!("{name} must be a decimal integer"))
        })
        .unwrap_or(Ok(default))
}

fn env_u64(name: &str, default: u64) -> Result<u64, String> {
    env::var(name)
        .map(|value| {
            value
                .parse::<u64>()
                .map_err(|_| format!("{name} must be a decimal integer"))
        })
        .unwrap_or(Ok(default))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_version_scoped_runtime_routes() {
        let version = "7300a083-df92-49d8-945d-1e0bae0eac18";
        assert_eq!(
            runtime_route(&format!("/v/{version}/api/runtime/call")),
            Some((version, "/api/runtime/call"))
        );
        assert_eq!(runtime_route(&format!("/v/{version}/assets/app.js")), None);
        assert!(validate_version_id(version).is_ok());
        assert!(validate_version_id("../source.eidos").is_err());
    }

    #[test]
    fn compares_control_tokens_without_length_short_circuit() {
        assert!(constant_time_equal(b"same", b"same"));
        assert!(!constant_time_equal(b"same", b"different"));
        assert!(!constant_time_equal(b"short", b"shorter"));
    }

    #[test]
    fn bounds_total_runtime_request_concurrency() {
        assert!(ensure_request_capacity(31, 32).is_ok());
        let error = ensure_request_capacity(32, 32).expect_err("pool must reject at its limit");
        assert_eq!(error.status, 503);
        assert_eq!(error.code, "runtime_pool_saturated");
    }
}
