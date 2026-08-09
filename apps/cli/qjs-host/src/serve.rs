use std::cell::RefCell;
use std::collections::HashSet;
use std::io::{Read, Write};
use std::net::{IpAddr, Ipv4Addr, SocketAddr, UdpSocket};
use std::path::{Path, PathBuf};
use std::rc::Rc;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    mpsc::{self, Receiver, RecvTimeoutError, Sender},
    Arc, Mutex,
};
use std::thread;
use std::time::Duration;

use anyhow::anyhow;
use base64::{
    engine::general_purpose::{STANDARD as B64, URL_SAFE_NO_PAD},
    Engine,
};
use rand::RngCore;

use crate::{open_host_state, QjsHost, ACTIVE_CTX};

// Runtime calls can carry a base64-encoded CSV. Keep the HTTP boundary
// bounded while still allowing the runtime's 256 MiB file/export ceiling plus
// base64 and JSON overhead.
const MAX_JSON_BODY_BYTES: u64 = 384 * 1024 * 1024;
const EVENT_HEARTBEAT: Duration = Duration::from_secs(15);
const SESSION_COOKIE_PREFIX: &str = "eidos_serve_session_";

struct LanAccess {
    pairing_token: String,
    sessions: RefCell<HashSet<String>>,
}

struct ServeNetwork {
    bind: SocketAddr,
    url: String,
    allowed_host: String,
    lan: Option<LanAccess>,
}

impl ServeNetwork {
    fn new(port: u16, lan: bool, requested_host: Option<IpAddr>) -> anyhow::Result<Self> {
        if !lan {
            let bind = SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), port);
            return Ok(Self {
                bind,
                url: http_url(bind),
                allowed_host: http_authority(bind),
                lan: None,
            });
        }

        let host = match requested_host {
            Some(host) => host,
            None => detect_lan_address()?,
        };
        if !is_lan_address(host) {
            return Err(anyhow!(
                "LAN host {host} is not a private, link-local, or CGNAT address"
            ));
        }
        let bind = SocketAddr::new(host, port);
        Ok(Self {
            bind,
            url: http_url(bind),
            allowed_host: http_authority(bind),
            lan: Some(LanAccess {
                pairing_token: random_token(),
                sessions: RefCell::new(HashSet::new()),
            }),
        })
    }

    fn browser_url(&self) -> String {
        match &self.lan {
            Some(access) => format!("{}/#access={}", self.url, access.pairing_token),
            None => self.url.clone(),
        }
    }

    fn mode(&self) -> &'static str {
        if self.lan.is_some() {
            "lan"
        } else {
            "loopback"
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct RevisionEvent {
    revision: String,
}

struct EventSubscriber {
    client_id: Option<String>,
    sender: Sender<RevisionEvent>,
    active: Arc<AtomicBool>,
}

struct EventSubscription {
    receiver: Receiver<RevisionEvent>,
    active: Arc<AtomicBool>,
}

impl EventSubscription {
    fn recv_timeout(&self, timeout: Duration) -> Result<RevisionEvent, RecvTimeoutError> {
        self.receiver.recv_timeout(timeout)
    }

    #[cfg(test)]
    fn try_recv(&self) -> Result<RevisionEvent, mpsc::TryRecvError> {
        self.receiver.try_recv()
    }
}

impl Drop for EventSubscription {
    fn drop(&mut self) {
        self.active.store(false, Ordering::Release);
    }
}

#[derive(Clone, Default)]
struct EventHub {
    subscribers: Arc<Mutex<Vec<EventSubscriber>>>,
}

impl EventHub {
    fn subscribe(&self, client_id: Option<String>) -> EventSubscription {
        let (sender, receiver) = mpsc::channel();
        let active = Arc::new(AtomicBool::new(true));
        self.subscribers
            .lock()
            .expect("event subscriber lock")
            .push(EventSubscriber {
                client_id,
                sender,
                active: active.clone(),
            });
        EventSubscription { receiver, active }
    }

    fn publish(&self, event: RevisionEvent, source_client_id: Option<&str>) {
        self.subscribers
            .lock()
            .expect("event subscriber lock")
            .retain(|subscriber| {
                if !subscriber.active.load(Ordering::Acquire) {
                    return false;
                }
                if source_client_id.is_some() && subscriber.client_id.as_deref() == source_client_id
                {
                    return true;
                }
                subscriber.sender.send(event.clone()).is_ok()
            });
    }
}

fn random_token() -> String {
    let mut bytes = [0_u8; 24];
    rand::thread_rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

fn http_host(ip: IpAddr) -> String {
    match ip {
        IpAddr::V4(ip) => ip.to_string(),
        IpAddr::V6(ip) => format!("[{ip}]"),
    }
}

fn http_authority(address: SocketAddr) -> String {
    if address.port() == 80 {
        http_host(address.ip())
    } else {
        format!("{}:{}", http_host(address.ip()), address.port())
    }
}

fn http_url(address: SocketAddr) -> String {
    format!("http://{}", http_authority(address))
}

fn is_cgnat(ip: Ipv4Addr) -> bool {
    let octets = ip.octets();
    octets[0] == 100 && (64..=127).contains(&octets[1])
}

fn is_lan_address(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => ip.is_private() || ip.is_link_local() || is_cgnat(ip),
        IpAddr::V6(ip) => ip.segments()[0] & 0xfe00 == 0xfc00 || ip.is_unicast_link_local(),
    }
}

fn detect_lan_address() -> anyhow::Result<IpAddr> {
    for destination in ["192.0.2.1:80", "198.51.100.1:80", "8.8.8.8:80"] {
        let Ok(socket) = UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0)) else {
            continue;
        };
        if socket.connect(destination).is_err() {
            continue;
        }
        let Ok(address) = socket.local_addr() else {
            continue;
        };
        if is_lan_address(address.ip()) {
            return Ok(address.ip());
        }
    }
    Err(anyhow!(
        "could not detect a private LAN address; pass --lan --host <private-ip>"
    ))
}

fn json_response(body: &str) -> tiny_http::Response<std::io::Cursor<Vec<u8>>> {
    tiny_http::Response::from_string(body).with_header(
        "Content-Type: application/json; charset=utf-8"
            .parse::<tiny_http::Header>()
            .unwrap(),
    )
}

fn error_response(status: u16, message: &str) -> tiny_http::Response<std::io::Cursor<Vec<u8>>> {
    let body = serde_json::json!({ "ok": false, "error": { "message": message } }).to_string();
    tiny_http::Response::from_string(body)
        .with_status_code(status)
        .with_header(
            "Content-Type: application/json; charset=utf-8"
                .parse::<tiny_http::Header>()
                .unwrap(),
        )
}

fn header_value<'a>(request: &'a tiny_http::Request, name: &str) -> Option<&'a str> {
    request
        .headers()
        .iter()
        .find(|header| header.field.as_str().as_str().eq_ignore_ascii_case(name))
        .map(|header| header.value.as_str())
}

fn allowed_host(value: &str, network: &ServeNetwork) -> bool {
    if network.lan.is_some() {
        return value.eq_ignore_ascii_case(&network.allowed_host);
    }
    value.eq_ignore_ascii_case(&network.allowed_host)
        || value.eq_ignore_ascii_case(&if network.bind.port() == 80 {
            "localhost".to_string()
        } else {
            format!("localhost:{}", network.bind.port())
        })
}

fn allowed_loopback_origin(value: &str) -> bool {
    let Some(authority) = value.strip_prefix("http://") else {
        return false;
    };
    let Some((host, port)) = authority.rsplit_once(':') else {
        return false;
    };
    !port.is_empty()
        && port.bytes().all(|byte| byte.is_ascii_digit())
        && port.parse::<u16>().is_ok()
        && (host.eq_ignore_ascii_case("127.0.0.1") || host.eq_ignore_ascii_case("localhost"))
}

fn allowed_origin(value: &str, network: &ServeNetwork) -> bool {
    if network.lan.is_some() {
        value.eq_ignore_ascii_case(&network.url)
    } else if network.bind.port() == 80 {
        value.eq_ignore_ascii_case("http://127.0.0.1")
            || value.eq_ignore_ascii_case("http://localhost")
            || allowed_loopback_origin(value)
    } else {
        allowed_loopback_origin(value)
    }
}

fn trusted_api_request(request: &tiny_http::Request, network: &ServeNetwork) -> bool {
    let Some(host) = header_value(request, "Host") else {
        return false;
    };
    if !allowed_host(host, network) {
        return false;
    }
    header_value(request, "Origin").is_none_or(|origin| allowed_origin(origin, network))
}

fn constant_time_equal(left: &str, right: &str) -> bool {
    if left.len() != right.len() {
        return false;
    }
    left.bytes()
        .zip(right.bytes())
        .fold(0_u8, |difference, (left, right)| {
            difference | (left ^ right)
        })
        == 0
}

fn bearer_token(request: &tiny_http::Request) -> Option<&str> {
    header_value(request, "Authorization")?.strip_prefix("Bearer ")
}

fn cookie_value<'a>(request: &'a tiny_http::Request, name: &str) -> Option<&'a str> {
    header_value(request, "Cookie")?
        .split(';')
        .filter_map(|part| part.trim().split_once('='))
        .find_map(|(candidate, value)| (candidate == name).then_some(value))
}

fn session_cookie_name(port: u16) -> String {
    format!("{SESSION_COOKIE_PREFIX}{port}")
}

fn has_lan_session(request: &tiny_http::Request, network: &ServeNetwork) -> bool {
    let Some(access) = &network.lan else {
        return true;
    };
    let cookie_name = session_cookie_name(network.bind.port());
    let Some(session) = cookie_value(request, &cookie_name) else {
        return false;
    };
    access.sessions.borrow().contains(session)
}

fn valid_client_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
}

fn request_client_id(request: &tiny_http::Request) -> Option<String> {
    header_value(request, "X-Eidos-Client-ID")
        .filter(|value| valid_client_id(value))
        .map(ToOwned::to_owned)
}

fn query_parameter(url: &str, name: &str) -> Option<String> {
    let query = url.split_once('?')?.1;
    query.split('&').find_map(|member| {
        let (candidate, value) = member.split_once('=')?;
        (candidate == name && valid_client_id(value)).then(|| value.to_string())
    })
}

fn pairing_response(
    request: &tiny_http::Request,
    network: &ServeNetwork,
) -> tiny_http::Response<std::io::Cursor<Vec<u8>>> {
    if !trusted_api_request(request, network) {
        return error_response(403, "API requests require the served Host and Origin");
    }
    let Some(access) = &network.lan else {
        return error_response(404, "pairing is not enabled");
    };
    let Some(token) = bearer_token(request) else {
        return error_response(401, "the LAN access key is required");
    };
    if !constant_time_equal(token, &access.pairing_token) {
        return error_response(401, "the LAN access key is invalid");
    }

    let session = random_token();
    access.sessions.borrow_mut().insert(session.clone());
    let cookie = format!(
        "Set-Cookie: {}={session}; Path=/; HttpOnly; SameSite=Strict",
        session_cookie_name(network.bind.port())
    );
    json_response(&serde_json::json!({ "ok": true }).to_string())
        .with_header(cookie.parse::<tiny_http::Header>().unwrap())
        .with_header(
            "Cache-Control: private, no-store"
                .parse::<tiny_http::Header>()
                .unwrap(),
        )
}

fn mutation_event(method: &str, result: &str) -> Option<RevisionEvent> {
    if !matches!(
        method,
        "mutateRows" | "revertMutation" | "mutateView" | "mutateSchema" | "importCsv"
    ) {
        return None;
    }
    let envelope: serde_json::Value = serde_json::from_str(result).ok()?;
    if envelope.get("ok").and_then(serde_json::Value::as_bool) != Some(true) {
        return None;
    }
    let value = envelope.get("value")?;
    if value.get("changed").and_then(serde_json::Value::as_bool) == Some(false) {
        return None;
    }
    Some(RevisionEvent {
        revision: value.get("revision")?.as_str()?.to_string(),
    })
}

fn respond_with_event_stream(request: tiny_http::Request, subscription: EventSubscription) {
    thread::spawn(move || {
        // tiny_http's chunked encoder buffers 8 KiB before flushing, which
        // defeats low-volume SSE. Own the response writer here so every
        // revision frame is visible to other browsers immediately.
        let mut writer = request.into_writer();
        if writer
            .write_all(
                b"HTTP/1.1 200 OK\r\n\
Content-Type: text/event-stream; charset=utf-8\r\n\
Cache-Control: private, no-cache, no-store\r\n\
X-Accel-Buffering: no\r\n\
X-Content-Type-Options: nosniff\r\n\
Connection: close\r\n\
\r\n\
retry: 1000\n\n",
            )
            .and_then(|()| writer.flush())
            .is_err()
        {
            return;
        }

        loop {
            let frame = match subscription.recv_timeout(EVENT_HEARTBEAT) {
                Ok(event) => format!(
                    "event: revision\ndata: {}\n\n",
                    serde_json::json!({ "revision": event.revision })
                ),
                Err(RecvTimeoutError::Timeout) => ": keepalive\n\n".to_string(),
                Err(RecvTimeoutError::Disconnected) => return,
            };
            if writer
                .write_all(frame.as_bytes())
                .and_then(|()| writer.flush())
                .is_err()
            {
                return;
            }
        }
    });
}

fn read_json_body(request: &mut tiny_http::Request) -> Result<serde_json::Value, (u16, String)> {
    if request
        .body_length()
        .is_some_and(|length| u64::try_from(length).unwrap_or(u64::MAX) > MAX_JSON_BODY_BYTES)
    {
        return Err((413, "request body is too large".to_string()));
    }

    let mut body = String::new();
    request
        .as_reader()
        .take(MAX_JSON_BODY_BYTES + 1)
        .read_to_string(&mut body)
        .map_err(|error| (400, format!("read request body: {error}")))?;
    if body.len() as u64 > MAX_JSON_BODY_BYTES {
        return Err((413, "request body is too large".to_string()));
    }
    serde_json::from_str(&body).map_err(|error| (400, format!("invalid JSON body: {error}")))
}

fn content_type(path: &str) -> &'static str {
    match path.rsplit('.').next().unwrap_or("") {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" | "map" => "application/json; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "ico" => "image/x-icon",
        "wasm" => "application/wasm",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "txt" => "text/plain; charset=utf-8",
        "webmanifest" => "application/manifest+json",
        _ => "application/octet-stream",
    }
}

#[derive(rust_embed::Embed)]
#[folder = "ui"]
struct EmbeddedUi;

fn resolve_embedded(url_path: &str) -> Option<(String, rust_embed::EmbeddedFile)> {
    let clean: Vec<&str> = url_path
        .split('/')
        .filter(|segment| !segment.is_empty() && *segment != ".")
        .collect();
    if clean.contains(&"..") {
        return None;
    }
    let candidate = clean.join("/");
    if let Some(file) = EmbeddedUi::get(&candidate) {
        return Some((candidate, file));
    }
    if !candidate.is_empty() {
        let nested = format!("{candidate}/index.html");
        if let Some(file) = EmbeddedUi::get(&nested) {
            return Some((nested, file));
        }
    }
    // SPA fallback.
    let index = "index.html".to_string();
    EmbeddedUi::get(&index).map(|file| (index, file))
}

fn resolve_static(ui_dir: &Path, url_path: &str) -> Option<PathBuf> {
    let clean = url_path.trim_start_matches('/');
    let mut candidate = ui_dir.to_path_buf();
    for segment in clean.split('/') {
        if segment.is_empty() || segment == "." {
            continue;
        }
        if segment == ".." {
            return None;
        }
        candidate.push(segment);
    }
    if candidate.is_dir() {
        candidate = candidate.join("index.html");
    }
    if candidate.is_file() {
        return Some(candidate);
    }
    // SPA fallback.
    let index = ui_dir.join("index.html");
    index.is_file().then_some(index)
}

pub fn run_serve(
    db_path: &Path,
    port: u16,
    ui_dir: Option<PathBuf>,
    open_browser: bool,
    lan: bool,
    requested_host: Option<IpAddr>,
) -> anyhow::Result<()> {
    let file_name = db_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("file.eidos")
        .to_string();
    let state = Rc::new(open_host_state(db_path)?);
    let host = QjsHost::new(&state)?;
    let network = ServeNetwork::new(port, lan, requested_host)?;
    let events = EventHub::default();

    let server = tiny_http::Server::http(network.bind)
        .map_err(|error| anyhow!("bind {}: {error}", network.bind))?;
    let browser_url = network.browser_url();
    println!("eidos serve {file_name}");
    println!("  url: {browser_url}");
    println!("  network: {}", network.mode());
    if let Some(dir) = &ui_dir {
        println!("  ui:  {}", dir.display());
    } else {
        println!("  ui:  (embedded)");
    }
    if network.lan.is_some() {
        println!("  access: paired browsers can read and write");
        println!("  warning: use this HTTP link only on a trusted private network");
    }
    if open_browser {
        let _ = open::that(&browser_url);
    }

    for mut request in server.incoming_requests() {
        let method = request.method().to_string();
        let request_url = request.url().to_string();
        let url_path = request_url.split('?').next().unwrap_or("/").to_string();

        if method == "POST" && url_path == "/api/session" {
            let response = pairing_response(&request, &network);
            if let Err(error) = request.respond(response) {
                eprintln!("respond failed: {error}");
            }
            continue;
        }

        if url_path.starts_with("/api/") {
            let response = if !trusted_api_request(&request, &network) {
                Some(error_response(
                    403,
                    "API requests require the served Host and Origin",
                ))
            } else if !has_lan_session(&request, &network) {
                Some(error_response(
                    401,
                    "pair this browser with the LAN access link",
                ))
            } else {
                None
            };
            if let Some(response) = response {
                if let Err(error) = request.respond(response) {
                    eprintln!("respond failed: {error}");
                }
                continue;
            }
        }

        if method == "GET" && url_path == "/api/events" {
            let client_id = query_parameter(&request_url, "client");
            respond_with_event_stream(request, events.subscribe(client_id));
            continue;
        }

        let source_client_id = request_client_id(&request);
        let response = match (method.as_str(), url_path.as_str()) {
            ("GET", "/api/manifest") => json_response(
                &serde_json::json!({
                    "mode": "cli",
                    "fileName": file_name,
                    "access": "readwrite",
                    "network": network.mode(),
                })
                .to_string(),
            ),
            ("POST", "/api/runtime/open") => match read_json_body(&mut request) {
                Ok(value) => match value.get("access").and_then(|access| access.as_str()) {
                    Some(access @ ("read" | "readwrite")) => {
                        let open_request = serde_json::json!({
                            "mode": "open",
                            "access": access,
                        })
                        .to_string();
                        match host.invoke("open", &[open_request]) {
                            Ok(result) => json_response(&result),
                            Err(error) => error_response(500, &error.to_string()),
                        }
                    }
                    _ => error_response(400, "access must be read or readwrite"),
                },
                Err((status, message)) => error_response(status, &message),
            },
            ("POST", "/api/runtime/call") => match read_json_body(&mut request) {
                Ok(value) => {
                    let method = value
                        .get("method")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let request_json = value
                        .get("request")
                        .map(|v| {
                            if v.is_string() {
                                v.as_str().unwrap().to_string()
                            } else {
                                v.to_string()
                            }
                        })
                        .unwrap_or_else(|| "{}".to_string());
                    let context_json = value
                        .get("context")
                        .map(|v| {
                            if v.is_string() {
                                v.as_str().unwrap().to_string()
                            } else {
                                v.to_string()
                            }
                        })
                        .unwrap_or_else(|| {
                            serde_json::json!({
                                "requestId": "http",
                                "deadlineMilliseconds": 30_000,
                            })
                            .to_string()
                        });
                    match host.invoke("call", &[method.clone(), request_json, context_json]) {
                        Ok(result) => {
                            if let Some(event) = mutation_event(&method, &result) {
                                events.publish(event, source_client_id.as_deref());
                            }
                            json_response(&result)
                        }
                        Err(error) => error_response(500, &error.to_string()),
                    }
                }
                Err((status, message)) => error_response(status, &message),
            },
            // Browser sessions share one authoritative Runtime writer. A
            // tab closing must not terminate the Runtime for every other
            // connected browser.
            ("POST", "/api/runtime/close") => {
                json_response(&serde_json::json!({ "ok": true }).to_string())
            }
            ("GET", "/api/snapshot") => match host.invoke("snapshot", &[]) {
                Ok(base64) => match B64.decode(base64.trim_matches('"')) {
                    Ok(bytes) => tiny_http::Response::from_data(bytes).with_header(
                        "Content-Type: application/octet-stream"
                            .parse::<tiny_http::Header>()
                            .unwrap(),
                    ),
                    Err(error) => error_response(500, &error.to_string()),
                },
                Err(error) => error_response(500, &error.to_string()),
            },
            ("POST", "/api/save") => {
                // The embedded runtime writes straight to the file's SQLite
                // connection, so every committed mutation is already durable.
                json_response(&serde_json::json!({ "ok": true }).to_string())
            }
            ("GET", path) if !path.starts_with("/api/") => match &ui_dir {
                Some(dir) => match resolve_static(dir, path) {
                    Some(file) => {
                        let mime = content_type(file.to_str().unwrap_or(""));
                        match std::fs::read(&file) {
                            Ok(bytes) => tiny_http::Response::from_data(bytes).with_header(
                                format!("Content-Type: {mime}")
                                    .parse::<tiny_http::Header>()
                                    .unwrap(),
                            ),
                            Err(error) => error_response(500, &error.to_string()),
                        }
                    }
                    None => error_response(404, "not found"),
                },
                None => match resolve_embedded(path) {
                    Some((resolved, file)) => {
                        let mime = content_type(&resolved);
                        tiny_http::Response::from_data(file.data.into_owned()).with_header(
                            format!("Content-Type: {mime}")
                                .parse::<tiny_http::Header>()
                                .unwrap(),
                        )
                    }
                    None => error_response(404, "not found"),
                },
            },
            _ => error_response(404, "not found"),
        };
        if let Err(error) = request.respond(response) {
            eprintln!("respond failed: {error}");
        }
    }

    ACTIVE_CTX.with(|slot| *slot.borrow_mut() = None);
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::net::{IpAddr, Ipv4Addr};

    use super::{
        allowed_host, allowed_origin, is_lan_address, mutation_event, query_parameter, EmbeddedUi,
        EventHub, RevisionEvent, ServeNetwork,
    };

    fn relative_asset_references(source: &str) -> Vec<&str> {
        let bytes = source.as_bytes();
        let mut references = Vec::new();
        let mut index = 0;

        while index < bytes.len() {
            let quote = bytes[index];
            if !matches!(quote, b'\"' | b'\'' | b'`')
                || bytes.get(index + 1) != Some(&b'.')
                || bytes.get(index + 2) != Some(&b'/')
            {
                index += 1;
                continue;
            }

            let start = index + 1;
            let Some(end) = bytes[start..]
                .iter()
                .position(|byte| *byte == quote)
                .map(|offset| start + offset)
            else {
                break;
            };
            let reference = &source[start..end];
            let path = reference.split(['?', '#']).next().unwrap_or(reference);
            let extension = path.rsplit_once('.').map(|(_, extension)| extension);
            if matches!(
                extension,
                Some(
                    "css"
                        | "ico"
                        | "jpg"
                        | "jpeg"
                        | "js"
                        | "mjs"
                        | "png"
                        | "svg"
                        | "wasm"
                        | "woff"
                        | "woff2"
                )
            ) {
                references.push(path);
            }
            index = end + 1;
        }

        references
    }

    #[test]
    fn accepts_only_the_bound_loopback_host() {
        let network = ServeNetwork::new(8420, false, None).unwrap();
        assert!(allowed_host("127.0.0.1:8420", &network));
        assert!(allowed_host("LOCALHOST:8420", &network));
        assert!(!allowed_host("127.0.0.1:8421", &network));
        assert!(!allowed_host("eidos.example:8420", &network));
        assert!(!allowed_host("127.0.0.1:8420.eidos.example", &network));
    }

    #[test]
    fn accepts_only_http_loopback_origins() {
        let network = ServeNetwork::new(8420, false, None).unwrap();
        assert!(allowed_origin("http://127.0.0.1:8420", &network));
        assert!(allowed_origin("http://localhost:5173", &network));
        assert!(!allowed_origin("https://127.0.0.1:8420", &network));
        assert!(!allowed_origin("http://eidos.example:8420", &network));
        assert!(!allowed_origin("http://localhost:8420/path", &network));
        assert!(!allowed_origin("null", &network));
    }

    #[test]
    fn lan_policy_accepts_only_its_exact_private_authority() {
        let network =
            ServeNetwork::new(8420, true, Some(IpAddr::V4(Ipv4Addr::new(192, 168, 1, 20))))
                .unwrap();
        assert!(allowed_host("192.168.1.20:8420", &network));
        assert!(allowed_origin("http://192.168.1.20:8420", &network));
        assert!(!allowed_host("localhost:8420", &network));
        assert!(!allowed_origin("http://192.168.1.21:8420", &network));
        assert!(network.browser_url().contains("/#access="));
    }

    #[test]
    fn lan_addresses_include_private_link_local_and_overlay_ranges() {
        assert!(is_lan_address("10.0.0.1".parse().unwrap()));
        assert!(is_lan_address("169.254.10.20".parse().unwrap()));
        assert!(is_lan_address("100.64.0.1".parse().unwrap()));
        assert!(is_lan_address("fd7a:115c:a1e0::1".parse().unwrap()));
        assert!(is_lan_address("fe80::1".parse().unwrap()));
        assert!(!is_lan_address("8.8.8.8".parse().unwrap()));
        assert!(!is_lan_address("2001:4860:4860::8888".parse().unwrap()));
    }

    #[test]
    fn mutation_events_include_only_successful_changed_revisions() {
        assert_eq!(
            mutation_event(
                "mutateRows",
                r#"{"ok":true,"value":{"changed":true,"revision":"7"}}"#
            ),
            Some(RevisionEvent {
                revision: "7".to_string()
            })
        );
        assert_eq!(
            mutation_event(
                "mutateRows",
                r#"{"ok":true,"value":{"changed":false,"revision":"7"}}"#
            ),
            None
        );
        assert_eq!(
            mutation_event("queryRows", r#"{"ok":true,"value":{"revision":"7"}}"#),
            None
        );
    }

    #[test]
    fn event_hub_skips_the_mutating_browser() {
        let hub = EventHub::default();
        let first = hub.subscribe(Some("first".to_string()));
        let second = hub.subscribe(Some("second".to_string()));
        let event = RevisionEvent {
            revision: "8".to_string(),
        };
        hub.publish(event.clone(), Some("first"));
        assert!(first.try_recv().is_err());
        assert_eq!(second.try_recv().unwrap(), event);
    }

    #[test]
    fn event_hub_prunes_disconnected_browsers() {
        let hub = EventHub::default();
        let disconnected = hub.subscribe(Some("gone".to_string()));
        let connected = hub.subscribe(Some("here".to_string()));
        drop(disconnected);

        hub.publish(
            RevisionEvent {
                revision: "9".to_string(),
            },
            None,
        );

        assert_eq!(hub.subscribers.lock().unwrap().len(), 1);
        assert_eq!(connected.try_recv().unwrap().revision, "9");
    }

    #[test]
    fn event_client_query_is_bounded_and_ascii() {
        assert_eq!(
            query_parameter("/api/events?client=tab-123", "client").as_deref(),
            Some("tab-123")
        );
        assert_eq!(
            query_parameter("/api/events?client=not%20valid", "client"),
            None
        );
    }

    #[test]
    fn embedded_ui_references_only_embedded_assets() {
        for source_path in EmbeddedUi::iter() {
            let source_path = source_path.as_ref();
            if !matches!(
                source_path.rsplit_once('.').map(|(_, extension)| extension),
                Some("css" | "html" | "js")
            ) {
                continue;
            }
            let source_file = EmbeddedUi::get(source_path).expect("iterated embedded asset");
            let source = std::str::from_utf8(source_file.data.as_ref()).expect("UTF-8 UI source");
            let source_dir = source_path
                .rsplit_once('/')
                .map(|(directory, _)| directory)
                .unwrap_or("");

            for reference in relative_asset_references(source) {
                assert!(
                    !reference.split('/').any(|segment| segment == ".."),
                    "{source_path} references parent asset path {reference}"
                );
                let dependency = reference.trim_start_matches("./");
                let dependency = if source_dir.is_empty() {
                    dependency.to_string()
                } else {
                    format!("{source_dir}/{dependency}")
                };
                assert!(
                    EmbeddedUi::get(&dependency).is_some(),
                    "{source_path} references missing embedded asset {dependency}"
                );
            }
        }
    }
}
