//! Trusted host-side network broker. Guest code never owns sockets or policy.
use anyhow::{anyhow, bail, ensure, Context, Result};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256, Sha384, Sha512};
use std::{
    collections::{HashMap, HashSet},
    net::{IpAddr, SocketAddr},
    sync::{mpsc::SyncSender, Arc},
    time::Duration,
};
use tokio::{
    net::TcpStream,
    runtime::Runtime,
    sync::mpsc,
    task::AbortHandle,
    time::{timeout, timeout_at, Instant},
};
use tokio_tungstenite::{
    client_async_tls_with_config,
    tungstenite::{
        client::IntoClientRequest,
        protocol::{frame::coding::CloseCode, CloseFrame, WebSocketConfig},
        Message,
    },
};
use url::Url;

const BODY_LIMIT: usize = 1024 * 1024;
const OP_LIMIT: usize = 16;
const SEND_LIMIT: usize = 4 * BODY_LIMIT;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Clone)]
pub struct Policy {
    origins: HashSet<String>,
    private: bool,
    #[cfg(test)]
    resolution_delay: Option<Duration>,
}

impl Policy {
    pub fn new(origins: Vec<String>, private: bool) -> Result<Self> {
        let mut allowed = HashSet::new();
        for origin in origins {
            if origin == "*" {
                allowed.insert(origin);
                continue;
            }
            let url = parse_url(&origin, false)?;
            ensure!(
                url.path() == "/" && url.query().is_none() && url.fragment().is_none(),
                "--allow-net requires an origin without path/query/fragment"
            );
            allowed.insert(url.origin().ascii_serialization());
        }
        Ok(Self {
            origins: allowed,
            private,
            #[cfg(test)]
            resolution_delay: None,
        })
    }

    async fn resolve(&self, url: &Url) -> Result<Vec<SocketAddr>> {
        ensure!(
            self.origins.contains(&url.origin().ascii_serialization())
                || (self.origins.contains("*") && matches!(url.scheme(), "https" | "wss")),
            "Network permission denied for {}",
            url.origin().ascii_serialization()
        );
        let host = match url.host().ok_or_else(|| anyhow!("Missing host"))? {
            url::Host::Domain(name) => name.to_owned(),
            url::Host::Ipv4(ip) => ip.to_string(),
            url::Host::Ipv6(ip) => ip.to_string(),
        };
        #[cfg(test)]
        if let Some(delay) = self.resolution_delay {
            tokio::time::sleep(delay).await;
        }
        let port = url
            .port_or_known_default()
            .ok_or_else(|| anyhow!("Missing port"))?;
        let addresses: Vec<_> = tokio::net::lookup_host((host.as_str(), port))
            .await?
            .take(32)
            .collect();
        ensure!(!addresses.is_empty(), "DNS returned no addresses");
        ensure!(self.private || addresses.iter().all(|addr| public_address(addr.ip())), "Private/reserved destination denied; host must pass --allow-private-net as well as --allow-net");
        Ok(addresses)
    }
}

fn public_address(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => {
            let [a, b, c, _] = ip.octets();
            !(a == 0
                || a == 10
                || a == 127
                || a >= 224
                || (a == 100 && (64..=127).contains(&b))
                || (a == 169 && b == 254)
                || (a == 172 && (16..=31).contains(&b))
                || (a == 192 && (b == 168 || b == 0 || (b == 88 && c == 99)))
                || (a == 198 && (b == 18 || b == 19 || (b == 51 && c == 100)))
                || (a == 203 && b == 0 && c == 113))
        }
        IpAddr::V6(ip) => {
            if let Some(ip) = ip.to_ipv4_mapped() {
                return public_address(IpAddr::V4(ip));
            }
            let segments = ip.segments();
            // Restrict to ordinary global unicast; exclude IETF special space,
            // documentation and transition ranges which can tunnel private IPv4.
            segments[0] & 0xe000 == 0x2000
                && !(segments[0] == 0x2001 && (segments[1] < 0x200 || segments[1] == 0xdb8))
                && segments[0] != 0x2002
                && !(segments[0] == 0x3fff && segments[1] < 0x1000)
        }
    }
}

fn parse_url(value: &str, websocket: bool) -> Result<Url> {
    ensure!(value.len() <= 8192, "URL too long");
    let mut url = Url::parse(value).context("Invalid absolute URL")?;
    ensure!(
        url.username().is_empty() && url.password().is_none(),
        "URL credentials are not supported"
    );
    if websocket {
        ensure!(
            url.fragment().is_none(),
            "WebSocket URL must not contain a fragment"
        );
        match url.scheme() {
            "http" => {
                url.set_scheme("ws").unwrap();
            }
            "https" => {
                url.set_scheme("wss").unwrap();
            }
            "ws" | "wss" => {}
            _ => bail!("WebSocket requires ws/wss URL"),
        }
    } else {
        ensure!(
            matches!(url.scheme(), "http" | "https" | "ws" | "wss"),
            "Only HTTP(S) and WS(S) origins are supported"
        );
    }
    ensure!(url.host().is_some(), "Missing host");
    Ok(url)
}

#[derive(Clone)]
struct Events {
    sender: mpsc::Sender<Value>,
    wake: SyncSender<()>,
}
impl Events {
    async fn send(&self, event: Value) {
        if self.sender.send(event).await.is_ok() {
            let _ = self.wake.try_send(());
        }
    }
}

struct Operation {
    abort: AbortHandle,
    socket: Option<mpsc::Sender<SocketCommand>>,
    pull: Option<mpsc::Sender<()>>,
    queued: usize,
}
enum SocketCommand {
    Send(Message, usize),
    Close(Option<CloseFrame>),
}

pub struct Network {
    runtime: Option<Runtime>,
    policy: Arc<Policy>,
    events: Events,
    receiver: mpsc::Receiver<Value>,
    operations: HashMap<u64, Operation>,
    next_id: u64,
}

impl Network {
    pub fn new(policy: Policy, wake: SyncSender<()>) -> Result<Self> {
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .enable_all()
            .build()?;
        let (sender, receiver) = mpsc::channel(32);
        Ok(Self {
            runtime: Some(runtime),
            policy: Arc::new(policy),
            events: Events { sender, wake },
            receiver,
            operations: HashMap::new(),
            next_id: 1,
        })
    }
    pub fn pending(&self) -> bool {
        !self.operations.is_empty()
    }
    pub fn poll(&mut self) -> Option<Value> {
        while let Ok(event) = self.receiver.try_recv() {
            let id = event["id"].as_u64()?;
            let Some(operation) = self.operations.get_mut(&id) else {
                continue;
            };
            match event["type"].as_str() {
                Some("fetch_end" | "fetch_error" | "ws_close") => {
                    self.operations.remove(&id);
                }
                Some("ws_drain") => {
                    operation.queued = operation
                        .queued
                        .saturating_sub(event["bytes"].as_u64().unwrap_or(0) as usize)
                }
                _ => {}
            }
            return Some(event);
        }
        None
    }
    pub fn stop(&mut self) {
        for (_, op) in self.operations.drain() {
            op.abort.abort();
        }
        self.receiver.close();
    }
    fn id(&mut self) -> Result<u64> {
        ensure!(
            self.operations.len() < OP_LIMIT,
            "Network operation limit reached (16)"
        );
        let id = self.next_id;
        self.next_id += 1;
        ensure!(id < 9_007_199_254_740_991, "Resource ID limit reached");
        Ok(id)
    }
    // This entry point validates all input independently of the JS facade.
    pub fn call(&mut self, method: &str, input: &str) -> String {
        let result = (|| -> Result<Value> {
            ensure!(input.len() <= 72 * BODY_LIMIT, "Host request too large");
            let value: Value = serde_json::from_str(input)?;
            match method {
                "url" => {
                    let url = parse_url(
                        value["url"]
                            .as_str()
                            .ok_or_else(|| anyhow!("Expected URL string"))?,
                        value["websocket"] == true,
                    )?;
                    Ok(json!({"url":url.as_str(),"origin":url.origin().ascii_serialization()}))
                }
                "encode" => Ok(json!(value
                    .as_str()
                    .ok_or_else(|| anyhow!("Expected string"))?
                    .as_bytes())),
                "decode" => {
                    let bytes: Vec<u8> = serde_json::from_value(value["bytes"].clone())?;
                    ensure!(bytes.len() <= 16 * BODY_LIMIT, "Byte limit exceeded");
                    let text = if value["fatal"] == true {
                        String::from_utf8(bytes)?
                    } else {
                        String::from_utf8_lossy(&bytes).into_owned()
                    };
                    Ok(json!(if value["ignoreBOM"] == true {
                        &text
                    } else {
                        text.strip_prefix('\u{feff}').unwrap_or(&text)
                    }))
                }
                "base64.encode" => {
                    let bytes: Vec<u8> = serde_json::from_value(value)?;
                    ensure!(
                        bytes.len() <= 16 * BODY_LIMIT,
                        "Encoding input exceeds 16 MiB"
                    );
                    Ok(json!(BASE64.encode(bytes)))
                }
                "base64.decode" => {
                    let bytes = BASE64.decode(
                        value
                            .as_str()
                            .ok_or_else(|| anyhow!("Expected base64 string"))?,
                    )?;
                    ensure!(
                        bytes.len() <= 16 * BODY_LIMIT,
                        "Encoding input exceeds 16 MiB"
                    );
                    Ok(json!(bytes))
                }
                "fetch" => self.start_fetch(serde_json::from_value(value)?),
                "digest" => {
                    let bytes = BASE64.decode(
                        value["body"]
                            .as_str()
                            .ok_or_else(|| anyhow!("Missing body"))?,
                    )?;
                    let digest = match value["algorithm"].as_str() {
                        Some("sha256") => Sha256::digest(bytes).to_vec(),
                        Some("sha384") => Sha384::digest(bytes).to_vec(),
                        Some("sha512") => Sha512::digest(bytes).to_vec(),
                        _ => bail!("Unsupported integrity algorithm"),
                    };
                    Ok(json!(BASE64.encode(digest)))
                }
                "fetch.pull" => {
                    let id = value
                        .as_u64()
                        .ok_or_else(|| anyhow!("Invalid request ID"))?;
                    let op = self
                        .operations
                        .get(&id)
                        .ok_or_else(|| anyhow!("Request closed"))?;
                    op.pull
                        .as_ref()
                        .ok_or_else(|| anyhow!("Not a fetch request"))?
                        .try_send(())
                        .map_err(|_| anyhow!("Read already pending"))?;
                    Ok(Value::Null)
                }
                "cancel" => {
                    let id = value
                        .as_u64()
                        .ok_or_else(|| anyhow!("Invalid request ID"))?;
                    if let Some(op) = self.operations.remove(&id) {
                        op.abort.abort();
                    }
                    Ok(Value::Null)
                }
                "ws.open" => self.start_socket(serde_json::from_value(value)?),
                "ws.send" => {
                    let id = value["id"]
                        .as_u64()
                        .ok_or_else(|| anyhow!("Invalid socket ID"))?;
                    let bytes = BASE64.decode(
                        value["body"]
                            .as_str()
                            .ok_or_else(|| anyhow!("Missing body"))?,
                    )?;
                    ensure!(bytes.len() <= BODY_LIMIT, "WebSocket message exceeds 1 MiB");
                    let size = bytes.len();
                    let message = if value["binary"] == true {
                        Message::Binary(bytes.into())
                    } else {
                        Message::Text(String::from_utf8(bytes)?.into())
                    };
                    let op = self
                        .operations
                        .get_mut(&id)
                        .ok_or_else(|| anyhow!("Socket is closed"))?;
                    ensure!(
                        op.queued + size <= SEND_LIMIT,
                        "WebSocket send buffer exceeds 4 MiB"
                    );
                    op.socket
                        .as_ref()
                        .ok_or_else(|| anyhow!("Not a socket"))?
                        .try_send(SocketCommand::Send(message, size))
                        .map_err(|_| anyhow!("WebSocket command queue is full/closed"))?;
                    op.queued += size;
                    Ok(json!(size))
                }
                "ws.close" => {
                    let id = value["id"]
                        .as_u64()
                        .ok_or_else(|| anyhow!("Invalid socket ID"))?;
                    let reason = value["reason"].as_str().unwrap_or("");
                    ensure!(reason.len() <= 123, "Close reason exceeds 123 UTF-8 bytes");
                    let frame = match value["code"].as_u64() {
                        None => None,
                        Some(code) => {
                            ensure!(
                                code == 1000 || (3000..=4999).contains(&code),
                                "Invalid close code"
                            );
                            Some(CloseFrame {
                                code: CloseCode::from(code as u16),
                                reason: reason.to_owned().into(),
                            })
                        }
                    };
                    if let Some(op) = self.operations.get(&id) {
                        op.socket
                            .as_ref()
                            .ok_or_else(|| anyhow!("Not a socket"))?
                            .try_send(SocketCommand::Close(frame))
                            .map_err(|_| anyhow!("WebSocket command queue is full/closed"))?;
                    }
                    Ok(Value::Null)
                }
                _ => bail!("Unknown host operation"),
            }
        })();
        match result {
            Ok(value) => json!({"ok":true,"value":value}).to_string(),
            Err(error) => json!({"ok":false,"error":format!("{error:#}")}).to_string(),
        }
    }
    fn start_fetch(&mut self, request: FetchRequest) -> Result<Value> {
        let id = self.id()?;
        let policy = self.policy.clone();
        let events = self.events.clone();
        let (pull, receiver) = mpsc::channel(1);
        let task = self.runtime.as_ref().unwrap().spawn(async move {
            if let Err(error) = fetch(&policy, request, id, &events, receiver).await {
                events
                    .send(json!({"type":"fetch_error","id":id,"error":format!("{error:#}")}))
                    .await;
            }
        });
        self.operations.insert(
            id,
            Operation {
                abort: task.abort_handle(),
                socket: None,
                pull: Some(pull),
                queued: 0,
            },
        );
        Ok(json!(id))
    }
    fn start_socket(&mut self, request: SocketRequest) -> Result<Value> {
        let id = self.id()?;
        let (sender, receiver) = mpsc::channel(32);
        let policy = self.policy.clone();
        let events = self.events.clone();
        let task = self.runtime.as_ref().unwrap().spawn(async move {
            match socket(&policy, request, id, &events, receiver).await {
                Ok((code, reason, clean)) => events.send(json!({"type":"ws_close","id":id,"code":code,"reason":reason,"wasClean":clean})).await,
                Err(error) => {
                    events.send(json!({"type":"ws_error","id":id,"error":format!("{error:#}")})).await;
                    events.send(json!({"type":"ws_close","id":id,"code":1006,"reason":"","wasClean":false})).await;
                }
            }
        });
        self.operations.insert(
            id,
            Operation {
                abort: task.abort_handle(),
                socket: Some(sender),
                pull: None,
                queued: 0,
            },
        );
        Ok(json!(id))
    }
}

impl Drop for Network {
    fn drop(&mut self) {
        self.stop();
        if let Some(runtime) = self.runtime.take() {
            runtime.shutdown_timeout(Duration::from_secs(1));
        }
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct FetchRequest {
    url: String,
    method: String,
    headers: Vec<(String, String)>,
    body: Option<String>,
    redirect: String,
}

fn forbidden_header(name: &str) -> bool {
    matches!(
        name,
        "host"
            | "connection"
            | "content-length"
            | "transfer-encoding"
            | "upgrade"
            | "cookie"
            | "cookie2"
            | "origin"
            | "referer"
            | "accept-encoding"
            | "expect"
            | "trailer"
            | "te"
            | "via"
            | "keep-alive"
            | "accept-charset"
            | "date"
            | "dnt"
            | "permissions-policy"
            | "set-cookie"
    ) || name.starts_with("proxy-")
        || name.starts_with("sec-")
}

async fn fetch(
    policy: &Policy,
    request: FetchRequest,
    id: u64,
    events: &Events,
    pulls: mpsc::Receiver<()>,
) -> Result<()> {
    fetch_with_deadline(
        policy,
        request,
        id,
        events,
        pulls,
        Instant::now() + REQUEST_TIMEOUT,
    )
    .await
}

async fn fetch_with_deadline(
    policy: &Policy,
    request: FetchRequest,
    id: u64,
    events: &Events,
    mut pulls: mpsc::Receiver<()>,
    header_deadline: Instant,
) -> Result<()> {
    let mut url = parse_url(&request.url, false)?;
    ensure!(
        matches!(url.scheme(), "http" | "https"),
        "fetch requires HTTP(S)"
    );
    url.set_fragment(None);
    let mut method = reqwest::Method::from_bytes(request.method.as_bytes())?;
    ensure!(
        !["CONNECT", "TRACE", "TRACK"]
            .iter()
            .any(|m| request.method.eq_ignore_ascii_case(m)),
        "Forbidden HTTP method"
    );
    let mut body = request.body.map(|body| BASE64.decode(body)).transpose()?;
    ensure!(
        body.as_ref().is_none_or(|body| body.len() <= BODY_LIMIT),
        "Request body exceeds 1 MiB"
    );
    ensure!(
        !(method == reqwest::Method::GET || method == reqwest::Method::HEAD) || body.is_none(),
        "GET/HEAD cannot have a body"
    );
    ensure!(
        ["follow", "manual", "error"].contains(&request.redirect.as_str()),
        "Invalid redirect mode"
    );
    ensure!(request.headers.len() <= 128, "Too many headers");
    let mut headers = reqwest::header::HeaderMap::new();
    let mut header_bytes = 0;
    for (name, value) in request.headers {
        header_bytes += name.len() + value.len();
        ensure!(header_bytes <= 32 * 1024, "Headers exceed 32 KiB");
        let name = reqwest::header::HeaderName::from_bytes(name.as_bytes())?;
        if forbidden_header(name.as_str()) {
            continue;
        }
        headers.append(name, reqwest::header::HeaderValue::from_str(&value)?);
    }
    for hop in 0..=20 {
        let addresses = timeout_at(header_deadline, policy.resolve(&url))
            .await
            .context("Fetch response headers timed out during DNS")??;
        // No environment proxies, cookie jar, automatic redirects, or second DNS lookup.
        let client = reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(CONNECT_TIMEOUT)
            .resolve_to_addrs(url.host_str().unwrap(), &addresses)
            .build()?;
        let mut builder = client
            .request(method.clone(), url.clone())
            .headers(headers.clone());
        if let Some(body) = &body {
            builder = builder.body(body.clone());
        }
        let mut response = timeout_at(header_deadline, builder.send())
            .await
            .context("Fetch response headers timed out")??;
        let status = response.status().as_u16();
        if [301, 302, 303, 307, 308].contains(&status) {
            if request.redirect == "error" {
                bail!("Redirect disallowed by request");
            }
            if request.redirect == "manual" {
                events.send(json!({"type":"fetch_response","id":id,"status":0,"statusText":"","headers":[],"body":null,"url":"","redirected":false,"responseType":"opaqueredirect"})).await;
                events.send(json!({"type":"fetch_end","id":id})).await;
                return Ok(());
            }
            if let Some(location) = response.headers().get(reqwest::header::LOCATION) {
                ensure!(hop < 20, "Too many redirects");
                let next = parse_url(url.join(location.to_str()?)?.as_str(), false)?;
                ensure!(
                    matches!(next.scheme(), "http" | "https"),
                    "Redirect requires HTTP(S)"
                );
                if url.origin() != next.origin() {
                    headers.remove(reqwest::header::AUTHORIZATION);
                }
                if ((status == 301 || status == 302) && method == reqwest::Method::POST)
                    || (status == 303
                        && method != reqwest::Method::GET
                        && method != reqwest::Method::HEAD)
                {
                    method = reqwest::Method::GET;
                    body = None;
                    for name in [
                        "content-type",
                        "content-encoding",
                        "content-language",
                        "content-location",
                    ] {
                        headers.remove(name);
                    }
                }
                url = next;
                url.set_fragment(None);
                continue;
            }
        }
        let response_headers: Vec<_> = response
            .headers()
            .iter()
            .filter(|(name, _)| name.as_str() != "set-cookie" && name.as_str() != "set-cookie2")
            .map(|(name, value)| {
                (
                    name.as_str().to_owned(),
                    value
                        .as_bytes()
                        .iter()
                        .map(|b| char::from(*b))
                        .collect::<String>(),
                )
            })
            .collect();
        ensure!(
            response_headers
                .iter()
                .map(|(a, b)| a.len() + b.len())
                .sum::<usize>()
                <= 32 * 1024,
            "Response headers exceed 32 KiB"
        );
        let null_body = method == reqwest::Method::HEAD || [204, 205, 304].contains(&status);
        events.send(json!({"type":"fetch_response","id":id,"status":status,"statusText":response.status().canonical_reason().unwrap_or(""),"headers":response_headers,"body":if null_body {None} else {Some("")},"url":url.as_str(),"redirected":hop>0,"responseType":"basic"})).await;
        if !null_body {
            // Read only on guest demand. Each event is bounded even for large HTTP chunks.
            let mut queued = Vec::new();
            let mut offset = 0;
            loop {
                if timeout(REQUEST_TIMEOUT, pulls.recv()).await?.is_none() {
                    return Ok(());
                }
                if offset == queued.len() {
                    match timeout(REQUEST_TIMEOUT, response.chunk()).await?? {
                        Some(chunk) => {
                            queued = chunk.to_vec();
                            offset = 0;
                        }
                        None => break,
                    }
                }
                let end = (offset + 16 * 1024).min(queued.len());
                events.send(json!({"type":"fetch_chunk","id":id,"body":BASE64.encode(&queued[offset..end])})).await;
                offset = end;
            }
        }
        events.send(json!({"type":"fetch_end","id":id})).await;
        return Ok(());
    }
    bail!("Too many redirects")
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SocketRequest {
    url: String,
    protocols: Vec<String>,
}

async fn socket(
    policy: &Policy,
    request: SocketRequest,
    id: u64,
    events: &Events,
    mut commands: mpsc::Receiver<SocketCommand>,
) -> Result<(u16, String, bool)> {
    let url = parse_url(&request.url, true)?;
    let mut unique = HashSet::new();
    ensure!(
        request.protocols.len() <= 32,
        "Too many WebSocket protocols"
    );
    for protocol in &request.protocols {
        ensure!(
            !protocol.is_empty()
                && protocol.len() <= 256
                && protocol
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"!#$%&'*+-.^_`|~".contains(&b))
                && unique.insert(protocol),
            "Invalid/duplicate WebSocket protocol"
        );
    }
    let connect = async {
        let addresses = policy.resolve(&url).await?;
        let stream = TcpStream::connect(addresses.as_slice()).await?;
        let mut handshake = url.as_str().into_client_request()?;
        if !request.protocols.is_empty() {
            handshake.headers_mut().insert(
                "Sec-WebSocket-Protocol",
                request.protocols.join(", ").parse()?,
            );
        }
        let config = WebSocketConfig::default()
            .max_message_size(Some(BODY_LIMIT))
            .max_frame_size(Some(BODY_LIMIT))
            .max_write_buffer_size(SEND_LIMIT);
        let (socket, response) =
            client_async_tls_with_config(handshake, stream, Some(config), None).await?;
        let protocol = response
            .headers()
            .get("sec-websocket-protocol")
            .map(|p| p.to_str())
            .transpose()?
            .unwrap_or("")
            .to_owned();
        ensure!(
            protocol.is_empty() || request.protocols.contains(&protocol),
            "Server selected an unrequested protocol"
        );
        ensure!(
            request.protocols.is_empty() || !protocol.is_empty(),
            "Server did not select a requested protocol"
        );
        Ok::<_, anyhow::Error>((socket, protocol))
    };
    let (mut socket, protocol) = tokio::select! {
        result = timeout(CONNECT_TIMEOUT, connect) => result.context("WebSocket connection timed out")??,
        _ = commands.recv() => bail!("WebSocket closed before connection completed"),
    };
    events
        .send(json!({"type":"ws_open","id":id,"protocol":protocol,"extensions":""}))
        .await;
    let mut close_deadline = None;
    loop {
        tokio::select! {
            command = commands.recv(), if close_deadline.is_none() => match command {
                Some(SocketCommand::Send(message, bytes)) => {
                    timeout(CONNECT_TIMEOUT, socket.send(message)).await.context("WebSocket send timed out")??;
                    events.send(json!({"type":"ws_drain","id":id,"bytes":bytes})).await;
                }
                Some(SocketCommand::Close(frame)) => {
                    timeout(CONNECT_TIMEOUT, socket.send(Message::Close(frame))).await.context("WebSocket close timed out")??;
                    close_deadline = Some(Instant::now() + CONNECT_TIMEOUT);
                }
                None => bail!("WebSocket owner ended"),
            },
            message = socket.next() => match message {
                Some(Ok(Message::Text(text))) => events.send(json!({"type":"ws_message","id":id,"binary":false,"data":text.as_str()})).await,
                Some(Ok(Message::Binary(bytes))) => events.send(json!({"type":"ws_message","id":id,"binary":true,"data":BASE64.encode(bytes)})).await,
                Some(Ok(Message::Ping(_))) => { timeout(CONNECT_TIMEOUT, socket.flush()).await??; },
                Some(Ok(Message::Close(frame))) => {
                    timeout(CONNECT_TIMEOUT, socket.flush()).await??;
                    return Ok(frame.map(|f| (u16::from(f.code), f.reason.to_string(), true)).unwrap_or((1005, String::new(), true)));
                }
                Some(Ok(_)) => {},
                Some(Err(error)) => return Err(error.into()),
                None => bail!("WebSocket disconnected without close handshake"),
            },
            _ = async { if let Some(deadline) = close_deadline { tokio::time::sleep_until(deadline).await; } else { std::future::pending::<()>().await; } } => bail!("WebSocket close handshake timed out"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn request(url: String) -> FetchRequest {
        FetchRequest {
            url,
            method: "GET".into(),
            headers: vec![],
            body: None,
            redirect: "follow".into(),
        }
    }
    fn events() -> Events {
        let (sender, _) = mpsc::channel(32);
        let (wake, _) = std::sync::mpsc::sync_channel(1);
        Events { sender, wake }
    }
    #[tokio::test]
    async fn header_deadline_includes_dns() {
        let mut policy = Policy::new(vec!["https://example.com".into()], false).unwrap();
        policy.resolution_delay = Some(Duration::from_secs(60));
        let (_, pulls) = mpsc::channel(1);
        let result = timeout(
            Duration::from_secs(1),
            fetch_with_deadline(
                &policy,
                request("https://example.com".into()),
                1,
                &events(),
                pulls,
                Instant::now() + Duration::from_millis(20),
            ),
        )
        .await
        .unwrap()
        .unwrap_err();
        assert!(result.to_string().contains("during DNS"));
    }
    #[tokio::test]
    async fn redirects_share_one_header_deadline() {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let origin = format!("http://{}", listener.local_addr().unwrap());
        let server = std::thread::spawn(move || {
            let deadline = std::time::Instant::now() + Duration::from_secs(2);
            let mut count = 0;
            while count < 2 && std::time::Instant::now() < deadline {
                if let Ok((mut socket, _)) = listener.accept() {
                    socket
                        .set_read_timeout(Some(Duration::from_secs(1)))
                        .unwrap();
                    let mut bytes = [0; 4096];
                    let _ = socket.read(&mut bytes);
                    std::thread::sleep(Duration::from_millis(100));
                    let _ = socket.write_all(b"HTTP/1.1 302 Found\r\nLocation: /next\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
                    count += 1;
                } else {
                    std::thread::sleep(Duration::from_millis(1));
                }
            }
            count
        });
        let policy = Policy::new(vec![origin.clone()], true).unwrap();
        let (_, pulls) = mpsc::channel(1);
        let result = fetch_with_deadline(
            &policy,
            request(origin),
            1,
            &events(),
            pulls,
            Instant::now() + Duration::from_millis(170),
        )
        .await
        .unwrap_err();
        assert!(result.to_string().contains("headers timed out"));
        assert_eq!(server.join().unwrap(), 2);
    }
    #[test]
    fn private_and_transition_addresses_are_blocked() {
        for address in [
            "127.0.0.1",
            "10.0.0.1",
            "169.254.169.254",
            "100.64.0.1",
            "192.168.0.1",
            "::1",
            "::ffff:127.0.0.1",
            "fc00::1",
            "fe80::1",
            "2002:7f00:1::1",
            "2001:db8::1",
            "64:ff9b::7f00:1",
        ] {
            assert!(!public_address(address.parse().unwrap()), "{address}");
        }
        for address in ["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"] {
            assert!(public_address(address.parse().unwrap()));
        }
    }
    #[test]
    fn origin_policy_is_exact_and_validated() {
        let policy = Policy::new(vec!["https://EXAMPLE.com:443".into()], false).unwrap();
        assert!(policy.origins.contains("https://example.com"));
        assert!(!policy.origins.contains("http://example.com"));
        assert!(!policy.origins.contains("https://example.com:444"));
        for invalid in [
            "https://example.com/path",
            "https://example.com?x",
            "https://u:p@example.com",
            "file:///tmp/a",
        ] {
            assert!(Policy::new(vec![invalid.into()], false).is_err());
        }
    }

    #[tokio::test]
    async fn public_network_grant_keeps_transport_and_private_address_limits() {
        let policy = Policy::new(vec!["*".into()], false).unwrap();
        assert!(policy
            .resolve(&Url::parse("https://1.1.1.1").unwrap())
            .await
            .is_ok());
        assert!(policy
            .resolve(&Url::parse("wss://1.1.1.1").unwrap())
            .await
            .is_ok());
        for url in [
            "https://127.0.0.1",
            "wss://192.168.1.1",
            "http://1.1.1.1",
            "ws://1.1.1.1",
        ] {
            assert!(
                policy.resolve(&Url::parse(url).unwrap()).await.is_err(),
                "{url}"
            );
        }
        let restricted = Policy::new(vec!["https://example.com".into()], false).unwrap();
        assert!(restricted
            .resolve(&Url::parse("https://1.1.1.1").unwrap())
            .await
            .is_err());
    }
}
