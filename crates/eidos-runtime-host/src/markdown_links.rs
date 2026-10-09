//! Link maintenance for same-folder Markdown renames in native hosts.
use anyhow::{ensure, Result};
use percent_encoding::{percent_decode_str, utf8_percent_encode, AsciiSet, CONTROLS};
use pulldown_cmark::{Event, Options, Parser, Tag};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{fs, path::Path};

const URI: &AsciiSet = &CONTROLS
    .add(b' ')
    .add(b'"')
    .add(b'<')
    .add(b'>')
    .add(b'[')
    .add(b']')
    .add(b'(')
    .add(b')')
    .add(b'#')
    .add(b'?')
    .add(b'%')
    .add(b'\\');

fn normalize(value: &str) -> Option<String> {
    let mut parts = vec![];
    for part in value.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop()?;
            }
            _ => parts.push(part),
        }
    }
    Some(parts.join("/"))
}

fn destination(
    value: &str,
    owner: &str,
    source: &str,
    target: &str,
    files: &[String],
    wiki: bool,
) -> Option<String> {
    if value.contains("://")
        || value.starts_with('#')
        || value.starts_with("//")
        || value.split('/').next()?.contains(':')
    {
        return None;
    }
    let suffix_start = value.find(['#', '?']).unwrap_or(value.len());
    let original = &value[..suffix_start];
    let decoded = percent_decode_str(original).decode_utf8().ok()?;
    let parent = owner
        .rsplit_once('/')
        .map(|(parent, _)| parent)
        .unwrap_or("");
    let candidates = [
        normalize(decoded.trim_start_matches('/')),
        normalize(&format!("{parent}/{decoded}")),
    ];
    let found = if wiki {
        candidates
            .iter()
            .flatten()
            .find_map(|candidate| {
                files.iter().find(|file| {
                    *file == candidate
                        || *file == &format!("{candidate}.md")
                        || *file == &format!("{candidate}.markdown")
                })
            })
            .or_else(|| {
                let matching: Vec<_> = files
                    .iter()
                    .filter(|file| {
                        let name = file.rsplit('/').next().unwrap_or(file);
                        name == decoded
                            || name.strip_suffix(".md") == Some(decoded.as_ref())
                            || name.strip_suffix(".markdown") == Some(decoded.as_ref())
                    })
                    .collect();
                (matching.len() == 1).then(|| matching[0])
            })
    } else {
        let candidate = if decoded.starts_with('/') {
            candidates[0].as_ref()
        } else {
            candidates[1].as_ref()
        }?;
        files.iter().find(|file| *file == candidate)
    }?;
    if found != source {
        return None;
    }
    let mut next = if wiki {
        let basename = target.rsplit('/').next().unwrap_or(target);
        let same_basename = files
            .iter()
            .filter(|file| file.rsplit('/').next() == Some(basename) && file.as_str() != source)
            .count();
        if !decoded.contains('/') && same_basename == 0 {
            basename.to_owned()
        } else {
            target.to_owned()
        }
    } else if decoded.starts_with('/') {
        format!("/{target}")
    } else {
        let from: Vec<_> = parent.split('/').filter(|p| !p.is_empty()).collect();
        let to: Vec<_> = target.split('/').collect();
        let shared = from.iter().zip(&to).take_while(|(a, b)| a == b).count();
        [vec![".."; from.len() - shared], to[shared..].to_vec()]
            .concat()
            .join("/")
    };
    if wiki && !decoded.ends_with(".md") && !decoded.ends_with(".markdown") {
        if let Some(stem) = next
            .strip_suffix(".md")
            .or_else(|| next.strip_suffix(".markdown"))
        {
            next = stem.to_owned();
        }
    }
    Some(format!(
        "{}{}",
        if wiki {
            next
        } else {
            utf8_percent_encode(&next, URI).to_string()
        },
        &value[suffix_start..]
    ))
}

fn rewrite(text: &str, owner: &str, source: &str, target: &str, files: &[String]) -> String {
    let parser = Parser::new_ext(text, Options::ENABLE_WIKILINKS);
    let mut replacements = vec![];
    for (_, definition) in parser.reference_definitions().iter() {
        if let Some(next) = destination(&definition.dest, owner, source, target, files, false) {
            let raw = &text[definition.span.clone()];
            if let Some(position) = raw.find(definition.dest.as_ref()) {
                replacements.push((
                    definition.span.start + position,
                    definition.span.start + position + definition.dest.len(),
                    next,
                ));
            }
        }
    }
    for (event, range) in parser.into_offset_iter() {
        let dest = match event {
            Event::Start(Tag::Link { dest_url, .. })
            | Event::Start(Tag::Image { dest_url, .. }) => dest_url,
            _ => continue,
        };
        let raw = &text[range.clone()];
        let wiki = raw.starts_with("[[") || raw.starts_with("![[");
        if !wiki && !raw.contains("](") {
            continue;
        }
        if let Some(next) = destination(&dest, owner, source, target, files, wiki) {
            let position = if wiki {
                raw.find(dest.as_ref())
            } else {
                raw.rfind(dest.as_ref())
            };
            if let Some(position) = position {
                replacements.push((
                    range.start + position,
                    range.start + position + dest.len(),
                    next,
                ));
            }
        }
    }
    replacements.sort_by_key(|(start, _, _)| *start);
    replacements.dedup_by_key(|(start, _, _)| *start);
    let mut result = text.to_owned();
    for (start, end, replacement) in replacements.into_iter().rev() {
        result.replace_range(start..end, &replacement);
    }
    result
}

pub fn prepare(root: &Path, request: &Value) -> Result<Value> {
    let source = request["source"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("Missing source"))?;
    let target = request["target"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("Missing target"))?;
    ensure!(
        normalize(source).as_deref() == Some(source)
            && normalize(target).as_deref() == Some(target),
        "Invalid link path"
    );
    ensure!(
        Path::new(source).parent() == Path::new(target).parent(),
        "Only same-folder Markdown rename is supported"
    );
    let root = root.canonicalize()?;
    let mut pending = vec![root.clone()];
    let mut files = vec![];
    while let Some(folder) = pending.pop() {
        ensure!(files.len() < 20_000, "Space exceeds link maintenance limit");
        for entry in fs::read_dir(folder)? {
            let entry = entry?;
            if entry.file_name().to_string_lossy().starts_with('.') {
                continue;
            }
            let kind = entry.file_type()?;
            if kind.is_dir() {
                pending.push(entry.path());
            } else if kind.is_file() {
                files.push(
                    entry
                        .path()
                        .strip_prefix(&root)?
                        .to_string_lossy()
                        .replace('\\', "/"),
                );
            }
        }
    }
    let namespace: Vec<_> = files
        .iter()
        .map(|file| {
            if file == target {
                source.to_owned()
            } else {
                file.clone()
            }
        })
        .collect();
    let mut changes = vec![];
    for file in files.iter().filter(|file| {
        file.to_lowercase().ends_with(".md") || file.to_lowercase().ends_with(".markdown")
    }) {
        let path = root.join(file);
        if fs::metadata(&path)?.len() > 2 * 1024 * 1024 {
            continue;
        }
        let bytes = fs::read(&path)?;
        let Ok(text) = std::str::from_utf8(&bytes) else {
            continue;
        };
        let rewritten = rewrite(
            text,
            if file == target { source } else { file },
            source,
            target,
            &namespace,
        );
        if rewritten != text {
            changes.push(json!({"path":file,"text":rewritten,"version":format!("{:x}",Sha256::digest(&bytes))}));
        }
    }
    Ok(json!({"changes":changes}))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rewrites_links_references_wiki_and_fragments_but_preserves_code() {
        let files = vec!["notes/Old.md".into(), "index.md".into()];
        let text = "[a](notes/Old.md#part) [[Old|alias]]\n\n[x][ref]\n\n[ref]: notes/Old.md\n\n`[[Old]]`\n\n```\n[a](notes/Old.md)\n```\n";
        assert_eq!(rewrite(text,"index.md","notes/Old.md","notes/New Title.md",&files), "[a](notes/New%20Title.md#part) [[New Title|alias]]\n\n[x][ref]\n\n[ref]: notes/New%20Title.md\n\n`[[Old]]`\n\n```\n[a](notes/Old.md)\n```\n");
    }
    #[test]
    fn ambiguous_wiki_and_remote_links_are_preserved() {
        let files = vec!["a/Old.md".into(), "b/Old.md".into()];
        assert_eq!(
            rewrite(
                "[[Old]] [url](https://example.com/a/Old.md)",
                "index.md",
                "a/Old.md",
                "a/New.md",
                &files
            ),
            "[[Old]] [url](https://example.com/a/Old.md)"
        );
    }
}
