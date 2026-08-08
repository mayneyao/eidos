use std::path::Path;

fn main() {
    let ui = Path::new(env!("CARGO_MANIFEST_DIR")).join("ui");
    println!("cargo:rerun-if-changed={}", ui.display());
    if !ui.join("index.html").is_file() {
        panic!(
            "serve UI not built: {} is missing index.html.\n\
             Run `pnpm --filter @eidos.space/eidos-file-serve build` first.",
            ui.display()
        );
    }
}
