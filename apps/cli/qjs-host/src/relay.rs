use std::collections::HashMap;
use std::sync::mpsc as std_mpsc;
use std::thread;
use std::time::Duration;

use anyhow::{anyhow, bail, Context as _};
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use futures_util::{SinkExt as _, StreamExt as _};
use reqwest::header::{HeaderName, HeaderValue};
use serde::Deserialize;
use tokio::sync::mpsc;
use tokio::task::JoinHandle;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::client::IntoClientRequest as _;
use tokio_tungstenite::tungstenite::http::header::AUTHORIZATION;
use tokio_tungstenite::tungstenite::Message;

pub const RELAY_PROTOCOL_VERSION: u8 = 1;
const REQUEST_BYTES_MAX: usize = 4 * 1024 * 1024;
const RESPONSE_CHUNK_BYTES_MAX: usize = 128 * 1024;
const CONCURRENT_REQUESTS_MAX: usize = 32;
const START_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RelayBrowserAccess {
    Account,
    Share,
}

pub struct RelayConfig {
    pub browser_access: RelayBrowserAccess,
    pub public_url: String,
    pub connector_url: String,
    pub connector_token: String,
}

pub struct RelayConnector {
    _thread: thread::JoinHandle<()>,
}

#[derive(Deserialize)]
#[serde(tag = "type")]
enum RelayInbound {
    #[serde(rename = "request")]
    Request {
        v: u8,
        id: String,
        method: String,
        path: String,
        headers: Vec<(String, String)>,
        body: Option<String>,
    },
    #[serde(rename = "request.cancel")]
    Cancel { v: u8, id: String },
}

struct LocalRequest {
    id: String,
    method: reqwest::Method,
    path: String,
    headers: Vec<(HeaderName, HeaderValue)>,
    body: Option<Vec<u8>>,
}

impl RelayConnector {
    pub fn start(config: RelayConfig, local_port: u16) -> anyhow::Result<Self> {
        let (ready_tx, ready_rx) = std_mpsc::sync_channel(1);
        let connector_thread = thread::Builder::new()
            .name("eidos-relay".to_string())
            .spawn(move || {
                let runtime = match tokio::runtime::Builder::new_multi_thread()
                    .worker_threads(2)
                    .enable_all()
                    .build()
                {
                    Ok(runtime) => runtime,
                    Err(error) => {
                        let _ =
                            ready_tx.send(Err(format!("start Eidos Relay async runtime: {error}")));
                        return;
                    }
                };
                let result = runtime.block_on(run_connector(&config, local_port, &ready_tx));
                if let Err(error) = result {
                    if ready_tx.send(Err(error.to_string())).is_err() {
                        eprintln!("Eidos Relay disconnected: {error}");
                    }
                }
            })
            .context("start the Eidos Relay connector thread")?;
        match ready_rx.recv_timeout(START_TIMEOUT) {
            Ok(Ok(())) => Ok(Self {
                _thread: connector_thread,
            }),
            Ok(Err(message)) => Err(anyhow!(message)),
            Err(std_mpsc::RecvTimeoutError::Timeout) => {
                Err(anyhow!("connecting to Eidos Relay timed out"))
            }
            Err(std_mpsc::RecvTimeoutError::Disconnected) => {
                Err(anyhow!("the Eidos Relay connector stopped during startup"))
            }
        }
    }
}

async fn run_connector(
    config: &RelayConfig,
    local_port: u16,
    ready: &std_mpsc::SyncSender<Result<(), String>>,
) -> anyhow::Result<()> {
    let mut websocket_request = config
        .connector_url
        .as_str()
        .into_client_request()
        .context("build the Eidos Relay WebSocket request")?;
    websocket_request.headers_mut().insert(
        AUTHORIZATION,
        format!("Bearer {}", config.connector_token)
            .parse()
            .context("encode the Eidos Relay connector credential")?,
    );
    let (websocket, _) = connect_async(websocket_request)
        .await
        .context("connect to Eidos Relay")?;
    let (mut websocket_writer, mut websocket_reader) = websocket.split();
    let (outgoing_tx, mut outgoing_rx) = mpsc::channel::<Message>(64);
    let writer = tokio::spawn(async move {
        while let Some(message) = outgoing_rx.recv().await {
            websocket_writer
                .send(message)
                .await
                .context("write to Eidos Relay")?;
        }
        anyhow::Ok(())
    });
    ready
        .send(Ok(()))
        .map_err(|_| anyhow!("the Eidos Relay startup receiver closed"))?;

    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .context("create the loopback Relay client")?;
    let (completed_tx, mut completed_rx) = mpsc::channel::<String>(64);
    let mut active: HashMap<String, JoinHandle<()>> = HashMap::new();

    loop {
        tokio::select! {
            completed = completed_rx.recv() => {
                if let Some(id) = completed {
                    active.remove(&id);
                }
            }
            incoming = websocket_reader.next() => {
                let Some(incoming) = incoming else { break };
                match incoming.context("read from Eidos Relay")? {
                    Message::Text(text) => {
                        let message: RelayInbound = serde_json::from_str(text.as_ref())
                            .context("parse an Eidos Relay message")?;
                        match message {
                            RelayInbound::Cancel { v, id } => {
                                validate_envelope(v, &id)?;
                                if let Some(task) = active.remove(&id) {
                                    task.abort();
                                }
                            }
                            RelayInbound::Request { v, id, method, path, headers, body } => {
                                validate_envelope(v, &id)?;
                                if active.len() >= CONCURRENT_REQUESTS_MAX || active.contains_key(&id) {
                                    send_error(&outgoing_tx, &id).await?;
                                    continue;
                                }
                                let request = match validate_request(id.clone(), method, path, headers, body) {
                                    Ok(request) => request,
                                    Err(_) => {
                                        send_error(&outgoing_tx, &id).await?;
                                        continue;
                                    }
                                };
                                let client = client.clone();
                                let outgoing = outgoing_tx.clone();
                                let completed = completed_tx.clone();
                                let completed_id = id.clone();
                                let task = tokio::spawn(async move {
                                    if forward_request(&client, local_port, request, &outgoing)
                                        .await
                                        .is_err()
                                    {
                                        let _ = send_error(&outgoing, &completed_id).await;
                                    }
                                    let _ = completed.send(completed_id).await;
                                });
                                active.insert(id, task);
                            }
                        }
                    }
                    Message::Ping(value) => {
                        outgoing_tx.send(Message::Pong(value)).await
                            .map_err(|_| anyhow!("the Eidos Relay writer stopped"))?;
                    }
                    Message::Close(_) => break,
                    Message::Pong(_) | Message::Frame(_) => {}
                    Message::Binary(_) => bail!("Eidos Relay sent an unexpected binary message"),
                }
            }
        }
    }

    for (_, task) in active {
        task.abort();
    }
    drop(outgoing_tx);
    writer.await.context("join the Eidos Relay writer")??;
    bail!("the Eidos Relay WebSocket closed")
}

fn validate_envelope(version: u8, id: &str) -> anyhow::Result<()> {
    if version != RELAY_PROTOCOL_VERSION || !valid_request_id(id) {
        bail!("invalid Eidos Relay message envelope");
    }
    Ok(())
}

fn valid_request_id(id: &str) -> bool {
    id.len() == 36
        && id.bytes().enumerate().all(|(index, byte)| {
            if matches!(index, 8 | 13 | 18 | 23) {
                byte == b'-'
            } else {
                byte.is_ascii_hexdigit()
            }
        })
}

fn validate_request(
    id: String,
    method: String,
    path: String,
    headers: Vec<(String, String)>,
    body: Option<String>,
) -> anyhow::Result<LocalRequest> {
    let method = reqwest::Method::from_bytes(method.as_bytes()).context("invalid Relay method")?;
    if matches!(method, reqwest::Method::CONNECT | reqwest::Method::TRACE)
        || !path.starts_with('/')
        || path.len() > 8 * 1024
        || path.bytes().any(|byte| byte.is_ascii_control())
        || headers.len() > 32
    {
        bail!("invalid Relay request");
    }
    let mut parsed_headers = Vec::with_capacity(headers.len() + 1);
    for (name, value) in headers {
        let lower = name.to_ascii_lowercase();
        if !matches!(
            lower.as_str(),
            "accept"
                | "accept-language"
                | "cache-control"
                | "content-type"
                | "if-modified-since"
                | "if-none-match"
                | "x-eidos-client-id"
        ) || name.len() > 128
            || value.len() > 8 * 1024
        {
            bail!("invalid Relay request header");
        }
        parsed_headers.push((
            HeaderName::from_bytes(name.as_bytes()).context("invalid Relay header name")?,
            HeaderValue::from_str(&value).context("invalid Relay header value")?,
        ));
    }
    parsed_headers.push((
        HeaderName::from_static("x-eidos-relay"),
        HeaderValue::from_static("1"),
    ));
    let body = match body {
        Some(body) => {
            let decoded = B64.decode(body).context("invalid Relay request body")?;
            if decoded.len() > REQUEST_BYTES_MAX {
                bail!("Relay request body is too large");
            }
            Some(decoded)
        }
        None => None,
    };
    Ok(LocalRequest {
        id,
        method,
        path,
        headers: parsed_headers,
        body,
    })
}

async fn forward_request(
    client: &reqwest::Client,
    local_port: u16,
    request: LocalRequest,
    outgoing: &mpsc::Sender<Message>,
) -> anyhow::Result<()> {
    let endpoint = format!("http://127.0.0.1:{local_port}{}", request.path);
    let mut builder = client.request(request.method, endpoint);
    for (name, value) in request.headers {
        builder = builder.header(name, value);
    }
    if let Some(body) = request.body {
        builder = builder.body(body);
    }
    let response = builder
        .send()
        .await
        .context("request loopback Eidos Serve")?;
    let status = response.status().as_u16();
    let headers = forwarded_response_headers(response.headers());
    send_json(
        outgoing,
        serde_json::json!({
            "v": RELAY_PROTOCOL_VERSION,
            "type": "response.start",
            "id": request.id,
            "status": status,
            "headers": headers,
        }),
    )
    .await?;
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.context("read loopback Eidos Serve response")?;
        for part in chunk.chunks(RESPONSE_CHUNK_BYTES_MAX) {
            send_json(
                outgoing,
                serde_json::json!({
                    "v": RELAY_PROTOCOL_VERSION,
                    "type": "response.body",
                    "id": request.id,
                    "body": B64.encode(part),
                }),
            )
            .await?;
        }
    }
    send_json(
        outgoing,
        serde_json::json!({
            "v": RELAY_PROTOCOL_VERSION,
            "type": "response.end",
            "id": request.id,
        }),
    )
    .await
}

fn forwarded_response_headers(headers: &reqwest::header::HeaderMap) -> Vec<(String, String)> {
    headers
        .iter()
        .filter_map(|(name, value)| {
            matches!(
                name.as_str(),
                "cache-control"
                    | "content-disposition"
                    | "content-type"
                    | "etag"
                    | "last-modified"
                    | "x-content-type-options"
            )
            .then(|| {
                value
                    .to_str()
                    .ok()
                    .map(|value| (name.as_str().to_string(), value.to_string()))
            })
            .flatten()
        })
        .collect()
}

async fn send_error(outgoing: &mpsc::Sender<Message>, id: &str) -> anyhow::Result<()> {
    send_json(
        outgoing,
        serde_json::json!({
            "v": RELAY_PROTOCOL_VERSION,
            "type": "response.error",
            "id": id,
            "message": "The local Eidos Serve request failed",
        }),
    )
    .await
}

async fn send_json(
    outgoing: &mpsc::Sender<Message>,
    value: serde_json::Value,
) -> anyhow::Result<()> {
    outgoing
        .send(Message::Text(value.to_string().into()))
        .await
        .map_err(|_| anyhow!("the Eidos Relay writer stopped"))
}

#[cfg(test)]
mod tests {
    use std::thread;

    use tokio::sync::mpsc;
    use tokio_tungstenite::tungstenite::Message;

    use super::{forward_request, validate_request, RelayInbound, RELAY_PROTOCOL_VERSION};

    #[test]
    fn validates_the_bounded_relay_request_contract() {
        let message: RelayInbound = serde_json::from_str(
            r#"{"v":1,"type":"request","id":"01900000-0000-7000-8000-000000000000","method":"GET","path":"/api/manifest","headers":[["x-eidos-client-id","tab-1"]]}"#,
        )
        .unwrap();
        let RelayInbound::Request {
            v,
            id,
            method,
            path,
            headers,
            body,
        } = message
        else {
            panic!("expected request")
        };
        assert_eq!(v, RELAY_PROTOCOL_VERSION);
        assert!(validate_request(id, method, path, headers, body).is_ok());
    }

    #[test]
    fn rejects_credentials_and_oversized_bodies_from_the_edge() {
        let id = "01900000-0000-7000-8000-000000000000".to_string();
        assert!(validate_request(
            id.clone(),
            "GET".to_string(),
            "/".to_string(),
            vec![("authorization".to_string(), "Bearer secret".to_string())],
            None,
        )
        .is_err());
        assert!(validate_request(
            id,
            "POST".to_string(),
            "/api/runtime/call".to_string(),
            Vec::new(),
            Some(base64::Engine::encode(
                &base64::engine::general_purpose::STANDARD,
                vec![0_u8; 4 * 1024 * 1024 + 1],
            )),
        )
        .is_err());
    }

    #[test]
    fn forwards_requests_to_the_loopback_serve_origin() {
        let server = tiny_http::Server::http(("127.0.0.1", 0)).unwrap();
        let port = server.server_addr().to_ip().unwrap().port();
        let origin = thread::spawn(move || {
            let mut request = server.recv().unwrap();
            assert_eq!(request.url(), "/api/runtime/call");
            assert_eq!(
                request
                    .headers()
                    .iter()
                    .find(|header| header.field.equiv("X-Eidos-Relay"))
                    .map(|header| header.value.as_str()),
                Some("1")
            );
            let mut body = String::new();
            request.as_reader().read_to_string(&mut body).unwrap();
            assert_eq!(body, "{\"method\":\"queryRows\"}");
            request
                .respond(
                    tiny_http::Response::from_string("{\"ok\":true}").with_header(
                        "Content-Type: application/json"
                            .parse::<tiny_http::Header>()
                            .unwrap(),
                    ),
                )
                .unwrap();
        });
        let request = validate_request(
            "01900000-0000-7000-8000-000000000000".to_string(),
            "POST".to_string(),
            "/api/runtime/call".to_string(),
            vec![("content-type".to_string(), "application/json".to_string())],
            Some(base64::Engine::encode(
                &base64::engine::general_purpose::STANDARD,
                br#"{"method":"queryRows"}"#,
            )),
        )
        .unwrap();
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let (outgoing, mut messages) = mpsc::channel(8);
        runtime
            .block_on(forward_request(
                &reqwest::Client::new(),
                port,
                request,
                &outgoing,
            ))
            .unwrap();
        drop(outgoing);
        let messages: Vec<serde_json::Value> = runtime.block_on(async move {
            let mut values = Vec::new();
            while let Some(message) = messages.recv().await {
                let Message::Text(text) = message else {
                    panic!("expected text Relay message")
                };
                values.push(serde_json::from_str(text.as_ref()).unwrap());
            }
            values
        });
        assert_eq!(messages.len(), 3);
        assert_eq!(messages[0]["type"], "response.start");
        assert_eq!(messages[0]["status"], 200);
        assert_eq!(messages[1]["type"], "response.body");
        assert_eq!(messages[2]["type"], "response.end");
        origin.join().unwrap();
    }
}
