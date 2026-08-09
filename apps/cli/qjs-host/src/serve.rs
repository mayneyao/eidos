use std::io::Read;
use std::path::{Path, PathBuf};
use std::rc::Rc;

use anyhow::anyhow;
use base64::{engine::general_purpose::STANDARD as B64, Engine};

use crate::{open_host_state, QjsHost, ACTIVE_CTX};

// Runtime calls can carry a base64-encoded CSV. Keep the HTTP boundary
// bounded while still allowing the runtime's 256 MiB file/export ceiling plus
// base64 and JSON overhead.
const MAX_JSON_BODY_BYTES: u64 = 384 * 1024 * 1024;

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

fn allowed_host(value: &str, port: u16) -> bool {
    value.eq_ignore_ascii_case(&format!("127.0.0.1:{port}"))
        || value.eq_ignore_ascii_case(&format!("localhost:{port}"))
}

fn allowed_origin(value: &str) -> bool {
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

fn trusted_api_request(request: &tiny_http::Request, port: u16) -> bool {
    let Some(host) = header_value(request, "Host") else {
        return false;
    };
    if !allowed_host(host, port) {
        return false;
    }
    header_value(request, "Origin").is_none_or(allowed_origin)
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
) -> anyhow::Result<()> {
    let file_name = db_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("file.eidos")
        .to_string();
    let state = Rc::new(open_host_state(db_path)?);
    let host = QjsHost::new(&state)?;

    let server = tiny_http::Server::http(("127.0.0.1", port))
        .map_err(|error| anyhow!("bind 127.0.0.1:{port}: {error}"))?;
    let url = format!("http://127.0.0.1:{port}");
    println!("eidos serve {file_name}");
    println!("  url: {url}");
    if let Some(dir) = &ui_dir {
        println!("  ui:  {}", dir.display());
    } else {
        println!("  ui:  (embedded)");
    }
    if open_browser {
        let _ = open::that(&url);
    }

    for mut request in server.incoming_requests() {
        let method = request.method().to_string();
        let url_path = request.url().split('?').next().unwrap_or("/").to_string();
        let response = if url_path.starts_with("/api/") && !trusted_api_request(&request, port) {
            error_response(403, "API requests require a loopback Host and Origin")
        } else {
            match (method.as_str(), url_path.as_str()) {
                ("GET", "/api/manifest") => json_response(
                    &serde_json::json!({
                        "mode": "cli",
                        "fileName": file_name,
                        "access": "readwrite",
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
                        match host.invoke("call", &[method, request_json, context_json]) {
                            Ok(result) => json_response(&result),
                            Err(error) => error_response(500, &error.to_string()),
                        }
                    }
                    Err((status, message)) => error_response(status, &message),
                },
                ("POST", "/api/runtime/close") => match host.invoke("close", &[]) {
                    Ok(result) => json_response(&result),
                    Err(error) => error_response(500, &error.to_string()),
                },
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
            }
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
    use super::{allowed_host, allowed_origin, EmbeddedUi};

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
        assert!(allowed_host("127.0.0.1:8420", 8420));
        assert!(allowed_host("LOCALHOST:8420", 8420));
        assert!(!allowed_host("127.0.0.1:8421", 8420));
        assert!(!allowed_host("eidos.example:8420", 8420));
        assert!(!allowed_host("127.0.0.1:8420.eidos.example", 8420));
    }

    #[test]
    fn accepts_only_http_loopback_origins() {
        assert!(allowed_origin("http://127.0.0.1:8420"));
        assert!(allowed_origin("http://localhost:5173"));
        assert!(!allowed_origin("https://127.0.0.1:8420"));
        assert!(!allowed_origin("http://eidos.example:8420"));
        assert!(!allowed_origin("http://localhost:8420/path"));
        assert!(!allowed_origin("null"));
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
