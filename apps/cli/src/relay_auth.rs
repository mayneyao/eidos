use std::fs::{self, File, OpenOptions};
use std::io::{Read as _, Write as _};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use anyhow::{Context as _, anyhow, bail};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use rand::RngCore as _;
use reqwest::Url;
use reqwest::blocking::{Client, Response};
use serde::{Deserialize, Serialize};
use sha2::{Digest as _, Sha256};

const OAUTH_CLIENT_ID: &str = "cli.eidos.space";
const OAUTH_EPHEMERAL_SCOPES: &str = "openid";
const OAUTH_PERSISTENT_SCOPES: &str = "openid offline_access";
const OAUTH_CALLBACK_PORT: u16 = 13_129;
const OAUTH_CALLBACK_PATH: &str = "/oauth/callback";
const OAUTH_CALLBACK_TIMEOUT: Duration = Duration::from_secs(5 * 60);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const JSON_BYTES_MAX: usize = 64 * 1024;
const ACCESS_TOKEN_EXPIRY_SKEW_SECONDS: u64 = 60;
const STORED_CREDENTIAL_VERSION: u8 = 1;

#[derive(Deserialize)]
struct DiscoveryDocument {
    issuer: String,
    authorization_endpoint: String,
    token_endpoint: String,
    userinfo_endpoint: String,
    code_challenge_methods_supported: Vec<String>,
    response_types_supported: Vec<String>,
    grant_types_supported: Vec<String>,
    scopes_supported: Vec<String>,
}

struct Discovery {
    issuer: String,
    authorization_endpoint: Url,
    token_endpoint: Url,
    userinfo_endpoint: Url,
    supports_refresh: bool,
    supports_offline_access: bool,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: Option<u64>,
    token_type: Option<String>,
}

#[derive(Debug, Deserialize)]
struct UserInfoResponse {
    sub: String,
}

#[derive(Debug, PartialEq, Eq, Serialize, Deserialize)]
struct StoredCredential {
    version: u8,
    issuer: String,
    access_token: String,
    refresh_token: String,
    access_token_expires_at: u64,
}

#[derive(Debug)]
pub struct AccountIdentity {
    pub issuer: String,
    pub subject: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClaimResponse {
    protocol: u8,
    browser_access: String,
    public_url: String,
    connector_url: String,
    connector_token: String,
    connector_expires_at: u64,
}

pub fn sign_in_and_claim(
    account_origin: &str,
    relay_origin: &str,
    share: bool,
) -> anyhow::Result<qjs_host::relay::RelayConfig> {
    let account_origin = service_origin(account_origin, "Eidos account")?;
    let relay_origin = service_origin(relay_origin, "Eidos Relay")?;
    let client = oauth_client()?;
    let discovery = discover(&client, &account_origin)?;
    let access_token = match load_credential(&account_origin)? {
        Some(credential) => access_token(&client, &discovery, &account_origin, credential)?,
        None => {
            eprintln!("Tip: run `eidos login` once to reuse your Eidos account session.");
            authorize(&client, &discovery, OAUTH_EPHEMERAL_SCOPES)?.access_token
        }
    };
    claim_tunnel(&client, &relay_origin, &access_token, share)
}

pub fn login_account(account_origin: &str) -> anyhow::Result<AccountIdentity> {
    let account_origin = service_origin(account_origin, "Eidos account")?;
    let client = oauth_client()?;
    let discovery = discover(&client, &account_origin)?;
    if !discovery.supports_refresh || !discovery.supports_offline_access {
        bail!("the Eidos account service does not support renewable CLI sessions");
    }
    let tokens = authorize(&client, &discovery, OAUTH_PERSISTENT_SCOPES)?;
    let refresh_token = tokens
        .refresh_token
        .filter(|token| valid_token(token))
        .ok_or_else(|| anyhow!("the Eidos account service did not issue a refresh token"))?;
    let credential = StoredCredential {
        version: STORED_CREDENTIAL_VERSION,
        issuer: discovery.issuer.clone(),
        access_token: tokens.access_token,
        refresh_token,
        access_token_expires_at: token_expiry(tokens.expires_in),
    };
    let identity = userinfo(&client, &discovery, &credential.access_token)?;
    store_credential(&account_origin, &credential)?;
    Ok(identity)
}

pub fn whoami_account(account_origin: &str) -> anyhow::Result<AccountIdentity> {
    let account_origin = service_origin(account_origin, "Eidos account")?;
    let client = oauth_client()?;
    let discovery = discover(&client, &account_origin)?;
    let credential = load_credential(&account_origin)?
        .ok_or_else(|| anyhow!("Eidos CLI is not logged in; run `eidos login` to continue"))?;
    let access_token = access_token(&client, &discovery, &account_origin, credential)?;
    userinfo(&client, &discovery, &access_token)
}

pub fn logout_account(account_origin: &str) -> anyhow::Result<bool> {
    let account_origin = service_origin(account_origin, "Eidos account")?;
    delete_credential(&account_origin)
}

fn oauth_client() -> anyhow::Result<Client> {
    Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(REQUEST_TIMEOUT)
        .user_agent(concat!("eidos-cli/", env!("CARGO_PKG_VERSION")))
        .build()
        .context("create Eidos account client")
}

fn authorize(
    client: &Client,
    discovery: &Discovery,
    scopes: &str,
) -> anyhow::Result<TokenResponse> {
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
        .append_pair("scope", scopes)
        .append_pair("state", &state)
        .append_pair("code_challenge", &code_challenge)
        .append_pair("code_challenge_method", "S256");

    eprintln!("Opening {} to sign in to Eidos CLI…", discovery.issuer);
    if let Err(error) = open::that(authorization_url.as_str()) {
        eprintln!("Could not open a browser ({error}). Open this URL to continue:");
        eprintln!("{authorization_url}");
    }
    let code = wait_for_code(&callback, &state)?;
    drop(callback);

    let token_response = client
        .post(discovery.token_endpoint.clone())
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
    validate_tokens(&tokens)?;
    Ok(tokens)
}

fn claim_tunnel(
    client: &Client,
    relay_origin: &Url,
    access_token: &str,
    share: bool,
) -> anyhow::Result<qjs_host::relay::RelayConfig> {
    let claim_endpoint = relay_origin
        .join("/v1/tunnels")
        .context("build the Eidos Relay claim endpoint")?;
    let claim_response = client
        .post(claim_endpoint)
        .header("Accept", "application/json")
        .bearer_auth(access_token)
        .json(&serde_json::json!({
            "browserAccess": if share { "share" } else { "account" },
        }))
        .send()
        .context("claim the Eidos Relay endpoint")?;
    let claim: ClaimResponse = response_json(claim_response, "Eidos Relay claim")?;
    validate_claim(claim, relay_origin, share)
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
    let supports_refresh = metadata
        .grant_types_supported
        .iter()
        .any(|value| value == "refresh_token");
    let supports_offline_access = metadata
        .scopes_supported
        .iter()
        .any(|value| value == "offline_access");
    Ok(Discovery {
        issuer: metadata.issuer,
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
        userinfo_endpoint: exact_endpoint(
            &metadata.userinfo_endpoint,
            account_origin,
            "/api/auth/oauth2/userinfo",
        )?,
        supports_refresh,
        supports_offline_access,
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

fn validate_tokens(tokens: &TokenResponse) -> anyhow::Result<()> {
    if !valid_token(&tokens.access_token)
        || tokens
            .refresh_token
            .as_deref()
            .is_some_and(|token| !valid_token(token))
        || !tokens
            .token_type
            .as_deref()
            .unwrap_or("Bearer")
            .eq_ignore_ascii_case("Bearer")
    {
        bail!("the Eidos account service returned invalid OAuth tokens");
    }
    Ok(())
}

fn valid_token(token: &str) -> bool {
    !token.is_empty()
        && token.len() <= 8 * 1024
        && !token.bytes().any(|byte| matches!(byte, b'\r' | b'\n' | 0))
}

fn access_token(
    client: &Client,
    discovery: &Discovery,
    account_origin: &Url,
    mut credential: StoredCredential,
) -> anyhow::Result<String> {
    validate_stored_credential(&credential, discovery)?;
    if credential.access_token_expires_at
        > now_seconds().saturating_add(ACCESS_TOKEN_EXPIRY_SKEW_SECONDS)
    {
        return Ok(credential.access_token);
    }
    if !discovery.supports_refresh {
        bail!("the stored Eidos session expired; run `eidos login` again");
    }
    let response = client
        .post(discovery.token_endpoint.clone())
        .header("Accept", "application/json")
        .form(&[
            ("client_id", OAUTH_CLIENT_ID),
            ("grant_type", "refresh_token"),
            ("refresh_token", credential.refresh_token.as_str()),
        ])
        .send()
        .context("refresh the Eidos CLI session")?;
    let refreshed: TokenResponse = response_json(response, "Eidos token refresh")
        .context("the stored Eidos session could not be refreshed; run `eidos login` again")?;
    validate_tokens(&refreshed)?;
    credential.access_token = refreshed.access_token;
    if let Some(refresh_token) = refreshed.refresh_token {
        credential.refresh_token = refresh_token;
    }
    credential.access_token_expires_at = token_expiry(refreshed.expires_in);
    store_credential(account_origin, &credential)?;
    Ok(credential.access_token)
}

fn userinfo(
    client: &Client,
    discovery: &Discovery,
    access_token: &str,
) -> anyhow::Result<AccountIdentity> {
    let response = client
        .get(discovery.userinfo_endpoint.clone())
        .header("Accept", "application/json")
        .bearer_auth(access_token)
        .send()
        .context("load the Eidos CLI account")?;
    let info: UserInfoResponse = response_json(response, "Eidos user info")?;
    if info.sub.is_empty() || info.sub.len() > 256 || info.sub.contains('\0') {
        bail!("the Eidos account service returned an invalid account identity");
    }
    Ok(AccountIdentity {
        issuer: discovery.issuer.clone(),
        subject: info.sub,
    })
}

fn credential_path(account_origin: &Url) -> anyhow::Result<PathBuf> {
    let issuer = account_origin.origin().ascii_serialization();
    let digest = Sha256::digest(issuer.as_bytes());
    let issuer_key = digest
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    Ok(config_root()?
        .join("credentials")
        .join(format!("{issuer_key}.json")))
}

fn config_root() -> anyhow::Result<PathBuf> {
    #[cfg(windows)]
    let base = std::env::var_os("APPDATA")
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .or_else(|| {
            std::env::var_os("USERPROFILE")
                .filter(|value| !value.is_empty())
                .map(|home| PathBuf::from(home).join("AppData").join("Roaming"))
        });

    #[cfg(not(windows))]
    let base = std::env::var_os("XDG_CONFIG_HOME")
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .or_else(|| {
            std::env::var_os("HOME")
                .filter(|value| !value.is_empty())
                .map(|home| PathBuf::from(home).join(".config"))
        });

    let base = base.ok_or_else(|| anyhow!("could not locate the user configuration directory"))?;
    if !base.is_absolute() {
        bail!("the user configuration directory must be an absolute path");
    }
    Ok(base.join("eidos"))
}

fn load_credential(account_origin: &Url) -> anyhow::Result<Option<StoredCredential>> {
    load_credential_file(&credential_path(account_origin)?)
}

fn load_credential_file(path: &Path) -> anyhow::Result<Option<StoredCredential>> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error).context("inspect the stored Eidos CLI session"),
    };
    if !metadata.file_type().is_file() || metadata.file_type().is_symlink() {
        bail!("the stored Eidos CLI session is not a regular file");
    }
    if metadata.len() > JSON_BYTES_MAX as u64 {
        bail!("the stored Eidos CLI session is invalid; run `eidos login` again");
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt as _;

        if metadata.permissions().mode() & 0o077 != 0 {
            bail!(
                "the stored Eidos CLI session permissions are too open; run `chmod 600 {}`",
                path.display()
            );
        }
    }

    let mut encoded = String::with_capacity(metadata.len().try_into().unwrap_or(0));
    File::open(path)
        .context("open the stored Eidos CLI session")?
        .take(JSON_BYTES_MAX as u64 + 1)
        .read_to_string(&mut encoded)
        .context("read the stored Eidos CLI session")?;
    if encoded.len() > JSON_BYTES_MAX {
        bail!("the stored Eidos CLI session is invalid; run `eidos login` again");
    }
    let credential = serde_json::from_str(&encoded)
        .context("the stored Eidos CLI session is invalid; run `eidos login` again")?;
    Ok(Some(credential))
}

fn store_credential(account_origin: &Url, credential: &StoredCredential) -> anyhow::Result<()> {
    store_credential_file(&credential_path(account_origin)?, credential)
}

fn store_credential_file(path: &Path, credential: &StoredCredential) -> anyhow::Result<()> {
    let encoded = serde_json::to_string(credential).context("encode the Eidos CLI session")?;
    let parent = path
        .parent()
        .ok_or_else(|| anyhow!("the Eidos CLI credential path has no parent directory"))?;
    fs::create_dir_all(parent).context("create the Eidos CLI credential directory")?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt as _;

        fs::set_permissions(parent, fs::Permissions::from_mode(0o700))
            .context("secure the Eidos CLI credential directory")?;
    }

    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("session");
    let temporary_path = parent.join(format!(".{file_name}.{}.tmp", random_url_token(8)));
    let mut options = OpenOptions::new();
    options.create_new(true).write(true);

    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt as _;

        options.mode(0o600);
    }

    let write_result = (|| -> anyhow::Result<()> {
        let mut file = options
            .open(&temporary_path)
            .context("create the Eidos CLI credential file")?;
        file.write_all(encoded.as_bytes())
            .context("write the Eidos CLI credential file")?;
        file.sync_all()
            .context("sync the Eidos CLI credential file")?;
        drop(file);

        #[cfg(windows)]
        if path.exists() {
            fs::remove_file(path).context("replace the Eidos CLI credential file")?;
        }

        fs::rename(&temporary_path, path).context("store the Eidos CLI credential file")?;
        Ok(())
    })();
    if write_result.is_err() {
        let _ = fs::remove_file(&temporary_path);
    }
    write_result
}

fn delete_credential(account_origin: &Url) -> anyhow::Result<bool> {
    match fs::remove_file(credential_path(account_origin)?) {
        Ok(()) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error).context("remove the stored Eidos CLI session"),
    }
}

fn validate_stored_credential(
    credential: &StoredCredential,
    discovery: &Discovery,
) -> anyhow::Result<()> {
    if credential.version != STORED_CREDENTIAL_VERSION
        || credential.issuer != discovery.issuer
        || !valid_token(&credential.access_token)
        || !valid_token(&credential.refresh_token)
    {
        bail!("the stored Eidos CLI session is invalid; run `eidos login` again");
    }
    Ok(())
}

fn token_expiry(expires_in: Option<u64>) -> u64 {
    now_seconds().saturating_add(expires_in.unwrap_or(3_600).clamp(60, 7 * 24 * 60 * 60))
}

fn now_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
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
    share: bool,
) -> anyhow::Result<qjs_host::relay::RelayConfig> {
    if claim.protocol != qjs_host::relay::RELAY_PROTOCOL_VERSION
        || claim.browser_access != if share { "share" } else { "account" }
        || claim.connector_token.is_empty()
        || claim.connector_token.len() > 8 * 1024
        || claim.connector_expires_at <= now_millis()
    {
        bail!("the Eidos Relay service returned an invalid claim");
    }
    let browser_access = if share {
        qjs_host::relay::RelayBrowserAccess::Share
    } else {
        qjs_host::relay::RelayBrowserAccess::Account
    };
    let public_url = Url::parse(&claim.public_url).context("parse the Eidos Relay public URL")?;
    let public_host = public_url.host_str().unwrap_or("");
    let public_label = public_host.split('.').next().unwrap_or("");
    let expected_label_suffix = if relay_origin.host_str() == Some("relay-staging.eidos.ink") {
        "-staging"
    } else {
        ""
    };
    let public_relay_label = public_label
        .strip_suffix(expected_label_suffix)
        .unwrap_or("");
    let public_identifier = public_relay_label
        .strip_prefix("r-")
        .or_else(|| public_relay_label.strip_prefix("u-"))
        .unwrap_or("");
    let access = public_url
        .fragment()
        .and_then(|fragment| fragment.strip_prefix("access="));
    let valid_browser_access = if share {
        access.is_some_and(|value| {
            !value.is_empty()
                && value.len() <= 512
                && value
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
        })
    } else {
        public_url.fragment().is_none()
    };
    if public_url.scheme() != "https"
        || public_url.username() != ""
        || public_url.password().is_some()
        || public_url.path() != "/"
        || public_url.query().is_some()
        || public_host != format!("{public_label}.eidos.ink")
        || public_identifier.len() != 20
        || !public_identifier
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit())
        || !valid_browser_access
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
        || connector_url.path() != format!("/v1/connect/u-{public_identifier}")
    {
        bail!("the Eidos Relay service returned an invalid connector URL");
    }
    Ok(qjs_host::relay::RelayConfig {
        browser_access,
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
    use super::{
        ClaimResponse, STORED_CREDENTIAL_VERSION, StoredCredential, load_credential_file,
        now_millis, service_origin, store_credential_file, validate_claim,
    };
    use qjs_host::relay::RelayBrowserAccess;

    #[test]
    fn accepts_only_exact_https_service_origins() {
        assert!(service_origin("https://eidos.space", "account").is_ok());
        assert!(service_origin("http://eidos.space", "account").is_err());
        assert!(service_origin("https://eidos.space/path", "account").is_err());
        assert!(service_origin("https://user@eidos.space", "account").is_err());
    }

    #[test]
    fn credential_file_round_trips_with_private_permissions() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("credentials").join("issuer.json");
        let credential = StoredCredential {
            version: STORED_CREDENTIAL_VERSION,
            issuer: "https://eidos.space".to_string(),
            access_token: "access-token".to_string(),
            refresh_token: "refresh-token".to_string(),
            access_token_expires_at: 123,
        };

        store_credential_file(&path, &credential).unwrap();
        assert_eq!(load_credential_file(&path).unwrap(), Some(credential));

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt as _;

            assert_eq!(
                std::fs::metadata(path.parent().unwrap())
                    .unwrap()
                    .permissions()
                    .mode()
                    & 0o777,
                0o700
            );
            assert_eq!(
                std::fs::metadata(&path).unwrap().permissions().mode() & 0o777,
                0o600
            );
        }
    }

    #[test]
    fn validates_relay_claim_origins_and_secret_placement() {
        let relay = service_origin("https://relay.eidos.ink", "relay").unwrap();
        let config = validate_claim(
            ClaimResponse {
                protocol: 1,
                browser_access: "share".to_string(),
                public_url: "https://r-0123456789abcdefabcd.eidos.ink/#access=browser-secret"
                    .to_string(),
                connector_url: "wss://relay.eidos.ink/v1/connect/u-0123456789abcdefabcd"
                    .to_string(),
                connector_token: "connector-secret".to_string(),
                connector_expires_at: now_millis() + 60_000,
            },
            &relay,
            true,
        )
        .unwrap();
        assert_eq!(config.browser_access, RelayBrowserAccess::Share);
        assert!(config.public_url.ends_with("#access=browser-secret"));
        assert!(!config.connector_url.contains("connector-secret"));

        assert!(
            validate_claim(
                ClaimResponse {
                    protocol: 1,
                    browser_access: "share".to_string(),
                    public_url: "https://r-0123456789abcdefabcd.eidos.ink/#access=browser-secret"
                        .to_string(),
                    connector_url: "wss://attacker.example/v1/connect/u-0123456789abcdefabcd"
                        .to_string(),
                    connector_token: "connector-secret".to_string(),
                    connector_expires_at: now_millis() + 60_000,
                },
                &relay,
                true,
            )
            .is_err()
        );

        let staging = service_origin("https://relay-staging.eidos.ink", "relay").unwrap();
        assert!(
            validate_claim(
                ClaimResponse {
                    protocol: 1,
                    browser_access: "share".to_string(),
                    public_url:
                        "https://r-0123456789abcdefabcd-staging.eidos.ink/#access=browser-secret"
                            .to_string(),
                    connector_url:
                        "wss://relay-staging.eidos.ink/v1/connect/u-0123456789abcdefabcd"
                            .to_string(),
                    connector_token: "connector-secret".to_string(),
                    connector_expires_at: now_millis() + 60_000,
                },
                &staging,
                true,
            )
            .is_ok()
        );

        let account = validate_claim(
            ClaimResponse {
                protocol: 1,
                browser_access: "account".to_string(),
                public_url: "https://r-0123456789abcdefabcd.eidos.ink/".to_string(),
                connector_url: "wss://relay.eidos.ink/v1/connect/u-0123456789abcdefabcd"
                    .to_string(),
                connector_token: "connector-secret".to_string(),
                connector_expires_at: now_millis() + 60_000,
            },
            &relay,
            false,
        )
        .unwrap();
        assert_eq!(account.browser_access, RelayBrowserAccess::Account);
        assert!(!account.public_url.contains("#access="));

        assert!(
            validate_claim(
                ClaimResponse {
                    protocol: 1,
                    browser_access: "account".to_string(),
                    public_url: "https://r-0123456789abcdefabcd.eidos.ink/#access=unexpected"
                        .to_string(),
                    connector_url: "wss://relay.eidos.ink/v1/connect/u-0123456789abcdefabcd"
                        .to_string(),
                    connector_token: "connector-secret".to_string(),
                    connector_expires_at: now_millis() + 60_000,
                },
                &relay,
                false,
            )
            .is_err()
        );
    }
}
