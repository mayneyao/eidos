use std::io::Read as _;
use std::time::{Duration, Instant};

use anyhow::{Context as _, anyhow, bail};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use rand::RngCore as _;
use reqwest::Url;
use reqwest::blocking::{Client, Response};
use serde::Deserialize;
use sha2::{Digest as _, Sha256};

const OAUTH_CLIENT_ID: &str = "cli.eidos.space";
const OAUTH_SCOPES: &str = "openid";
const OAUTH_CALLBACK_PORT: u16 = 13_129;
const OAUTH_CALLBACK_PATH: &str = "/oauth/callback";
const OAUTH_CALLBACK_TIMEOUT: Duration = Duration::from_secs(5 * 60);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const JSON_BYTES_MAX: usize = 64 * 1024;

#[derive(Deserialize)]
struct DiscoveryDocument {
    issuer: String,
    authorization_endpoint: String,
    token_endpoint: String,
    code_challenge_methods_supported: Vec<String>,
    response_types_supported: Vec<String>,
    grant_types_supported: Vec<String>,
}

struct Discovery {
    authorization_endpoint: Url,
    token_endpoint: Url,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    token_type: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClaimResponse {
    protocol: u8,
    public_url: String,
    connector_url: String,
    connector_token: String,
    connector_expires_at: u64,
}

pub fn sign_in_and_claim(
    account_origin: &str,
    relay_origin: &str,
) -> anyhow::Result<qjs_host::relay::RelayConfig> {
    let account_origin = service_origin(account_origin, "Eidos account")?;
    let relay_origin = service_origin(relay_origin, "Eidos Relay")?;
    let client = Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(REQUEST_TIMEOUT)
        .user_agent(concat!("eidos-cli/", env!("CARGO_PKG_VERSION")))
        .build()
        .context("create Eidos account client")?;
    let discovery = discover(&client, &account_origin)?;

    let callback =
        tiny_http::Server::http(("127.0.0.1", OAUTH_CALLBACK_PORT)).map_err(|error| {
            anyhow!("bind Eidos sign-in callback on 127.0.0.1:{OAUTH_CALLBACK_PORT}: {error}")
        })?;
    let redirect_uri = format!("http://127.0.0.1:{OAUTH_CALLBACK_PORT}{OAUTH_CALLBACK_PATH}");
    let state = random_url_token(24);
    let code_verifier = random_url_token(32);
    let code_challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(code_verifier.as_bytes()));
    let mut authorization_url = discovery.authorization_endpoint.clone();
    authorization_url
        .query_pairs_mut()
        .append_pair("client_id", OAUTH_CLIENT_ID)
        .append_pair("redirect_uri", &redirect_uri)
        .append_pair("response_type", "code")
        .append_pair("scope", OAUTH_SCOPES)
        .append_pair("state", &state)
        .append_pair("code_challenge", &code_challenge)
        .append_pair("code_challenge_method", "S256");

    eprintln!("Opening eidos.space to sign in for Eidos Relay…");
    if let Err(error) = open::that(authorization_url.as_str()) {
        eprintln!("Could not open a browser ({error}). Open this URL to continue:");
        eprintln!("{authorization_url}");
    }
    let code = wait_for_code(&callback, &state)?;
    drop(callback);

    let token_response = client
        .post(discovery.token_endpoint)
        .header("Accept", "application/json")
        .form(&[
            ("client_id", OAUTH_CLIENT_ID),
            ("grant_type", "authorization_code"),
            ("code", code.as_str()),
            ("redirect_uri", redirect_uri.as_str()),
            ("code_verifier", code_verifier.as_str()),
        ])
        .send()
        .context("exchange the Eidos authorization code")?;
    let tokens: TokenResponse = response_json(token_response, "Eidos token exchange")?;
    if tokens.access_token.is_empty()
        || tokens.access_token.len() > 8 * 1024
        || !tokens
            .token_type
            .as_deref()
            .unwrap_or("Bearer")
            .eq_ignore_ascii_case("Bearer")
    {
        bail!("the Eidos account service returned an invalid access token");
    }

    let claim_endpoint = relay_origin
        .join("/v1/tunnels")
        .context("build the Eidos Relay claim endpoint")?;
    let claim_response = client
        .post(claim_endpoint)
        .header("Accept", "application/json")
        .bearer_auth(&tokens.access_token)
        .send()
        .context("claim the Eidos Relay endpoint")?;
    let claim: ClaimResponse = response_json(claim_response, "Eidos Relay claim")?;
    validate_claim(claim, &relay_origin)
}

fn service_origin(value: &str, label: &str) -> anyhow::Result<Url> {
    let url = Url::parse(value).with_context(|| format!("parse {label} origin"))?;
    if url.scheme() != "https"
        || url.username() != ""
        || url.password().is_some()
        || url.host_str().is_none()
        || url.path() != "/"
        || url.query().is_some()
        || url.fragment().is_some()
    {
        bail!("{label} origin must be an HTTPS origin without a path");
    }
    Ok(url)
}

fn discover(client: &Client, account_origin: &Url) -> anyhow::Result<Discovery> {
    let endpoint = account_origin
        .join("/api/auth/.well-known/openid-configuration")
        .context("build the Eidos discovery endpoint")?;
    let response = client
        .get(endpoint)
        .header("Accept", "application/json")
        .send()
        .context("load Eidos OAuth discovery")?;
    let metadata: DiscoveryDocument = response_json(response, "Eidos OAuth discovery")?;
    if metadata.issuer != account_origin.origin().ascii_serialization()
        || !metadata
            .code_challenge_methods_supported
            .iter()
            .any(|value| value == "S256")
        || !metadata
            .response_types_supported
            .iter()
            .any(|value| value == "code")
        || !metadata
            .grant_types_supported
            .iter()
            .any(|value| value == "authorization_code")
    {
        bail!("the Eidos account service does not advertise the required PKCE flow");
    }
    Ok(Discovery {
        authorization_endpoint: exact_endpoint(
            &metadata.authorization_endpoint,
            account_origin,
            "/api/auth/oauth2/authorize",
        )?,
        token_endpoint: exact_endpoint(
            &metadata.token_endpoint,
            account_origin,
            "/api/auth/oauth2/token",
        )?,
    })
}

fn exact_endpoint(value: &str, origin: &Url, path: &str) -> anyhow::Result<Url> {
    let endpoint = Url::parse(value).context("parse an Eidos OAuth endpoint")?;
    if endpoint.origin() != origin.origin()
        || endpoint.path() != path
        || endpoint.query().is_some()
        || endpoint.fragment().is_some()
    {
        bail!("the Eidos account service returned untrusted discovery metadata");
    }
    Ok(endpoint)
}

fn wait_for_code(server: &tiny_http::Server, expected_state: &str) -> anyhow::Result<String> {
    let deadline = Instant::now() + OAUTH_CALLBACK_TIMEOUT;
    loop {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            bail!("Eidos account sign-in timed out");
        }
        let Some(request) = server
            .recv_timeout(remaining)
            .context("wait for the Eidos sign-in callback")?
        else {
            bail!("Eidos account sign-in timed out");
        };
        let trusted_host = request
            .headers()
            .iter()
            .find(|header| header.field.equiv("Host"))
            .is_some_and(|header| {
                header.value.as_str() == format!("127.0.0.1:{OAUTH_CALLBACK_PORT}")
            });
        if request.method() != &tiny_http::Method::Get || !trusted_host {
            respond_text(request, 400, "Invalid OAuth callback");
            continue;
        }
        let callback = match Url::parse(&format!("http://127.0.0.1{}", request.url())) {
            Ok(callback) => callback,
            Err(_) => {
                respond_text(request, 400, "Invalid OAuth callback");
                continue;
            }
        };
        if callback.path() != OAUTH_CALLBACK_PATH {
            respond_text(request, 404, "Not found");
            continue;
        }
        let parameters: std::collections::HashMap<_, _> =
            callback.query_pairs().into_owned().collect();
        if parameters.get("state").map(String::as_str) != Some(expected_state) {
            respond_text(request, 400, "Invalid OAuth state");
            continue;
        }
        if let Some(error) = parameters.get("error") {
            respond_text(
                request,
                400,
                "Eidos CLI sign-in was not completed. You can close this tab.",
            );
            bail!("Eidos account sign-in failed: {error}");
        }
        let Some(code) = parameters.get("code").filter(|value| !value.is_empty()) else {
            respond_text(request, 400, "Missing OAuth code");
            continue;
        };
        let code = code.clone();
        let html = "<!doctype html><meta charset=utf-8><title>Eidos CLI</title>\
                    <p>Signed in to Eidos CLI. You can close this tab.</p>";
        let response = tiny_http::Response::from_string(html)
            .with_status_code(200)
            .with_header(
                "Content-Type: text/html; charset=utf-8"
                    .parse::<tiny_http::Header>()
                    .expect("static response header"),
            );
        let _ = request.respond(response);
        return Ok(code);
    }
}

fn respond_text(request: tiny_http::Request, status: u16, message: &str) {
    let response = tiny_http::Response::from_string(message)
        .with_status_code(status)
        .with_header(
            "Content-Type: text/plain; charset=utf-8"
                .parse::<tiny_http::Header>()
                .expect("static response header"),
        );
    let _ = request.respond(response);
}

fn response_json<T: for<'de> Deserialize<'de>>(
    mut response: Response,
    label: &str,
) -> anyhow::Result<T> {
    let status = response.status();
    if response
        .content_length()
        .is_some_and(|length| length > JSON_BYTES_MAX as u64)
    {
        bail!("{label} returned an oversized response");
    }
    let mut bytes = Vec::with_capacity(JSON_BYTES_MAX.min(8 * 1024));
    response
        .by_ref()
        .take(JSON_BYTES_MAX as u64 + 1)
        .read_to_end(&mut bytes)
        .with_context(|| format!("read {label} response"))?;
    if !status.is_success() {
        bail!("{label} failed with HTTP {status}");
    }
    if bytes.len() > JSON_BYTES_MAX {
        bail!("{label} returned an oversized response");
    }
    serde_json::from_slice(&bytes).with_context(|| format!("parse {label} response"))
}

fn validate_claim(
    claim: ClaimResponse,
    relay_origin: &Url,
) -> anyhow::Result<qjs_host::relay::RelayConfig> {
    if claim.protocol != qjs_host::relay::RELAY_PROTOCOL_VERSION
        || claim.connector_token.is_empty()
        || claim.connector_token.len() > 8 * 1024
        || claim.connector_expires_at <= now_millis()
    {
        bail!("the Eidos Relay service returned an invalid claim");
    }
    let public_url = Url::parse(&claim.public_url).context("parse the Eidos Relay public URL")?;
    let public_host = public_url.host_str().unwrap_or("");
    let public_label = public_host.split('.').next().unwrap_or("");
    let expected_label_suffix = if relay_origin.host_str() == Some("relay-staging.eidos.ink") {
        "-staging"
    } else {
        ""
    };
    let public_slug = public_label
        .strip_suffix(expected_label_suffix)
        .unwrap_or("");
    let access = public_url
        .fragment()
        .and_then(|fragment| fragment.strip_prefix("access="));
    if public_url.scheme() != "https"
        || public_url.username() != ""
        || public_url.password().is_some()
        || public_url.path() != "/"
        || public_url.query().is_some()
        || public_host != format!("{public_label}.eidos.ink")
        || public_slug.len() != 22
        || !public_slug.starts_with("u-")
        || !public_slug[2..]
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit())
        || access.is_none_or(str::is_empty)
    {
        bail!("the Eidos Relay service returned an invalid public URL");
    }
    let connector_url =
        Url::parse(&claim.connector_url).context("parse the Eidos Relay connector URL")?;
    let mut connector_origin = connector_url.clone();
    connector_origin
        .set_scheme("https")
        .map_err(|()| anyhow!("invalid Eidos Relay connector scheme"))?;
    connector_origin.set_path("/");
    connector_origin.set_query(None);
    connector_origin.set_fragment(None);
    if connector_url.scheme() != "wss"
        || connector_url.username() != ""
        || connector_url.password().is_some()
        || connector_url.query().is_some()
        || connector_url.fragment().is_some()
        || connector_origin.origin() != relay_origin.origin()
        || !connector_url.path().starts_with("/v1/connect/u-")
    {
        bail!("the Eidos Relay service returned an invalid connector URL");
    }
    Ok(qjs_host::relay::RelayConfig {
        public_url: claim.public_url,
        connector_url: claim.connector_url,
        connector_token: claim.connector_token,
    })
}

fn random_url_token(length: usize) -> String {
    let mut bytes = vec![0_u8; length];
    rand::thread_rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

fn now_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .try_into()
        .unwrap_or(u64::MAX)
}

#[cfg(test)]
mod tests {
    use super::{ClaimResponse, now_millis, service_origin, validate_claim};

    #[test]
    fn accepts_only_exact_https_service_origins() {
        assert!(service_origin("https://eidos.space", "account").is_ok());
        assert!(service_origin("http://eidos.space", "account").is_err());
        assert!(service_origin("https://eidos.space/path", "account").is_err());
        assert!(service_origin("https://user@eidos.space", "account").is_err());
    }

    #[test]
    fn validates_relay_claim_origins_and_secret_placement() {
        let relay = service_origin("https://relay.eidos.ink", "relay").unwrap();
        let config = validate_claim(
            ClaimResponse {
                protocol: 1,
                public_url: "https://u-0123456789abcdefabcd.eidos.ink/#access=browser-secret"
                    .to_string(),
                connector_url: "wss://relay.eidos.ink/v1/connect/u-0123456789abcdefabcd"
                    .to_string(),
                connector_token: "connector-secret".to_string(),
                connector_expires_at: now_millis() + 60_000,
            },
            &relay,
        )
        .unwrap();
        assert!(config.public_url.ends_with("#access=browser-secret"));
        assert!(!config.connector_url.contains("connector-secret"));

        assert!(
            validate_claim(
                ClaimResponse {
                    protocol: 1,
                    public_url: "https://u-0123456789abcdefabcd.eidos.ink/#access=browser-secret"
                        .to_string(),
                    connector_url: "wss://attacker.example/v1/connect/u-0123456789abcdefabcd"
                        .to_string(),
                    connector_token: "connector-secret".to_string(),
                    connector_expires_at: now_millis() + 60_000,
                },
                &relay,
            )
            .is_err()
        );

        let staging = service_origin("https://relay-staging.eidos.ink", "relay").unwrap();
        assert!(
            validate_claim(
                ClaimResponse {
                    protocol: 1,
                    public_url:
                        "https://u-0123456789abcdefabcd-staging.eidos.ink/#access=browser-secret"
                            .to_string(),
                    connector_url:
                        "wss://relay-staging.eidos.ink/v1/connect/u-0123456789abcdefabcd"
                            .to_string(),
                    connector_token: "connector-secret".to_string(),
                    connector_expires_at: now_millis() + 60_000,
                },
                &staging,
            )
            .is_ok()
        );
    }
}
