//! Internal host transport, not a grant authority. The caller owns grant checks,
//! working-copy conflicts, file encodings, recovery and lifecycle cancellation.
//! All data access uses directory capabilities; no request opens an ambient path.
use std::cell::RefCell;
use std::collections::HashMap;
use std::io::{self, BufRead, Read, Write};
use std::path::Path;

use base64::{Engine, engine::general_purpose::STANDARD};
use cap_fs_ext::{
    DirExt, FollowSymlinks, MetadataExt, OpenOptionsFollowExt, OpenOptionsMaybeDirExt,
    OpenOptionsSyncExt,
};
use cap_std::fs::{Dir, File, Metadata, OpenOptions};
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

const TEXT_LIMIT: usize = 2 * 1024 * 1024;
const FRAME_LIMIT: usize = 3 * 1024 * 1024;
const ENTRY_LIMIT: usize = 10_000;
type Result<T> = std::result::Result<T, Failure>;

#[derive(Debug)]
struct Failure(&'static str);
impl From<io::Error> for Failure {
    fn from(error: io::Error) -> Self {
        Self(match error.kind() {
            io::ErrorKind::AlreadyExists => "ALREADY_EXISTS",
            io::ErrorKind::NotFound => "DOCUMENT_UNAVAILABLE",
            io::ErrorKind::PermissionDenied => "PERMISSION_DENIED",
            _ => "IO_ERROR",
        })
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    id: u64,
    operation: Operation,
}
#[derive(Deserialize)]
#[serde(tag = "method", rename_all = "camelCase", deny_unknown_fields)]
enum Operation {
    Read {
        path: String,
    },
    List {
        path: String,
    },
    Create {
        path: String,
        bytes: String,
    },
    Write {
        path: String,
        bytes: String,
        revision: String,
    },
}

struct Filesystem {
    root: Dir,
    denied: Vec<Vec<String>>,
    denied_paths: Vec<String>,
    // Keep handles alive so a renamed protected object stays denied and its
    // identity cannot be reused by an unrelated new object during this session.
    protected: RefCell<HashMap<(u64, u64), File>>,
}

fn components(path: &str) -> Result<Vec<&str>> {
    if path.is_empty()
        || path.len() > 4096
        || path
            .chars()
            .any(|c| c.is_control() || c == '\\' || c == ':')
    {
        return Err(Failure("INVALID_REQUEST"));
    }
    let parts: Vec<_> = path.split('/').collect();
    if parts.len() > 128
        || parts
            .iter()
            .any(|p| p.is_empty() || *p == "." || *p == ".." || p.ends_with([' ', '.']))
    {
        return Err(Failure("INVALID_REQUEST"));
    }
    Ok(parts)
}

impl Filesystem {
    fn open(root: &Path, denied: &[String]) -> Result<Self> {
        // The host supplies its canonical Space root. Only this startup operation
        // uses ambient authority, and the handshake reports the opened identity.
        let root = Dir::open_ambient_dir(root, cap_std::ambient_authority())?;
        if denied.len() > 128 {
            return Err(Failure("TOO_LARGE"));
        }
        let denied_paths = denied.to_vec();
        let denied = denied
            .iter()
            .map(|name| {
                components(name).map(|parts| parts.into_iter().map(str::to_lowercase).collect())
            })
            .collect::<Result<_>>()?;
        let filesystem = Self {
            root,
            denied,
            denied_paths,
            protected: RefCell::new(HashMap::new()),
        };
        filesystem.refresh_protected()?;
        Ok(filesystem)
    }

    fn refresh_protected(&self) -> Result<()> {
        for path in &self.denied_paths {
            let parts = components(path)?;
            let opened = (|| -> io::Result<File> {
                let mut parent = self.root.try_clone()?;
                for part in &parts[..parts.len() - 1] {
                    parent = parent.open_dir_nofollow(part)?;
                }
                let mut options = OpenOptions::new();
                options
                    .read(true)
                    .follow(FollowSymlinks::No)
                    .nonblock(true)
                    .maybe_dir(true);
                parent.open_with(parts[parts.len() - 1], &options)
            })();
            let file = match opened {
                Ok(file) => file,
                Err(error) if error.kind() == io::ErrorKind::NotFound => continue,
                Err(error) => return Err(error.into()),
            };
            let metadata = file.metadata()?;
            let identity = (metadata.dev(), metadata.ino());
            let mut protected = self.protected.borrow_mut();
            if protected.len() >= 1024 && !protected.contains_key(&identity) {
                return Err(Failure("TOO_LARGE"));
            }
            protected.entry(identity).or_insert(file);
        }
        Ok(())
    }

    fn allowed(&self, metadata: &Metadata) -> bool {
        !self
            .protected
            .borrow()
            .contains_key(&(metadata.dev(), metadata.ino()))
    }

    fn checked<'a>(&self, path: &'a str) -> Result<Vec<&'a str>> {
        let parts = components(path)?;
        let lower: Vec<_> = parts.iter().map(|p| p.to_lowercase()).collect();
        if lower.iter().any(|part| {
            part == ".graft"
                || part.ends_with(".eidos")
                || part.ends_with(".eidos-plugin")
                || part == "plugin.json"
                || part.starts_with(".eidos-plugin-")
        }) || self.denied.iter().any(|prefix| lower.starts_with(prefix))
        {
            return Err(Failure("PERMISSION_DENIED"));
        }
        Ok(parts)
    }

    fn directory(&self, parts: &[&str]) -> Result<Dir> {
        let mut directory = self.root.try_clone()?;
        for part in parts {
            // A single component at a time: NOFOLLOW applies to every parent.
            directory = directory.open_dir_nofollow(part)?;
            if !self.allowed(&directory.dir_metadata()?) {
                return Err(Failure("PERMISSION_DENIED"));
            }
        }
        Ok(directory)
    }

    fn parent<'a>(&self, path: &'a str) -> Result<(Dir, &'a str)> {
        let parts = self.checked(path)?;
        Ok((
            self.directory(&parts[..parts.len() - 1])?,
            parts[parts.len() - 1],
        ))
    }

    fn read_at(&self, directory: &Dir, name: &str) -> Result<Vec<u8>> {
        let mut options = OpenOptions::new();
        options.read(true).follow(FollowSymlinks::No).nonblock(true);
        let file = directory.open_with(name, &options)?;
        let metadata = file.metadata()?;
        if !metadata.is_file() || metadata.nlink() != 1 || !self.allowed(&metadata) {
            return Err(Failure("PERMISSION_DENIED"));
        }
        if metadata.len() > TEXT_LIMIT as u64 {
            return Err(Failure("TOO_LARGE"));
        }
        let mut bytes = Vec::new();
        file.take(TEXT_LIMIT as u64 + 1).read_to_end(&mut bytes)?;
        if bytes.len() > TEXT_LIMIT {
            return Err(Failure("TOO_LARGE"));
        }
        Ok(bytes)
    }

    fn list(
        &self,
        directory: &Dir,
        prefix: &str,
        files: &mut Vec<String>,
        visited: &mut usize,
    ) -> Result<()> {
        for entry in directory.entries()? {
            *visited += 1;
            if *visited > ENTRY_LIMIT {
                return Err(Failure("TOO_LARGE"));
            }
            let entry = entry?;
            let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
                continue;
            };
            let path = if prefix.is_empty() {
                name.clone()
            } else {
                format!("{prefix}/{name}")
            };
            if self.checked(&path).is_err() {
                continue;
            }
            let kind = entry.file_type()?;
            if kind.is_dir() {
                // An entry can change between enumeration and opening. Never follow it.
                if let Ok(child) = directory.open_dir_nofollow(&name) {
                    if !self.allowed(&child.dir_metadata()?) {
                        continue;
                    }
                    self.list(&child, &path, files, visited)?;
                }
            } else if kind.is_file() {
                let mut options = OpenOptions::new();
                options.read(true).follow(FollowSymlinks::No).nonblock(true);
                if let Ok(file) = directory.open_with(&name, &options) {
                    let metadata = file.metadata()?;
                    if metadata.is_file() && metadata.nlink() == 1 && self.allowed(&metadata) {
                        files.push(path);
                    }
                }
            }
        }
        Ok(())
    }

    fn execute(&self, operation: Operation) -> Result<Value> {
        self.refresh_protected()?;
        match operation {
            Operation::Read { path } => {
                let (parent, name) = self.parent(&path)?;
                let bytes = self.read_at(&parent, name)?;
                Ok(json!({"bytes":STANDARD.encode(&bytes), "revision":revision(&bytes)}))
            }
            Operation::List { path } => {
                let parts = if path == "." {
                    vec![]
                } else {
                    self.checked(&path)?
                };
                let directory = self.directory(&parts)?;
                let mut files = Vec::new();
                self.list(
                    &directory,
                    if path == "." { "" } else { &path },
                    &mut files,
                    &mut 0,
                )?;
                files.sort();
                Ok(json!({"files":files}))
            }
            Operation::Create { path, bytes } => self.put(&path, &bytes, None),
            Operation::Write {
                path,
                bytes,
                revision,
            } => self.put(&path, &bytes, Some(&revision)),
        }
    }

    fn put(&self, path: &str, encoded: &str, expected: Option<&str>) -> Result<Value> {
        if encoded.len() > TEXT_LIMIT.div_ceil(3) * 4 {
            return Err(Failure("TOO_LARGE"));
        }
        let bytes = STANDARD
            .decode(encoded)
            .map_err(|_| Failure("INVALID_REQUEST"))?;
        if bytes.len() > TEXT_LIMIT {
            return Err(Failure("TOO_LARGE"));
        }
        let (parent, name) = self.parent(path)?;
        if let Some(expected) = expected
            && revision(&self.read_at(&parent, name)?) != expected
        {
            return Err(Failure("STALE_REVISION"));
        }
        let temporary = format!(".eidos-plugin-{:032x}.tmp", rand::random::<u128>());
        let mut options = OpenOptions::new();
        options
            .write(true)
            .create_new(true)
            .follow(FollowSymlinks::No);
        let mut file = parent.open_with(&temporary, &options)?;
        let result = (|| {
            file.write_all(&bytes)?;
            file.sync_all()?;
            if let Some(expected) = expected {
                // Preserve file permissions, and reject changes made while writing.
                let old = self.read_at(&parent, name)?;
                if revision(&old) != expected {
                    return Err(Failure("STALE_REVISION"));
                }
                let metadata = parent.symlink_metadata(name)?;
                file.set_permissions(metadata.permissions())?;
                parent.rename(&temporary, &parent, name)?;
            } else {
                // Publish only if absent, after all bytes have reached the temp file.
                parent.hard_link(&temporary, &parent, name)?;
            }
            Ok(json!({"revision": revision(&bytes)}))
        })();
        drop(file);
        let cleanup = parent.remove_file(&temporary);
        if result.is_ok() {
            cleanup.or_else(|e| {
                if e.kind() == io::ErrorKind::NotFound {
                    Ok(())
                } else {
                    Err(e)
                }
            })?;
        }
        result
    }
}

fn revision(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn frame(reader: &mut impl BufRead) -> io::Result<Option<Vec<u8>>> {
    let mut bytes = Vec::new();
    reader
        .take(FRAME_LIMIT as u64 + 1)
        .read_until(b'\n', &mut bytes)?;
    if bytes.len() > FRAME_LIMIT {
        return Err(io::Error::other("Plugin filesystem frame exceeds limit"));
    }
    if bytes.is_empty() {
        Ok(None)
    } else {
        Ok(Some(bytes))
    }
}

pub fn serve(root: &Path, denied: &[String]) -> io::Result<()> {
    let mut output = io::stdout().lock();
    let fs = Filesystem::open(root, denied).map_err(|e| io::Error::other(e.0))?;
    let metadata = fs.root.dir_metadata()?;
    writeln!(
        output,
        "{}",
        json!({"ready":1,"dev":metadata.dev().to_string(),"ino":metadata.ino().to_string()})
    )?;
    output.flush()?;
    let mut input = io::stdin().lock();
    while let Some(bytes) = frame(&mut input)? {
        let request: Request = serde_json::from_slice(&bytes)
            .map_err(|_| io::Error::other("Invalid filesystem frame"))?;
        let response = match fs.execute(request.operation) {
            Ok(value) => json!({"id":request.id,"result":value}),
            Err(error) => json!({"id":request.id,"error":{"code":error.0}}),
        };
        let serialized = response.to_string();
        if serialized.len() > FRAME_LIMIT {
            writeln!(
                output,
                "{}",
                json!({"id":request.id,"error":{"code":"TOO_LARGE"}})
            )?;
        } else {
            writeln!(output, "{serialized}")?;
        }
        output.flush()?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn create(filesystem: &Filesystem, path: &str, text: &str) -> Result<Value> {
        filesystem.execute(Operation::Create {
            path: path.into(),
            bytes: STANDARD.encode(text),
        })
    }

    #[test]
    fn read_create_write_and_conflict_preserve_bytes() {
        let root = tempfile::tempdir().unwrap();
        let filesystem = Filesystem::open(root.path(), &[]).unwrap();
        let created = create(&filesystem, "day.md", "hello").unwrap();
        assert_eq!(
            create(&filesystem, "day.md", "replace").unwrap_err().0,
            "ALREADY_EXISTS"
        );
        let request = Operation::Write {
            path: "day.md".into(),
            bytes: STANDARD.encode("world"),
            revision: created["revision"].as_str().unwrap().into(),
        };
        filesystem.execute(request).unwrap();
        let stale = Operation::Write {
            path: "day.md".into(),
            bytes: STANDARD.encode("lost"),
            revision: created["revision"].as_str().unwrap().into(),
        };
        assert_eq!(filesystem.execute(stale).unwrap_err().0, "STALE_REVISION");
        assert_eq!(fs::read(root.path().join("day.md")).unwrap(), b"world");
        assert_eq!(fs::read_dir(root.path()).unwrap().count(), 1);
    }

    #[test]
    fn rejects_paths_protected_roots_and_binary_backing_files() {
        let root = tempfile::tempdir().unwrap();
        let filesystem = Filesystem::open(root.path(), &["plugins".into()]).unwrap();
        for path in [
            "../outside",
            "/absolute",
            "C:/drive",
            "a\\b",
            "a//b",
            "a/../b",
            "a.",
            "a ",
            "",
        ] {
            assert_eq!(
                create(&filesystem, path, "no").unwrap_err().0,
                "INVALID_REQUEST"
            );
        }
        for path in [
            ".graft/state",
            "table.eidos",
            "PLUGIN.JSON",
            "plugins/main.ts",
            "bundle.eidos-plugin",
        ] {
            assert_eq!(
                create(&filesystem, path, "no").unwrap_err().0,
                "PERMISSION_DENIED"
            );
        }
    }

    #[test]
    fn list_is_recursive_sorted_and_excludes_protected_entries() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir(root.path().join("notes")).unwrap();
        fs::create_dir(root.path().join("plugins")).unwrap();
        fs::write(root.path().join("notes/b.md"), "b").unwrap();
        fs::write(root.path().join("a.md"), "a").unwrap();
        fs::write(root.path().join("plugins/extension.ts"), "code").unwrap();
        fs::write(root.path().join("data.eidos"), "sqlite").unwrap();
        let filesystem = Filesystem::open(root.path(), &["plugins".into()]).unwrap();
        let result = filesystem
            .execute(Operation::List { path: ".".into() })
            .unwrap();
        assert_eq!(result["files"], json!(["a.md", "notes/b.md"]));
    }

    #[test]
    fn rejects_hard_link_aliases() {
        let root = tempfile::tempdir().unwrap();
        fs::write(root.path().join("plugin.json"), "private").unwrap();
        fs::hard_link(
            root.path().join("plugin.json"),
            root.path().join("alias.md"),
        )
        .unwrap();
        let filesystem = Filesystem::open(root.path(), &[]).unwrap();
        assert_eq!(
            filesystem
                .execute(Operation::Read {
                    path: "alias.md".into()
                })
                .unwrap_err()
                .0,
            "PERMISSION_DENIED"
        );
        assert_eq!(
            filesystem
                .execute(Operation::List { path: ".".into() })
                .unwrap()["files"],
            json!([])
        );
    }

    #[test]
    fn renamed_protected_roots_keep_their_identity_and_replacements_are_denied() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir(root.path().join("plugins")).unwrap();
        fs::write(root.path().join("plugins/main.ts"), "private code").unwrap();
        let filesystem = Filesystem::open(root.path(), &["plugins".into()]).unwrap();
        fs::rename(root.path().join("plugins"), root.path().join("notes")).unwrap();
        assert_eq!(
            filesystem
                .execute(Operation::Read {
                    path: "notes/main.ts".into()
                })
                .unwrap_err()
                .0,
            "PERMISSION_DENIED"
        );
        fs::create_dir(root.path().join("plugins")).unwrap();
        fs::write(root.path().join("plugins/new.ts"), "new code").unwrap();
        assert_eq!(
            filesystem
                .execute(Operation::List { path: ".".into() })
                .unwrap()["files"],
            json!([])
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn unicode_filesystem_aliases_cannot_bypass_protected_roots() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir(root.path().join("caf\u{e9}")).unwrap();
        fs::write(root.path().join("caf\u{e9}/main.ts"), "private code").unwrap();
        let filesystem = Filesystem::open(root.path(), &["caf\u{e9}".into()]).unwrap();
        assert_eq!(
            filesystem
                .execute(Operation::Read {
                    path: "cafe\u{301}/main.ts".into()
                })
                .unwrap_err()
                .0,
            "PERMISSION_DENIED"
        );
    }

    #[test]
    fn rejects_oversized_and_malformed_frames_and_payloads() {
        let mut input = io::Cursor::new(vec![b'x'; FRAME_LIMIT + 1]);
        assert!(frame(&mut input).is_err());
        let root = tempfile::tempdir().unwrap();
        let filesystem = Filesystem::open(root.path(), &[]).unwrap();
        assert_eq!(
            create(&filesystem, "large.md", &"x".repeat(TEXT_LIMIT + 1))
                .unwrap_err()
                .0,
            "TOO_LARGE"
        );
        assert!(
            serde_json::from_str::<Request>(
                r#"{"id":1,"operation":{"method":"read","path":"a.md"}}"#
            )
            .is_ok()
        );
        assert!(
            serde_json::from_str::<Request>(
                r#"{"id":1,"operation":{"method":"read","path":"a.md","extra":true}}"#
            )
            .is_err()
        );
    }

    #[cfg(unix)]
    #[test]
    fn symlinks_in_every_component_are_rejected() {
        use std::os::unix::fs::symlink;
        let root = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        fs::write(outside.path().join("secret.md"), "private").unwrap();
        symlink(outside.path(), root.path().join("escape")).unwrap();
        symlink(
            outside.path().join("secret.md"),
            root.path().join("alias.md"),
        )
        .unwrap();
        let filesystem = Filesystem::open(root.path(), &[]).unwrap();
        for path in ["escape/secret.md", "alias.md"] {
            assert!(
                filesystem
                    .execute(Operation::Read { path: path.into() })
                    .is_err()
            );
            assert!(create(&filesystem, path, "replace").is_err());
        }
        assert_eq!(
            fs::read(outside.path().join("secret.md")).unwrap(),
            b"private"
        );
    }

    #[cfg(unix)]
    #[test]
    fn replacing_parent_after_open_does_not_redirect_io() {
        use std::os::unix::fs::symlink;
        let root = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        fs::create_dir(root.path().join("notes")).unwrap();
        fs::write(root.path().join("notes/day.md"), "inside").unwrap();
        fs::write(outside.path().join("day.md"), "outside").unwrap();
        let filesystem = Filesystem::open(root.path(), &[]).unwrap();
        let (parent, name) = filesystem.parent("notes/day.md").unwrap();
        fs::rename(root.path().join("notes"), root.path().join("moved")).unwrap();
        symlink(outside.path(), root.path().join("notes")).unwrap();
        assert_eq!(filesystem.read_at(&parent, name).unwrap(), b"inside");
        assert!(
            filesystem
                .execute(Operation::Read {
                    path: "notes/day.md".into()
                })
                .is_err()
        );
        assert!(create(&filesystem, "notes/new.md", "write").is_err());
        assert!(!outside.path().join("new.md").exists());
    }
}
