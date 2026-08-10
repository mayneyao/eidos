use std::cell::RefCell;
use std::collections::{HashMap, HashSet};
use std::fs::{File, OpenOptions};
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
use std::time::{Duration, Instant};

use anyhow::anyhow;
use base64::{
    engine::general_purpose::{STANDARD as B64, URL_SAFE_NO_PAD},
    Engine,
};
use chrono::{SecondsFormat, Utc};
use rand::RngCore;
use serde::{Deserialize, Serialize};

use crate::relay::{RelayBrowserAccess, RelayConfig, RelayConnector};
use crate::{open_host_state, QjsHost, ACTIVE_CTX};

// Runtime calls can carry a base64-encoded CSV. Keep the HTTP boundary
// bounded while still allowing the runtime's 256 MiB file/export ceiling plus
// base64 and JSON overhead.
const MAX_JSON_BODY_BYTES: u64 = 384 * 1024 * 1024;
const ASSET_BYTES_MAX: u64 = 256 * 1024 * 1024;
const ASSET_PREVIEW_BYTES_MAX: u64 = 64 * 1024 * 1024;
const ASSET_LEASES_MAX: usize = 32;
const ASSET_LEASE_TTL: Duration = Duration::from_secs(5 * 60);
const ASSET_RELEASE_GRACE: Duration = Duration::from_secs(30);
const EVENT_HEARTBEAT: Duration = Duration::from_secs(15);
const SESSION_COOKIE_PREFIX: &str = "eidos_serve_session_";

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
struct AssetEntry {
    id: String,
    name: String,
    media_type: String,
    size: String,
    uri: String,
}

#[derive(Clone, Debug)]
struct AssetLeaseRecord {
    resource_id: String,
    entry: AssetEntry,
    path: PathBuf,
    purpose: String,
    active: bool,
    expires_at: Instant,
    content_expires_at: Instant,
}

struct AssetMount {
    root: PathBuf,
    entries: RefCell<HashMap<String, AssetEntry>>,
    conflicting_entries: RefCell<HashSet<String>>,
    leases: RefCell<HashMap<String, AssetLeaseRecord>>,
}

impl AssetMount {
    fn new(root: &Path) -> anyhow::Result<Self> {
        let root = std::fs::canonicalize(root)
            .map_err(|error| anyhow!("open assets directory {}: {error}", root.display()))?;
        let metadata = std::fs::metadata(&root)
            .map_err(|error| anyhow!("inspect assets directory {}: {error}", root.display()))?;
        if !metadata.is_dir() {
            return Err(anyhow!(
                "assets path must be an existing directory: {}",
                root.display()
            ));
        }
        Ok(Self {
            root,
            entries: RefCell::new(HashMap::new()),
            conflicting_entries: RefCell::new(HashSet::new()),
            leases: RefCell::new(HashMap::new()),
        })
    }

    fn cache_runtime_result(&self, method: &str, result: &str) {
        let Ok(envelope) = serde_json::from_str::<serde_json::Value>(result) else {
            return;
        };
        if envelope.get("ok").and_then(serde_json::Value::as_bool) != Some(true) {
            return;
        }
        let Some(value) = envelope.get("value") else {
            return;
        };
        match method {
            "queryRows" | "getRowsById" | "queryGroupRows" => self.cache_row_batch(value),
            "groupRows" => {
                if let Some(groups) = value.get("groups").and_then(serde_json::Value::as_array) {
                    for group in groups {
                        self.cache_rows_with_columns(value.get("columns"), group.get("rows"));
                    }
                }
            }
            "mutateRows" => {
                if let Some(rows) = value.get("returnedRows") {
                    self.cache_row_batch(rows);
                }
            }
            _ => {}
        }
    }

    fn cache_row_batch(&self, value: &serde_json::Value) {
        self.cache_rows_with_columns(value.get("columns"), value.get("rows"));
    }

    fn cache_rows_with_columns(
        &self,
        columns: Option<&serde_json::Value>,
        rows: Option<&serde_json::Value>,
    ) {
        let Some(columns) = columns.and_then(serde_json::Value::as_array) else {
            return;
        };
        let Some(rows) = rows.and_then(serde_json::Value::as_array) else {
            return;
        };
        let file_columns: Vec<usize> = columns
            .iter()
            .enumerate()
            .filter_map(|(index, column)| {
                let value_type = column.get("valueType")?;
                let is_file = matches!(value_type.as_str(), Some("file") | Some("file-entry"))
                    || value_type.get("kind").and_then(serde_json::Value::as_str) == Some("list")
                        && value_type
                            .get("element")
                            .and_then(serde_json::Value::as_str)
                            == Some("file-entry");
                is_file.then_some(index)
            })
            .collect();
        for row in rows {
            let Some(values) = row.get("values").and_then(serde_json::Value::as_array) else {
                continue;
            };
            for index in &file_columns {
                let Some(value) = values.get(*index) else {
                    continue;
                };
                if let Some(entries) = value.as_array() {
                    for entry in entries {
                        self.cache_entry_value(entry);
                    }
                } else {
                    self.cache_entry_value(value);
                }
            }
        }
    }

    fn cache_entry_value(&self, value: &serde_json::Value) {
        let Ok(entry) = serde_json::from_value::<AssetEntry>(value.clone()) else {
            return;
        };
        self.cache_entry(entry);
    }

    fn cache_entry(&self, entry: AssetEntry) {
        if !entry.uri.starts_with("assets/") {
            return;
        }
        let mut entries = self.entries.borrow_mut();
        if let Some(existing) = entries.get(&entry.id) {
            if existing != &entry {
                entries.remove(&entry.id);
                self.conflicting_entries.borrow_mut().insert(entry.id);
            }
            return;
        }
        if !self.conflicting_entries.borrow().contains(&entry.id) {
            entries.insert(entry.id.clone(), entry);
        }
    }

    fn resolve(&self, entry_id: &str, purpose: &str) -> Result<serde_json::Value, (u16, String)> {
        if !matches!(purpose, "thumbnail" | "preview" | "download") {
            return Err((400, "asset purpose is invalid".to_string()));
        }
        if self.conflicting_entries.borrow().contains(entry_id) {
            return Err((409, "File entry metadata is conflicting".to_string()));
        }
        let entry = self
            .entries
            .borrow()
            .get(entry_id)
            .cloned()
            .ok_or_else(|| (404, "File entry is unavailable".to_string()))?;
        let relative = decode_asset_uri(&entry.uri).ok_or_else(|| {
            (
                404,
                "File entry is outside the mounted assets folder".to_string(),
            )
        })?;
        let candidate = self.root.join(relative);
        let path = std::fs::canonicalize(&candidate)
            .map_err(|_| (404, "Asset file is unavailable".to_string()))?;
        if !path.starts_with(&self.root) || path == self.root {
            return Err((403, "Asset path escapes the mounted folder".to_string()));
        }
        let metadata =
            std::fs::metadata(&path).map_err(|_| (404, "Asset file is unavailable".to_string()))?;
        if !metadata.is_file() {
            return Err((404, "Asset path is not an ordinary file".to_string()));
        }
        let declared_size = entry
            .size
            .parse::<u64>()
            .map_err(|_| (409, "File entry size is invalid".to_string()))?;
        if metadata.len() != declared_size {
            return Err((
                409,
                "Asset file size no longer matches the File entry".to_string(),
            ));
        }
        let limit = if purpose == "download" {
            ASSET_BYTES_MAX
        } else {
            ASSET_PREVIEW_BYTES_MAX
        };
        if metadata.len() > limit {
            return Err((413, "Asset exceeds the negotiated size limit".to_string()));
        }

        let now = Instant::now();
        let mut leases = self.leases.borrow_mut();
        leases.retain(|_, lease| lease.content_expires_at > now);
        if leases.values().filter(|lease| lease.active).count() >= ASSET_LEASES_MAX {
            return Err((429, "Concurrent asset preview limit reached".to_string()));
        }
        let lease_id = random_token();
        let resource_id = random_token();
        let expires_at = now + ASSET_LEASE_TTL;
        leases.insert(
            lease_id.clone(),
            AssetLeaseRecord {
                resource_id: resource_id.clone(),
                entry: entry.clone(),
                path,
                purpose: purpose.to_string(),
                active: true,
                expires_at,
                content_expires_at: expires_at,
            },
        );
        Ok(serde_json::json!({
            "leaseId": lease_id,
            "entryId": entry.id,
            "purpose": purpose,
            "mediaType": entry.media_type,
            "name": entry.name,
            "size": entry.size,
            "expiresAt": (Utc::now() + chrono::Duration::from_std(ASSET_LEASE_TTL).unwrap())
                .to_rfc3339_opts(SecondsFormat::Millis, true),
            "resourceToken": format!("/api/assets/content/{resource_id}"),
        }))
    }

    fn release(&self, lease_id: &str) {
        let now = Instant::now();
        let mut leases = self.leases.borrow_mut();
        leases.retain(|_, lease| lease.content_expires_at > now);
        if let Some(lease) = leases.get_mut(lease_id) {
            lease.active = false;
            lease.content_expires_at = lease.content_expires_at.min(now + ASSET_RELEASE_GRACE);
        }
    }

    fn content(&self, resource_id: &str) -> Result<AssetLeaseRecord, (u16, String)> {
        let now = Instant::now();
        let mut leases = self.leases.borrow_mut();
        leases.retain(|_, lease| lease.content_expires_at > now);
        leases
            .values()
            .find(|lease| lease.resource_id == resource_id && lease.expires_at > now)
            .cloned()
            .ok_or_else(|| (404, "Asset lease is unavailable or expired".to_string()))
    }
}

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

fn percent_decode_component(value: &str) -> Option<String> {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        match bytes[index] {
            b'%' => {
                let high = *bytes.get(index + 1)?;
                let low = *bytes.get(index + 2)?;
                let hex = |byte: u8| match byte {
                    b'0'..=b'9' => Some(byte - b'0'),
                    b'a'..=b'f' => Some(byte - b'a' + 10),
                    b'A'..=b'F' => Some(byte - b'A' + 10),
                    _ => None,
                };
                decoded.push(hex(high)? * 16 + hex(low)?);
                index += 3;
            }
            byte => {
                decoded.push(byte);
                index += 1;
            }
        }
    }
    String::from_utf8(decoded).ok()
}

fn query_text_parameter(url: &str, name: &str) -> Option<String> {
    let query = url.split_once('?')?.1;
    query.split('&').find_map(|member| {
        let (candidate, value) = member.split_once('=')?;
        if candidate != name || value.len() > 4_096 {
            return None;
        }
        percent_decode_component(&value.replace('+', " "))
    })
}

fn percent_encode_path_segment(value: &str) -> String {
    let mut encoded = String::with_capacity(value.len());
    for byte in value.as_bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'.' | b'_' | b'~') {
            encoded.push(char::from(*byte));
        } else {
            encoded.push('%');
            encoded.push_str(&format!("{byte:02X}"));
        }
    }
    encoded
}

fn decode_asset_uri(uri: &str) -> Option<PathBuf> {
    if uri.contains(['?', '#']) {
        return None;
    }
    let relative = percent_decode_component(uri.strip_prefix("assets/")?)?;
    if relative.is_empty() || relative.contains(['\0', '\\']) {
        return None;
    }
    let mut path = PathBuf::new();
    for segment in relative.split('/') {
        if segment.is_empty() || matches!(segment, "." | "..") {
            return None;
        }
        path.push(segment);
    }
    (!path.is_absolute()).then_some(path)
}

fn asset_name(value: &str) -> Result<String, (u16, String)> {
    if value.is_empty()
        || value.len() > 240
        || value.contains(['\0', '/', '\\'])
        || matches!(value, "." | "..")
    {
        return Err((400, "asset file name is invalid".to_string()));
    }
    Ok(value.to_string())
}

fn valid_media_type(value: &str) -> bool {
    let Some((kind, subtype)) = value.split_once('/') else {
        return false;
    };
    let valid_part = |part: &str| {
        !part.is_empty()
            && part.len() <= 127
            && part.bytes().enumerate().all(|(index, byte)| {
                if index == 0 {
                    byte.is_ascii_alphanumeric()
                } else {
                    byte.is_ascii_alphanumeric()
                        || matches!(
                            byte,
                            b'!' | b'#' | b'$' | b'&' | b'+' | b'.' | b'^' | b'_' | b'-'
                        )
                }
            })
    };
    valid_part(kind) && valid_part(subtype)
}

fn inferred_asset_media_type(name: &str) -> &'static str {
    match name
        .rsplit_once('.')
        .map(|(_, extension)| extension.to_ascii_lowercase())
        .as_deref()
    {
        Some("avif") => "image/avif",
        Some("gif") => "image/gif",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("png") => "image/png",
        Some("svg") => "image/svg+xml",
        Some("webp") => "image/webp",
        Some("csv") => "text/csv",
        Some("json") => "application/json",
        Some("md") => "text/markdown",
        Some("txt") => "text/plain",
        Some("pdf") => "application/pdf",
        Some("mp3") => "audio/mpeg",
        Some("wav") => "audio/wav",
        Some("m4a") => "audio/mp4",
        Some("mov") => "video/quicktime",
        Some("mp4") => "video/mp4",
        Some("webm") => "video/webm",
        Some("zip") => "application/zip",
        _ => "application/octet-stream",
    }
}

fn asset_media_type(requested: Option<String>, name: &str) -> String {
    requested
        .and_then(|value| {
            value
                .split(';')
                .next()
                .map(str::trim)
                .map(str::to_ascii_lowercase)
        })
        .filter(|value| valid_media_type(value))
        .unwrap_or_else(|| inferred_asset_media_type(name).to_string())
}

fn collision_asset_name(name: &str, attempt: usize) -> String {
    if attempt == 1 {
        return name.to_string();
    }
    match name.rsplit_once('.') {
        Some((stem, extension)) if !stem.is_empty() && !extension.is_empty() => {
            format!("{stem} ({attempt}).{extension}")
        }
        _ => format!("{name} ({attempt})"),
    }
}

fn create_asset_file(
    root: &Path,
    requested_name: &str,
) -> Result<(String, PathBuf, File), (u16, String)> {
    for attempt in 1..=10_000 {
        let name = collision_asset_name(requested_name, attempt);
        let path = root.join(&name);
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(file) => return Ok((name, path, file)),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err((500, format!("create asset file: {error}"))),
        }
    }
    Err((409, "could not choose a unique asset file name".to_string()))
}

fn allocate_asset_entry(
    host: &QjsHost,
    name: &str,
    media_type: &str,
    size: u64,
) -> Result<AssetEntry, (u16, String)> {
    let request = serde_json::json!({
        "name": name,
        "mediaType": media_type,
        "size": size.to_string(),
        "uri": format!("assets/{}", percent_encode_path_segment(name)),
    })
    .to_string();
    let result = host
        .invoke("allocateFileEntry", &[request])
        .map_err(|error| (500, error.to_string()))?;
    let envelope: serde_json::Value = serde_json::from_str(&result)
        .map_err(|error| (500, format!("decode allocated File entry: {error}")))?;
    if envelope.get("ok").and_then(serde_json::Value::as_bool) != Some(true) {
        let message = envelope
            .get("error")
            .and_then(|error| error.get("message"))
            .and_then(serde_json::Value::as_str)
            .unwrap_or("Runtime refused the File entry");
        return Err((400, message.to_string()));
    }
    serde_json::from_value(envelope.get("value").cloned().unwrap_or_default())
        .map_err(|error| (500, format!("invalid allocated File entry: {error}")))
}

fn upload_asset_response(
    request: &mut tiny_http::Request,
    request_url: &str,
    mount: &AssetMount,
    host: &QjsHost,
) -> tiny_http::Response<std::io::Cursor<Vec<u8>>> {
    let result = (|| -> Result<AssetEntry, (u16, String)> {
        if request
            .body_length()
            .is_some_and(|length| u64::try_from(length).unwrap_or(u64::MAX) > ASSET_BYTES_MAX)
        {
            return Err((413, "asset exceeds the 256 MiB upload limit".to_string()));
        }
        let requested_name = asset_name(
            &query_text_parameter(request_url, "name")
                .ok_or_else(|| (400, "asset file name is required".to_string()))?,
        )?;
        let media_type = asset_media_type(
            query_text_parameter(request_url, "mediaType"),
            &requested_name,
        );
        let (name, path, mut file) = create_asset_file(&mount.root, &requested_name)?;
        let write_result = (|| -> Result<u64, (u16, String)> {
            let mut reader = request.as_reader().take(ASSET_BYTES_MAX + 1);
            let mut buffer = [0_u8; 64 * 1024];
            let mut size = 0_u64;
            loop {
                let read = reader
                    .read(&mut buffer)
                    .map_err(|error| (400, format!("read asset upload: {error}")))?;
                if read == 0 {
                    break;
                }
                size += read as u64;
                if size > ASSET_BYTES_MAX {
                    return Err((413, "asset exceeds the 256 MiB upload limit".to_string()));
                }
                file.write_all(&buffer[..read])
                    .map_err(|error| (500, format!("write asset file: {error}")))?;
            }
            file.sync_all()
                .map_err(|error| (500, format!("sync asset file: {error}")))?;
            Ok(size)
        })();
        drop(file);
        let size = match write_result {
            Ok(size) => size,
            Err(error) => {
                let _ = std::fs::remove_file(&path);
                return Err(error);
            }
        };
        match allocate_asset_entry(host, &name, &media_type, size) {
            Ok(entry) => {
                mount.cache_entry(entry.clone());
                Ok(entry)
            }
            Err(error) => {
                let _ = std::fs::remove_file(&path);
                Err(error)
            }
        }
    })();
    match result {
        Ok(entry) => json_response(&serde_json::json!({ "ok": true, "value": entry }).to_string()),
        Err((status, message)) => error_response(status, &message),
    }
}

fn asset_content_response(
    lease: &AssetLeaseRecord,
) -> Result<tiny_http::Response<File>, (u16, String)> {
    let file =
        File::open(&lease.path).map_err(|_| (404, "Asset file is unavailable".to_string()))?;
    let canonical = std::fs::canonicalize(&lease.path)
        .map_err(|_| (404, "Asset file is unavailable".to_string()))?;
    if canonical != lease.path {
        return Err((
            403,
            "Asset path changed after the lease was issued".to_string(),
        ));
    }
    let metadata = file
        .metadata()
        .map_err(|_| (404, "Asset file is unavailable".to_string()))?;
    let declared_size = lease
        .entry
        .size
        .parse::<u64>()
        .map_err(|_| (409, "File entry size is invalid".to_string()))?;
    if !metadata.is_file() || metadata.len() != declared_size {
        return Err((409, "Asset changed after the lease was issued".to_string()));
    }
    let disposition = if lease.purpose == "download" {
        "attachment"
    } else {
        "inline"
    };
    let content_disposition = format!(
        "Content-Disposition: {disposition}; filename*=UTF-8''{}",
        percent_encode_path_segment(&lease.entry.name)
    );
    Ok(tiny_http::Response::from_file(file)
        .with_header(
            format!("Content-Type: {}", lease.entry.media_type)
                .parse::<tiny_http::Header>()
                .unwrap(),
        )
        .with_header(content_disposition.parse::<tiny_http::Header>().unwrap())
        .with_header(
            "Cache-Control: private, no-store"
                .parse::<tiny_http::Header>()
                .unwrap(),
        )
        .with_header(
            "X-Content-Type-Options: nosniff"
                .parse::<tiny_http::Header>()
                .unwrap(),
        )
        .with_header(
            "Content-Security-Policy: sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'"
                .parse::<tiny_http::Header>()
                .unwrap(),
        )
        .with_header(
            "Cross-Origin-Resource-Policy: same-origin"
                .parse::<tiny_http::Header>()
                .unwrap(),
        ))
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

pub struct ServeOptions {
    pub port: u16,
    pub ui_dir: Option<PathBuf>,
    pub assets_dir: Option<PathBuf>,
    pub open_browser: bool,
    pub lan: bool,
    pub requested_host: Option<IpAddr>,
    pub relay: Option<RelayConfig>,
}

pub fn run_serve(db_path: &Path, options: ServeOptions) -> anyhow::Result<()> {
    let ServeOptions {
        port,
        ui_dir,
        assets_dir,
        open_browser,
        lan,
        requested_host,
        relay,
    } = options;
    let file_name = db_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("file.eidos")
        .to_string();
    let state = Rc::new(open_host_state(db_path)?);
    let host = QjsHost::new(&state)?;
    let network = ServeNetwork::new(port, lan, requested_host)?;
    let events = EventHub::default();
    let assets = assets_dir.as_deref().map(AssetMount::new).transpose()?;

    let server = tiny_http::Server::http(network.bind)
        .map_err(|error| anyhow!("bind {}: {error}", network.bind))?;
    let browser_url = relay
        .as_ref()
        .map(|config| config.public_url.clone())
        .unwrap_or_else(|| network.browser_url());
    let relay_browser_access = relay.as_ref().map(|config| config.browser_access);
    let relay_connector = relay
        .map(|config| RelayConnector::start(config, network.bind.port()))
        .transpose()?;
    println!("eidos serve {file_name}");
    println!("  url: {browser_url}");
    println!(
        "  network: {}",
        if relay_connector.is_some() {
            "relay"
        } else {
            network.mode()
        }
    );
    if let Some(dir) = &ui_dir {
        println!("  ui:  {}", dir.display());
    } else {
        println!("  ui:  (embedded)");
    }
    if let Some(mount) = &assets {
        println!("  assets: {}", mount.root.display());
    } else {
        println!("  assets: (not mounted; pass --assets-dir <dir> to enable)");
    }
    if network.lan.is_some() {
        println!("  access: paired browsers can read and write");
        println!("  warning: use this HTTP link only on a trusted private network");
    } else if let Some(browser_access) = relay_browser_access {
        match browser_access {
            RelayBrowserAccess::Account => {
                println!("  access: your Eidos account can read and write");
            }
            RelayBrowserAccess::Share => {
                println!("  access: anyone with the access link can read and write");
                println!(
                    "  warning: the URL fragment is the browser access key; share it carefully"
                );
            }
        }
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

        if method == "POST" && url_path == "/api/assets/upload" {
            let response = match &assets {
                Some(mount) => upload_asset_response(&mut request, &request_url, mount, &host),
                None => error_response(404, "no assets folder is mounted"),
            };
            if let Err(error) = request.respond(response) {
                eprintln!("respond failed: {error}");
            }
            continue;
        }

        if method == "GET" && url_path.starts_with("/api/assets/content/") {
            let resource_id = url_path.trim_start_matches("/api/assets/content/");
            let result = assets
                .as_ref()
                .ok_or_else(|| (404, "no assets folder is mounted".to_string()))
                .and_then(|mount| mount.content(resource_id))
                .and_then(|lease| asset_content_response(&lease));
            let responded = match result {
                Ok(response) => request.respond(response),
                Err((status, message)) => request.respond(error_response(status, &message)),
            };
            if let Err(error) = responded {
                eprintln!("respond failed: {error}");
            }
            continue;
        }

        let source_client_id = request_client_id(&request);
        let request_network = if header_value(&request, "X-Eidos-Relay") == Some("1") {
            "relay"
        } else {
            network.mode()
        };
        let response = match (method.as_str(), url_path.as_str()) {
            ("GET", "/api/manifest") => {
                let mut manifest = serde_json::json!({
                    "mode": "cli",
                    "fileName": file_name,
                    "access": "readwrite",
                    "network": request_network,
                });
                if assets.is_some() {
                    manifest["assets"] = serde_json::json!({
                        "mounted": true,
                        "assetBytesMax": ASSET_BYTES_MAX.to_string(),
                        "assetPreviewBytesMax": ASSET_PREVIEW_BYTES_MAX.to_string(),
                        "concurrentAssetLeasesMax": ASSET_LEASES_MAX,
                    });
                }
                json_response(&manifest.to_string())
            }
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
                            if let Some(mount) = &assets {
                                mount.cache_runtime_result(&method, &result);
                            }
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
            ("POST", "/api/assets/resolve") => match (&assets, read_json_body(&mut request)) {
                (None, _) => error_response(404, "no assets folder is mounted"),
                (Some(_), Err((status, message))) => error_response(status, &message),
                (Some(mount), Ok(value)) => {
                    let entry_id = value
                        .get("entryId")
                        .and_then(serde_json::Value::as_str)
                        .unwrap_or("");
                    let purpose = value
                        .get("purpose")
                        .and_then(serde_json::Value::as_str)
                        .unwrap_or("");
                    match mount.resolve(entry_id, purpose) {
                        Ok(lease) => json_response(
                            &serde_json::json!({ "ok": true, "value": lease }).to_string(),
                        ),
                        Err((status, message)) => error_response(status, &message),
                    }
                }
            },
            ("POST", "/api/assets/release") => match (&assets, read_json_body(&mut request)) {
                (None, _) => error_response(404, "no assets folder is mounted"),
                (Some(_), Err((status, message))) => error_response(status, &message),
                (Some(mount), Ok(value)) => {
                    let lease_id = value
                        .get("leaseId")
                        .and_then(serde_json::Value::as_str)
                        .unwrap_or("");
                    mount.release(lease_id);
                    json_response(&serde_json::json!({ "ok": true }).to_string())
                }
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
        allowed_host, allowed_origin, collision_asset_name, decode_asset_uri, is_lan_address,
        mutation_event, query_parameter, query_text_parameter, AssetEntry, AssetMount, EmbeddedUi,
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
    fn asset_query_and_uri_decoding_preserve_unicode_and_containment() {
        assert_eq!(
            query_text_parameter("/api/assets/upload?name=%E5%9B%BE%E7%89%87+1.png", "name")
                .as_deref(),
            Some("图片 1.png")
        );
        assert_eq!(
            decode_asset_uri("assets/report%20%2B%20final.pdf").as_deref(),
            Some(std::path::Path::new("report + final.pdf"))
        );
        assert!(decode_asset_uri("assets/%2E%2E/private.txt").is_none());
        assert!(decode_asset_uri("../assets/private.txt").is_none());
        assert!(decode_asset_uri("assets/folder\\private.txt").is_none());
        assert!(decode_asset_uri("assets/private.txt?download=1").is_none());
    }

    #[test]
    fn asset_collision_names_preserve_extensions() {
        assert_eq!(collision_asset_name("report.pdf", 1), "report.pdf");
        assert_eq!(collision_asset_name("report.pdf", 2), "report (2).pdf");
        assert_eq!(collision_asset_name("README", 3), "README (3)");
    }

    #[test]
    fn runtime_pages_cache_only_typed_file_columns() {
        let root = tempfile::tempdir().unwrap();
        let mount = AssetMount::new(root.path()).unwrap();
        let result = serde_json::json!({
            "ok": true,
            "value": {
                "columns": [
                    { "valueType": "file" },
                    { "valueType": { "kind": "list", "element": "file-entry" } },
                    { "valueType": "json" }
                ],
                "rows": [{
                    "values": [
                        [{
                            "id": "0198c72d-82b5-7968-b163-98be4b7477de",
                            "name": "photo.png",
                            "mediaType": "image/png",
                            "size": "3",
                            "uri": "assets/photo.png"
                        }],
                        [{
                            "id": "0198c72d-82b5-7968-b163-98be4b7477df",
                            "name": "cover.png",
                            "mediaType": "image/png",
                            "size": "3",
                            "uri": "assets/cover.png"
                        }],
                        {
                            "id": "0198c72d-82b5-7968-a163-98be4b7477df",
                            "name": "forged.png",
                            "mediaType": "image/png",
                            "size": "3",
                            "uri": "assets/forged.png"
                        }
                    ]
                }]
            }
        })
        .to_string();

        mount.cache_runtime_result("queryRows", &result);

        let entries = mount.entries.borrow();
        assert!(entries.contains_key("0198c72d-82b5-7968-b163-98be4b7477de"));
        assert!(entries.contains_key("0198c72d-82b5-7968-b163-98be4b7477df"));
        assert!(!entries.contains_key("0198c72d-82b5-7968-a163-98be4b7477df"));
    }

    #[test]
    fn mounted_assets_resolve_through_short_lived_leases() {
        let root = tempfile::tempdir().unwrap();
        std::fs::write(root.path().join("cover.png"), b"png").unwrap();
        let mount = AssetMount::new(root.path()).unwrap();
        let entry = AssetEntry {
            id: "0198c72d-82b5-7968-b163-98be4b7477df".to_string(),
            name: "cover.png".to_string(),
            media_type: "image/png".to_string(),
            size: "3".to_string(),
            uri: "assets/cover.png".to_string(),
        };
        mount.cache_entry(entry.clone());

        let lease = mount.resolve(&entry.id, "thumbnail").unwrap();
        assert_eq!(lease["entryId"], entry.id);
        assert_eq!(lease["purpose"], "thumbnail");
        let resource = lease["resourceToken"]
            .as_str()
            .unwrap()
            .trim_start_matches("/api/assets/content/");
        assert_eq!(
            mount.content(resource).unwrap().path,
            mount.root.join("cover.png")
        );

        mount.release(lease["leaseId"].as_str().unwrap());
        assert_eq!(
            mount
                .leases
                .borrow()
                .values()
                .filter(|lease| lease.active)
                .count(),
            0
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
