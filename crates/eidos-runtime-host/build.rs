use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{collections::BTreeMap, fs, path::Path};

fn collect(root: &Path, relative: &str, files: &mut BTreeMap<String, String>) {
    let path = root.join(relative);
    if path.is_dir() {
        for entry in fs::read_dir(&path).expect("read generated asset directory") {
            let name = entry.expect("read asset entry").file_name();
            let name = name.to_str().expect("UTF-8 asset path");
            if name != "manifest.json" {
                collect(root, &format!("{relative}/{name}"), files);
            }
        }
    } else {
        let mut bytes =
            fs::read(&path).unwrap_or_else(|error| panic!("{}: {error}", path.display()));
        if matches!(
            path.extension().and_then(|value| value.to_str()),
            Some(
                "js" | "mjs"
                    | "cjs"
                    | "ts"
                    | "tsx"
                    | "json"
                    | "html"
                    | "css"
                    | "svg"
                    | "sql"
                    | "md"
            )
        ) {
            bytes = String::from_utf8(bytes)
                .expect("UTF-8 source asset")
                .replace("\r\n", "\n")
                .into_bytes();
        }
        files.insert(relative.into(), format!("{:x}", Sha256::digest(bytes)));
    }
}

fn verify(root: &Path, relative: &str, command: &str) {
    let path = root.join(relative).join("manifest.json");
    println!("cargo:rerun-if-changed={}", path.display());
    let manifest: Value = fs::read(&path)
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_else(|| {
            panic!(
                "Missing asset manifest {}. Run `{command}`.",
                path.display()
            )
        });
    for section in ["inputs", "outputs"] {
        let mut actual = BTreeMap::new();
        for relative in manifest[section]["roots"].as_array().expect("asset roots") {
            let relative = relative.as_str().expect("asset root path");
            println!("cargo:rerun-if-changed={}", root.join(relative).display());
            collect(root, relative, &mut actual);
        }
        let expected: BTreeMap<String, String> =
            serde_json::from_value(manifest[section]["files"].clone()).expect("asset hashes");
        assert!(
            actual == expected,
            "Stale {relative} {section}. Run `{command}`."
        );
    }
}

fn main() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    verify(
        &root,
        "packages/eidos-file/generated/quickjs",
        "pnpm --filter @eidos.space/eidos-file build:quickjs",
    );
    if std::env::var_os("CARGO_FEATURE_SERVE").is_some() {
        verify(
            &root,
            "packages/eidos-file-serve/generated/ui",
            "pnpm --filter @eidos.space/eidos-file-serve build",
        );
    }
}
