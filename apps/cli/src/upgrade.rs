use std::env;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;

use rand::random;
use reqwest::blocking::Client;
use semver::Version;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

use crate::cli::UpgradeArgs;
use crate::error::{AppError, Result};

const DEFAULT_REPOSITORY: &str = "mayneyao/eidos";
const DEFAULT_LATEST_URL: &str = "https://download.eidos.space/cli/latest";

struct ReleaseTarget {
    triple: &'static str,
    archive_extension: &'static str,
    binary_name: &'static str,
}

struct UpgradeEndpoints {
    latest_url: String,
    download_base: String,
}

impl UpgradeEndpoints {
    fn from_environment() -> Self {
        let repository =
            env::var("EIDOS_GITHUB_REPOSITORY").unwrap_or_else(|_| DEFAULT_REPOSITORY.to_string());
        let latest_url = env::var("EIDOS_LATEST_URL").unwrap_or_else(|_| {
            if repository == DEFAULT_REPOSITORY {
                DEFAULT_LATEST_URL.to_string()
            } else {
                format!("https://raw.githubusercontent.com/{repository}/dev/apps/cli/LATEST")
            }
        });
        let download_base = env::var("EIDOS_DOWNLOAD_BASE")
            .unwrap_or_else(|_| format!("https://github.com/{repository}/releases/download"));
        Self {
            latest_url,
            download_base,
        }
    }
}

pub fn run(args: UpgradeArgs) -> Result<Value> {
    let current_version = Version::parse(env!("CARGO_PKG_VERSION"))
        .expect("CARGO_PKG_VERSION must be valid semantic versioning");
    let endpoints = UpgradeEndpoints::from_environment();
    let client = Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(300))
        .build()
        .map_err(|error| AppError::upgrade_failed(format!("cannot create HTTP client: {error}")))?;
    let requested_version = match args.version {
        Some(version) => version,
        None => fetch_text(&client, &endpoints.latest_url, "latest-version pointer")?,
    };
    let target_version = parse_release_version(&requested_version)?;

    if target_version == current_version && !args.force {
        return Ok(json!({
            "upgraded": false,
            "upToDate": true,
            "currentVersion": current_version.to_string(),
            "targetVersion": target_version.to_string(),
            "restartRequired": false,
        }));
    }
    if target_version < current_version && !args.force {
        return Err(AppError::invalid_request(format!(
            "refusing to downgrade Eidos CLI from {current_version} to {target_version}; pass --force to install an older version"
        )));
    }

    let release_target = release_target()?;
    let archive_name = format!(
        "eidos-cli-v{}-{}.{}",
        target_version, release_target.triple, release_target.archive_extension
    );
    let release_url = format!(
        "{}/cli-v{}",
        endpoints.download_base.trim_end_matches('/'),
        target_version
    );
    let temporary = UpgradeDirectory::create()?;
    let checksums = fetch_text(
        &client,
        &format!("{release_url}/SHA256SUMS"),
        "release checksums",
    )?;
    let expected_checksum = checksum_for_archive(&checksums, &archive_name)?;
    let archive_path = temporary.path.join(&archive_name);
    download_file(
        &client,
        &format!("{release_url}/{archive_name}"),
        &archive_path,
    )?;
    verify_checksum(&archive_path, &expected_checksum)?;

    let extracted_binary = extract_archive(&archive_path, &temporary.path, &release_target)?;
    let current_executable = env::current_exe().map_err(|error| {
        AppError::upgrade_failed(format!("cannot locate the running Eidos CLI: {error}"))
    })?;
    let staged_binary = stage_replacement(&extracted_binary, &current_executable)?;
    if let Err(error) = validate_binary_version(&staged_binary, &target_version) {
        let _ = fs::remove_file(&staged_binary);
        return Err(error);
    }
    let scheduled = match replace_current_executable(&staged_binary, &current_executable) {
        Ok(scheduled) => scheduled,
        Err(error) => {
            let _ = fs::remove_file(&staged_binary);
            return Err(error);
        }
    };

    Ok(json!({
        "upgraded": true,
        "upToDate": false,
        "currentVersion": current_version.to_string(),
        "targetVersion": target_version.to_string(),
        "executable": current_executable,
        "restartRequired": true,
        "replacementScheduled": scheduled,
    }))
}

fn parse_release_version(value: &str) -> Result<Version> {
    let value = value.trim();
    let value = value
        .strip_prefix("cli-v")
        .or_else(|| value.strip_prefix('v'))
        .unwrap_or(value);
    Version::parse(value).map_err(|error| {
        AppError::invalid_request(format!("invalid Eidos CLI version {value:?}: {error}"))
    })
}

fn release_target() -> Result<ReleaseTarget> {
    if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        Ok(ReleaseTarget {
            triple: "aarch64-apple-darwin",
            archive_extension: "tar.gz",
            binary_name: "eidos",
        })
    } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
        Ok(ReleaseTarget {
            triple: "x86_64-apple-darwin",
            archive_extension: "tar.gz",
            binary_name: "eidos",
        })
    } else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        Ok(ReleaseTarget {
            triple: "x86_64-unknown-linux-gnu",
            archive_extension: "tar.gz",
            binary_name: "eidos",
        })
    } else if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        Ok(ReleaseTarget {
            triple: "x86_64-pc-windows-msvc",
            archive_extension: "zip",
            binary_name: "eidos.exe",
        })
    } else {
        Err(AppError::invalid_request(format!(
            "Eidos CLI self-upgrade is not available for {} {}",
            env::consts::OS,
            env::consts::ARCH
        )))
    }
}

fn fetch_text(client: &Client, url: &str, label: &str) -> Result<String> {
    client
        .get(url)
        .send()
        .and_then(reqwest::blocking::Response::error_for_status)
        .and_then(reqwest::blocking::Response::text)
        .map_err(|error| AppError::upgrade_failed(format!("cannot download {label}: {error}")))
}

fn download_file(client: &Client, url: &str, destination: &Path) -> Result<()> {
    let mut response = client
        .get(url)
        .send()
        .and_then(reqwest::blocking::Response::error_for_status)
        .map_err(|error| {
            AppError::upgrade_failed(format!("cannot download release archive: {error}"))
        })?;
    let mut file = File::create(destination).map_err(|error| {
        AppError::upgrade_failed(format!("cannot create temporary archive: {error}"))
    })?;
    io::copy(&mut response, &mut file).map_err(|error| {
        AppError::upgrade_failed(format!("cannot save release archive: {error}"))
    })?;
    file.sync_all()
        .map_err(|error| AppError::upgrade_failed(format!("cannot flush release archive: {error}")))
}

fn checksum_for_archive(checksums: &str, archive_name: &str) -> Result<String> {
    for line in checksums.lines() {
        let mut fields = line.split_whitespace();
        let Some(checksum) = fields.next() else {
            continue;
        };
        let Some(file_name) = fields.next() else {
            continue;
        };
        if file_name.trim_start_matches('*') == archive_name {
            if checksum.len() == 64 && checksum.bytes().all(|byte| byte.is_ascii_hexdigit()) {
                return Ok(checksum.to_ascii_lowercase());
            }
            return Err(AppError::upgrade_failed(format!(
                "SHA256SUMS contains an invalid checksum for {archive_name}"
            )));
        }
    }
    Err(AppError::upgrade_failed(format!(
        "SHA256SUMS has no entry for {archive_name}"
    )))
}

fn verify_checksum(path: &Path, expected: &str) -> Result<()> {
    let mut file = File::open(path).map_err(|error| {
        AppError::upgrade_failed(format!("cannot read release archive: {error}"))
    })?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer).map_err(|error| {
            AppError::upgrade_failed(format!("cannot hash release archive: {error}"))
        })?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    let actual = format!("{:x}", hasher.finalize());
    if actual != expected {
        return Err(AppError::upgrade_failed(format!(
            "checksum mismatch for {}",
            path.file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("release archive")
        )));
    }
    Ok(())
}

struct UpgradeDirectory {
    path: PathBuf,
}

impl UpgradeDirectory {
    fn create() -> Result<Self> {
        for _ in 0..10 {
            let path = env::temp_dir().join(format!(
                "eidos-upgrade-{}-{:016x}",
                std::process::id(),
                random::<u64>()
            ));
            match fs::create_dir(&path) {
                Ok(()) => return Ok(Self { path }),
                Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
                Err(error) => {
                    return Err(AppError::upgrade_failed(format!(
                        "cannot create temporary upgrade directory: {error}"
                    )));
                }
            }
        }
        Err(AppError::upgrade_failed(
            "cannot allocate a unique temporary upgrade directory",
        ))
    }
}

impl Drop for UpgradeDirectory {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

#[cfg(unix)]
fn extract_archive(
    archive_path: &Path,
    temporary_directory: &Path,
    target: &ReleaseTarget,
) -> Result<PathBuf> {
    let extract_directory = temporary_directory.join("extract");
    fs::create_dir(&extract_directory).map_err(|error| {
        AppError::upgrade_failed(format!("cannot create extraction directory: {error}"))
    })?;
    let status = Command::new("tar")
        .arg("-xzf")
        .arg(archive_path)
        .arg("-C")
        .arg(&extract_directory)
        .arg(target.binary_name)
        .status()
        .map_err(|error| AppError::upgrade_failed(format!("cannot run tar: {error}")))?;
    if !status.success() {
        return Err(AppError::upgrade_failed(format!(
            "cannot extract release archive: tar exited with {status}"
        )));
    }
    require_regular_binary(extract_directory.join(target.binary_name))
}

#[cfg(windows)]
fn extract_archive(
    archive_path: &Path,
    temporary_directory: &Path,
    target: &ReleaseTarget,
) -> Result<PathBuf> {
    let extract_directory = temporary_directory.join("extract");
    let script_path = temporary_directory.join("extract.ps1");
    fs::write(
        &script_path,
        "param([string]$Archive, [string]$Destination)\n$ErrorActionPreference = 'Stop'\nExpand-Archive -LiteralPath $Archive -DestinationPath $Destination -Force\n",
    )
    .map_err(|error| {
        AppError::upgrade_failed(format!("cannot prepare archive extractor: {error}"))
    })?;
    let status = Command::new("powershell.exe")
        .arg("-NoProfile")
        .arg("-NonInteractive")
        .arg("-File")
        .arg(&script_path)
        .arg("-Archive")
        .arg(archive_path)
        .arg("-Destination")
        .arg(&extract_directory)
        .status()
        .map_err(|error| AppError::upgrade_failed(format!("cannot run PowerShell: {error}")))?;
    if !status.success() {
        return Err(AppError::upgrade_failed(format!(
            "cannot extract release archive: PowerShell exited with {status}"
        )));
    }
    require_regular_binary(extract_directory.join(target.binary_name))
}

#[cfg(not(any(unix, windows)))]
fn extract_archive(
    _archive_path: &Path,
    _temporary_directory: &Path,
    _target: &ReleaseTarget,
) -> Result<PathBuf> {
    Err(AppError::invalid_request(
        "Eidos CLI self-upgrade is not supported on this platform",
    ))
}

fn require_regular_binary(path: PathBuf) -> Result<PathBuf> {
    let metadata = fs::symlink_metadata(&path).map_err(|error| {
        AppError::upgrade_failed(format!(
            "release archive does not contain the CLI binary: {error}"
        ))
    })?;
    if !metadata.file_type().is_file() {
        return Err(AppError::upgrade_failed(
            "release archive CLI entry is not a regular file",
        ));
    }
    Ok(path)
}

fn stage_replacement(source: &Path, current_executable: &Path) -> Result<PathBuf> {
    let parent = current_executable.parent().ok_or_else(|| {
        AppError::upgrade_failed("the current executable has no parent directory")
    })?;
    let suffix = if cfg!(windows) { ".exe" } else { "" };
    let staged = parent.join(format!(
        ".eidos-upgrade-{}-{:016x}{suffix}",
        std::process::id(),
        random::<u64>()
    ));
    let mut input = File::open(source).map_err(|error| {
        AppError::upgrade_failed(format!("cannot read extracted CLI binary: {error}"))
    })?;
    let mut output = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&staged)
        .map_err(|error| {
            AppError::upgrade_failed(format!(
                "cannot stage the new CLI beside {}: {error}",
                current_executable.display()
            ))
        })?;
    if let Err(error) = io::copy(&mut input, &mut output) {
        let _ = fs::remove_file(&staged);
        return Err(AppError::upgrade_failed(format!(
            "cannot stage the new CLI: {error}"
        )));
    }
    let permissions = fs::metadata(source)
        .map_err(|error| AppError::upgrade_failed(format!("cannot read CLI permissions: {error}")))?
        .permissions();
    if let Err(error) = fs::set_permissions(&staged, permissions) {
        let _ = fs::remove_file(&staged);
        return Err(AppError::upgrade_failed(format!(
            "cannot apply CLI permissions: {error}"
        )));
    }
    output.sync_all().map_err(|error| {
        let _ = fs::remove_file(&staged);
        AppError::upgrade_failed(format!("cannot flush the staged CLI: {error}"))
    })?;
    Ok(staged)
}

fn validate_binary_version(binary: &Path, expected_version: &Version) -> Result<()> {
    let output = Command::new(binary)
        .arg("--version")
        .stdin(Stdio::null())
        .output()
        .map_err(|error| {
            AppError::upgrade_failed(format!("cannot execute the downloaded CLI: {error}"))
        })?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let expected_prefix = format!("eidos {expected_version} (");
    if !output.status.success() || !stdout.trim().starts_with(&expected_prefix) {
        return Err(AppError::upgrade_failed(format!(
            "downloaded CLI failed version verification; expected {expected_version}, got {:?}",
            stdout.trim()
        )));
    }
    Ok(())
}

#[cfg(unix)]
fn replace_current_executable(staged: &Path, current_executable: &Path) -> Result<bool> {
    fs::rename(staged, current_executable).map_err(|error| {
        AppError::upgrade_failed(format!(
            "cannot replace {}: {error}; ensure the installation directory is writable",
            current_executable.display()
        ))
    })?;
    Ok(false)
}

#[cfg(windows)]
fn replace_current_executable(staged: &Path, current_executable: &Path) -> Result<bool> {
    use std::os::windows::process::CommandExt;

    const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    let parent = current_executable.parent().ok_or_else(|| {
        AppError::upgrade_failed("the current executable has no parent directory")
    })?;
    let script_path = parent.join(format!(
        ".eidos-upgrade-{}-{:016x}.ps1",
        std::process::id(),
        random::<u64>()
    ));
    let backup_path = parent.join(format!(
        ".eidos-upgrade-backup-{}-{:016x}.exe",
        std::process::id(),
        random::<u64>()
    ));
    let script = r#"param(
  [int]$ParentId,
  [string]$Source,
  [string]$Destination,
  [string]$Backup,
  [string]$ScriptPath
)
$ErrorActionPreference = "Stop"
Wait-Process -Id $ParentId -ErrorAction SilentlyContinue
$lastError = $null
for ($attempt = 0; $attempt -lt 100; $attempt++) {
  try {
    [System.IO.File]::Replace($Source, $Destination, $Backup, $true)
    Remove-Item -LiteralPath $Backup -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $ScriptPath -Force -ErrorAction SilentlyContinue
    exit 0
  } catch {
    $lastError = $_
    Start-Sleep -Milliseconds 100
  }
}
$lastError | Out-String | Set-Content -LiteralPath "$Destination.upgrade-error.log"
exit 1
"#;
    fs::write(&script_path, script).map_err(|error| {
        AppError::upgrade_failed(format!(
            "cannot prepare Windows replacement helper: {error}"
        ))
    })?;
    let spawned = Command::new("powershell.exe")
        .arg("-NoProfile")
        .arg("-NonInteractive")
        .arg("-ExecutionPolicy")
        .arg("Bypass")
        .arg("-File")
        .arg(&script_path)
        .arg("-ParentId")
        .arg(std::process::id().to_string())
        .arg("-Source")
        .arg(staged)
        .arg("-Destination")
        .arg(current_executable)
        .arg("-Backup")
        .arg(&backup_path)
        .arg("-ScriptPath")
        .arg(&script_path)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW)
        .spawn();
    if let Err(error) = spawned {
        let _ = fs::remove_file(&script_path);
        return Err(AppError::upgrade_failed(format!(
            "cannot start Windows replacement helper: {error}"
        )));
    }
    Ok(true)
}

#[cfg(not(any(unix, windows)))]
fn replace_current_executable(_staged: &Path, _current_executable: &Path) -> Result<bool> {
    Err(AppError::invalid_request(
        "Eidos CLI self-upgrade is not supported on this platform",
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_release_version_prefixes() {
        assert_eq!(
            parse_release_version("0.36.9\n").unwrap(),
            Version::new(0, 36, 9)
        );
        assert_eq!(
            parse_release_version("cli-v1.2.3").unwrap(),
            Version::new(1, 2, 3)
        );
        assert_eq!(
            parse_release_version("v2.0.0-beta.1").unwrap().to_string(),
            "2.0.0-beta.1"
        );
    }

    #[test]
    fn selects_only_an_exact_valid_checksum_entry() {
        let archive = "eidos-cli-v1.2.3-aarch64-apple-darwin.tar.gz";
        let digest = "a".repeat(64);
        let checksums = format!(
            "{}  other.tar.gz\n{}  {}\n",
            "b".repeat(64),
            digest,
            archive
        );
        assert_eq!(checksum_for_archive(&checksums, archive).unwrap(), digest);
        assert!(checksum_for_archive(&checksums, "missing.tar.gz").is_err());
        assert!(checksum_for_archive(&format!("bad  {archive}\n"), archive).is_err());
    }

    #[test]
    fn rejects_a_checksum_mismatch() {
        let temporary = UpgradeDirectory::create().unwrap();
        let archive = temporary.path.join("archive");
        fs::write(&archive, b"verified bytes").unwrap();
        let error = verify_checksum(&archive, &"0".repeat(64)).unwrap_err();
        assert_eq!(error.code, "upgrade-failed");
        assert!(error.message.contains("checksum mismatch"));
    }
}
