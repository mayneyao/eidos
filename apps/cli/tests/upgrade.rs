use std::fs;
use std::io::{ErrorKind, Read, Write};
use std::net::TcpListener;
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::thread;
use std::time::{Duration, Instant};

use serde_json::Value;
use sha2::{Digest, Sha256};
use tempfile::TempDir;

fn release_target() -> Option<&'static str> {
    if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        Some("aarch64-apple-darwin")
    } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
        Some("x86_64-apple-darwin")
    } else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        Some("x86_64-unknown-linux-gnu")
    } else if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        Some("x86_64-pc-windows-msvc")
    } else {
        None
    }
}

#[cfg(unix)]
fn make_release(root: &Path, valid_checksum: bool) -> PathBuf {
    let version = env!("CARGO_PKG_VERSION");
    let target = release_target().expect("test runs only on a supported Unix release target");
    let archive_name = format!("eidos-cli-v{version}-{target}.tar.gz");
    let release_directory = root.join(format!("cli-v{version}"));
    let payload_directory = root.join("payload");
    fs::create_dir_all(&release_directory).unwrap();
    fs::create_dir_all(&payload_directory).unwrap();

    let payload = payload_directory.join("eidos");
    fs::write(
        &payload,
        format!(
            "#!/bin/sh\nif [ \"${{1:-}}\" = \"--version\" ]; then\n  printf 'eidos {version} (fixture)\\n'\n  exit 0\nfi\nprintf 'upgraded fixture\\n'\n"
        ),
    )
    .unwrap();
    fs::set_permissions(&payload, fs::Permissions::from_mode(0o755)).unwrap();

    let archive = release_directory.join(&archive_name);
    let status = Command::new("tar")
        .arg("-czf")
        .arg(&archive)
        .arg("-C")
        .arg(&payload_directory)
        .arg("eidos")
        .status()
        .unwrap();
    assert!(status.success());
    let digest = format!("{:x}", Sha256::digest(fs::read(&archive).unwrap()));
    fs::write(
        release_directory.join("SHA256SUMS"),
        format!(
            "{}  {archive_name}\n",
            if valid_checksum {
                digest
            } else {
                "0".repeat(64)
            }
        ),
    )
    .unwrap();
    fs::write(root.join("LATEST"), format!("{version}\n")).unwrap();
    archive
}

#[cfg(windows)]
fn make_release(root: &Path, valid_checksum: bool) -> PathBuf {
    let version = env!("CARGO_PKG_VERSION");
    let target = release_target().expect("test runs only on a supported Windows release target");
    let archive_name = format!("eidos-cli-v{version}-{target}.zip");
    let release_directory = root.join(format!("cli-v{version}"));
    let payload_directory = root.join("payload");
    fs::create_dir_all(&release_directory).unwrap();
    fs::create_dir_all(&payload_directory).unwrap();

    let payload = payload_directory.join("eidos.exe");
    fs::copy(env!("CARGO_BIN_EXE_eidos"), &payload).unwrap();
    let archive = release_directory.join(&archive_name);
    let script = root.join("compress.ps1");
    fs::write(
        &script,
        "param([string]$Source, [string]$Archive)\n$ErrorActionPreference = 'Stop'\nCompress-Archive -LiteralPath $Source -DestinationPath $Archive -Force\n",
    )
    .unwrap();
    let status = Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
        ])
        .arg(&script)
        .arg("-Source")
        .arg(&payload)
        .arg("-Archive")
        .arg(&archive)
        .status()
        .unwrap();
    assert!(status.success());

    let digest = format!("{:x}", Sha256::digest(fs::read(&archive).unwrap()));
    fs::write(
        release_directory.join("SHA256SUMS"),
        format!(
            "{}  {archive_name}\n",
            if valid_checksum {
                digest
            } else {
                "0".repeat(64)
            }
        ),
    )
    .unwrap();
    fs::write(root.join("LATEST"), format!("{version}\n")).unwrap();
    archive
}

fn start_file_server(root: PathBuf, expected_requests: usize) -> (String, thread::JoinHandle<()>) {
    let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
    listener.set_nonblocking(true).unwrap();
    let address = listener.local_addr().unwrap();
    let handle = thread::spawn(move || {
        let deadline = Instant::now() + Duration::from_secs(15);
        let mut served = 0;
        while served < expected_requests && Instant::now() < deadline {
            let (mut stream, _) = match listener.accept() {
                Ok(connection) => connection,
                Err(error) if error.kind() == ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(10));
                    continue;
                }
                Err(error) => panic!("test server failed: {error}"),
            };
            stream
                .set_read_timeout(Some(Duration::from_secs(2)))
                .unwrap();
            let mut request = [0_u8; 8192];
            let read = stream.read(&mut request).unwrap();
            let request = String::from_utf8_lossy(&request[..read]);
            let request_path = request
                .lines()
                .next()
                .and_then(|line| line.split_whitespace().nth(1))
                .unwrap();
            let relative = request_path
                .split('?')
                .next()
                .unwrap()
                .trim_start_matches('/');
            assert!(!relative.split('/').any(|part| part == ".."));
            let file = root.join(relative);
            let (status, body) = match fs::read(file) {
                Ok(body) => ("200 OK", body),
                Err(_) => ("404 Not Found", b"not found".to_vec()),
            };
            write!(
                stream,
                "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                body.len()
            )
            .unwrap();
            stream.write_all(&body).unwrap();
            served += 1;
        }
        assert_eq!(served, expected_requests);
    });
    (format!("http://{address}"), handle)
}

fn installed_copy(directory: &TempDir) -> PathBuf {
    let installed = directory
        .path()
        .join(if cfg!(windows) { "eidos.exe" } else { "eidos" });
    fs::copy(env!("CARGO_BIN_EXE_eidos"), &installed).unwrap();
    #[cfg(unix)]
    fs::set_permissions(&installed, fs::Permissions::from_mode(0o755)).unwrap();
    installed
}

#[test]
fn current_version_is_a_network_free_noop() {
    if release_target().is_none() {
        return;
    }
    let output = Command::new(env!("CARGO_BIN_EXE_eidos"))
        .args(["--json", "upgrade", "--version", env!("CARGO_PKG_VERSION")])
        .env("EIDOS_DOWNLOAD_BASE", "http://127.0.0.1:1/unreachable")
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let value: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(value["upgraded"], false);
    assert_eq!(value["upToDate"], true);
}

#[test]
#[cfg(unix)]
fn upgrades_a_copy_from_a_verified_release() {
    if release_target().is_none() {
        return;
    }
    let release = TempDir::new().unwrap();
    make_release(release.path(), true);
    let (download_base, server) = start_file_server(release.path().to_path_buf(), 3);
    let installation = TempDir::new().unwrap();
    let installed = installed_copy(&installation);

    let output = Command::new(&installed)
        .args(["--json", "upgrade", "--force"])
        .env("EIDOS_LATEST_URL", format!("{download_base}/LATEST"))
        .env("EIDOS_DOWNLOAD_BASE", &download_base)
        .output()
        .unwrap();
    server.join().unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let value: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(value["upgraded"], true);
    assert_eq!(value["replacementScheduled"], false);

    let upgraded = Command::new(&installed).arg("--version").output().unwrap();
    assert!(upgraded.status.success());
    assert_eq!(
        String::from_utf8(upgraded.stdout).unwrap(),
        format!("eidos {} (fixture)\n", env!("CARGO_PKG_VERSION"))
    );
}

#[test]
#[cfg(unix)]
fn checksum_failure_preserves_the_existing_binary() {
    if release_target().is_none() {
        return;
    }
    let release = TempDir::new().unwrap();
    make_release(release.path(), false);
    let (download_base, server) = start_file_server(release.path().to_path_buf(), 2);
    let installation = TempDir::new().unwrap();
    let installed = installed_copy(&installation);

    let output = Command::new(&installed)
        .args([
            "--json",
            "upgrade",
            "--version",
            env!("CARGO_PKG_VERSION"),
            "--force",
        ])
        .env("EIDOS_DOWNLOAD_BASE", download_base)
        .output()
        .unwrap();
    server.join().unwrap();
    assert!(!output.status.success());
    let value: Value = serde_json::from_slice(&output.stderr).unwrap();
    assert_eq!(value["error"]["code"], "upgrade-failed");
    assert!(
        value["error"]["message"]
            .as_str()
            .unwrap()
            .contains("checksum mismatch")
    );

    let preserved = Command::new(&installed).arg("--version").output().unwrap();
    assert!(preserved.status.success());
    assert!(
        String::from_utf8_lossy(&preserved.stdout)
            .starts_with(&format!("eidos {} (", env!("CARGO_PKG_VERSION")))
    );
}

#[test]
#[cfg(windows)]
fn windows_schedules_and_completes_a_verified_replacement() {
    if release_target().is_none() {
        return;
    }
    let release = TempDir::new().unwrap();
    make_release(release.path(), true);
    let (download_base, server) = start_file_server(release.path().to_path_buf(), 3);
    let installation = TempDir::new().unwrap();
    let installed = installed_copy(&installation);
    let release_size = fs::metadata(env!("CARGO_BIN_EXE_eidos")).unwrap().len();
    fs::OpenOptions::new()
        .append(true)
        .open(&installed)
        .unwrap()
        .write_all(b"old installation marker")
        .unwrap();
    assert!(fs::metadata(&installed).unwrap().len() > release_size);
    assert!(
        Command::new(&installed)
            .arg("--version")
            .status()
            .unwrap()
            .success()
    );

    let output = Command::new(&installed)
        .args(["--json", "upgrade", "--force"])
        .env("EIDOS_LATEST_URL", format!("{download_base}/LATEST"))
        .env("EIDOS_DOWNLOAD_BASE", &download_base)
        .output()
        .unwrap();
    server.join().unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let value: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(value["upgraded"], true);
    assert_eq!(value["replacementScheduled"], true);

    let deadline = Instant::now() + Duration::from_secs(15);
    while Instant::now() < deadline {
        if fs::metadata(&installed).is_ok_and(|metadata| metadata.len() == release_size) {
            break;
        }
        thread::sleep(Duration::from_millis(100));
    }
    assert_eq!(fs::metadata(&installed).unwrap().len(), release_size);
    assert!(
        Command::new(&installed)
            .arg("--version")
            .status()
            .unwrap()
            .success()
    );
}
