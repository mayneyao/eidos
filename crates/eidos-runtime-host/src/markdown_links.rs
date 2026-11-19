//! Link maintenance for Markdown file operations in native hosts.
use anyhow::{ensure, Result};
use percent_encoding::{
    percent_decode_str, utf8_percent_encode, AsciiSet, CONTROLS, NON_ALPHANUMERIC,
};
use pulldown_cmark::{CowStr, Event, LinkType, Options, Parser, Tag, TagEnd};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{fs, ops::Range, path::Path};

const MAX_MARKDOWN_BYTES: u64 = 2 * 1024 * 1024;

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
const MOVED_URI: &AsciiSet = &NON_ALPHANUMERIC
    .remove(b'-')
    .remove(b'.')
    .remove(b'_')
    .remove(b'~')
    .remove(b'/');

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

fn parent(path: &str) -> &str {
    path.rsplit_once('/').map_or("", |(parent, _)| parent)
}

fn relative_destination(from: &str, to: &str) -> String {
    let from: Vec<_> = from.split('/').filter(|p| !p.is_empty()).collect();
    let to: Vec<_> = to.split('/').collect();
    let shared = from.iter().zip(&to).take_while(|(a, b)| a == b).count();
    [vec![".."; from.len() - shared], to[shared..].to_vec()]
        .concat()
        .join("/")
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
    let parent = parent(owner);
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
        relative_destination(parent, target)
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
        if fs::metadata(&path)?.len() > MAX_MARKDOWN_BYTES {
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

/// Pulldown borrows plain destinations directly from the source. A destination with
/// escapes or entities owns its decoded text, so locate its token after the label.
fn raw_destination<'a>(dest: &CowStr<'a>, after_label: &'a str) -> Option<&'a str> {
    if let CowStr::Borrowed(raw) = dest {
        return Some(raw);
    }
    let tail = after_label.trim_start_matches(|c: char| c.is_ascii_whitespace());
    if tail.is_empty() {
        return None;
    }
    let angled = tail.starts_with('<');
    let raw = if angled { &tail[1..] } else { tail };
    let mut depth = 0;
    let mut chars = raw.char_indices().peekable();
    while let Some((index, c)) = chars.next() {
        match c {
            '\\' if chars.peek().is_some_and(|(_, c)| c.is_ascii_punctuation()) => {
                chars.next();
            }
            '>' if angled => return Some(&raw[..index]),
            ')' if !angled && depth == 0 => return Some(&raw[..index]),
            c if !angled && c.is_ascii_whitespace() => return Some(&raw[..index]),
            '(' if !angled => depth += 1,
            ')' if !angled => depth -= 1,
            _ => {}
        }
    }
    (!angled).then_some(raw)
}

fn source_range(text: &str, slice: &str) -> Option<Range<usize>> {
    let start = (slice.as_ptr() as usize).checked_sub(text.as_ptr() as usize)?;
    let end = start.checked_add(slice.len())?;
    (end <= text.len()).then_some(start..end)
}

fn moved_relative_destination(
    root: &Path,
    source: &str,
    target: &str,
    value: &str,
) -> Option<String> {
    let path = value.split(['#', '?']).next()?;
    if path.is_empty() || path.starts_with('/') || path.split('/').next()?.contains(':') {
        return None;
    }
    let decoded = percent_decode_str(path).decode_utf8().ok()?;
    if decoded.starts_with('/')
        || decoded.chars().any(|c| c == '\\' || c.is_ascii_control())
        || decoded
            .split('/')
            .any(|part| part.starts_with('.') && part != "." && part != "..")
    {
        return None;
    }
    let before = normalize(&format!("{}/{decoded}", parent(source)))?;
    let original = root.join(&before);
    if !original.is_file() || original.canonicalize().ok()? != original {
        return None;
    }
    let after = if before == source { target } else { &before };
    if normalize(&format!("{}/{decoded}", parent(target))).as_deref() == Some(after) {
        return None;
    }
    Some(utf8_percent_encode(&relative_destination(parent(target), after), MOVED_URI).to_string())
}

fn rewrite_document_move(text: &str, root: &Path, source: &str, target: &str) -> String {
    let parser = Parser::new_ext(
        text,
        Options::ENABLE_TABLES | Options::ENABLE_YAML_STYLE_METADATA_BLOCKS,
    );
    let mut replacements = vec![];
    let mut collect = |dest: &CowStr<'_>, after_label: &str| {
        let Some(next) = moved_relative_destination(root, source, target, dest) else {
            return;
        };
        let Some(raw) = raw_destination(dest, after_label) else {
            return;
        };
        let mut path_len = raw.find(['#', '?']).unwrap_or(raw.len());
        if !matches!(dest, CowStr::Borrowed(_)) {
            // Check the token against the parser before editing an escaped destination.
            // Numeric entities in the path and entity-encoded URL delimiters are ambiguous
            // here, so leave the source intact if the path token can't be isolated.
            path_len = raw[..path_len].trim_end_matches('\\').len();
            let candidate = format!("[x](<{}>)", &raw[..path_len]);
            let parsed_path = dest.split(['#', '?']).next().unwrap_or_default();
            if !Parser::new(&candidate).any(|event| {
                matches!(event, Event::Start(Tag::Link { dest_url, .. }) if dest_url.as_ref() == parsed_path)
            }) {
                return;
            }
        }
        if let Some(span) = source_range(text, &raw[..path_len]).filter(|span| !span.is_empty()) {
            let next = if text[..span.start].ends_with('<') {
                next.replace("%20", " ")
            } else {
                next
            };
            replacements.push((span, next));
        }
    };
    for (_, definition) in parser.reference_definitions().iter() {
        let raw = &text[definition.span.clone()];
        let after_label = raw
            .match_indices("]:")
            .find(|&(index, _)| {
                (index - raw[..index].trim_end_matches('\\').len()).is_multiple_of(2)
            })
            .map_or("", |(index, _)| &raw[index + 2..]);
        collect(&definition.dest, after_label);
    }
    let mut links = vec![];
    let mut last_end = 0;
    for (event, range) in parser.into_offset_iter() {
        match event {
            Event::Start(
                Tag::Link {
                    link_type,
                    dest_url,
                    ..
                }
                | Tag::Image {
                    link_type,
                    dest_url,
                    ..
                },
            ) => {
                links.push((link_type, dest_url));
                last_end = range.start;
            }
            Event::End(TagEnd::Link | TagEnd::Image) => {
                if let Some((LinkType::Inline, dest)) = links.pop() {
                    let after_label = text
                        .get(last_end..range.end)
                        .and_then(|tail| tail.split_once("]("))
                        .map_or("", |(_, tail)| tail);
                    collect(&dest, after_label);
                }
                last_end = range.end;
            }
            _ => last_end = range.end,
        }
    }
    replacements.sort_by_key(|(span, _)| span.start);
    let mut result = text.to_owned();
    for (span, replacement) in replacements.into_iter().rev() {
        result.replace_range(span, &replacement);
    }
    result
}

/// Prepare the moving document's outbound links before the host changes its location.
pub fn prepare_document_move(root: &Path, request: &Value) -> Result<Value> {
    let source = request["source"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("Missing source"))?;
    let target = request["target"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("Missing target"))?;
    ensure!(
        [source, target]
            .iter()
            .all(|path| { !path.is_empty() && normalize(path).as_deref() == Some(path) }),
        "Invalid link path"
    );
    let root = root.canonicalize()?;
    let path = root.join(source).canonicalize()?;
    ensure!(
        path == root.join(source) && path.is_file(),
        "Invalid document path"
    );
    if parent(source) == parent(target) || fs::metadata(&path)?.len() > MAX_MARKDOWN_BYTES {
        return Ok(json!({}));
    }
    let bytes = fs::read(path)?;
    let Ok(text) = std::str::from_utf8(&bytes) else {
        return Ok(json!({}));
    };
    let rewritten = rewrite_document_move(text, &root, source, target);
    Ok(if rewritten == text {
        json!({})
    } else {
        json!({"text":rewritten,"version":format!("{:x}",Sha256::digest(&bytes))})
    })
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

    #[test]
    fn document_move_rebases_only_resolved_relative_paths_from_the_old_folder() -> Result<()> {
        let directory = tempfile::tempdir()?;
        let root = directory.path().canonicalize()?;
        fs::create_dir_all(root.join("Notes with spaces/assets"))?;
        fs::create_dir_all(root.join("Archive/2026"))?;
        for name in ["photo one.png", "photo(2).png", "a&b.png"] {
            fs::write(root.join("Notes with spaces/assets").join(name), b"fixture")?;
        }
        fs::write(root.join("table.eidos"), b"fixture")?;
        let source = "Notes with spaces/Note.md";
        let target = "Archive/2026/Note.md";
        let text = concat!(
            "![main](assets/photo%20one.png \"assets/photo%20one.png\")\r\n\r\n",
            "![angle](<assets/photo one.png>) ![ref][photo]\r\n\r\n",
            "[photo]: assets/photo%20one.png?v=1&amp;x=2#part 'Title'\r\n\r\n",
            "![escaped](assets/photo\\(2\\).png) ![entity](assets/a&amp;b.png)\r\n\r\n",
            "[other](../table.eidos#section) [self](./Note.md#section)\r\n\r\n",
            "[web](https://example.test/assets/photo%20one.png) [email](mailto:a@b.test)\r\n",
            "![root](/Notes%20with%20spaces/assets/photo%20one.png) ![missing](assets/no.png)\r\n",
            "![outside](../../secret.png) [fragment](#section)\r\n",
            "\x60![code](assets/photo%20one.png)\x60\r\n",
        );
        fs::write(root.join(source), text)?;
        let plan = prepare_document_move(&root, &json!({"source": source, "target": target}))?;
        assert_eq!(
            plan["text"].as_str().unwrap(),
            concat!(
                "![main](../../Notes%20with%20spaces/assets/photo%20one.png \"assets/photo%20one.png\")\r\n\r\n",
                "![angle](<../../Notes with spaces/assets/photo one.png>) ![ref][photo]\r\n\r\n",
                "[photo]: ../../Notes%20with%20spaces/assets/photo%20one.png?v=1&amp;x=2#part 'Title'\r\n\r\n",
                "![escaped](../../Notes%20with%20spaces/assets/photo%282%29.png) ![entity](../../Notes%20with%20spaces/assets/a%26b.png)\r\n\r\n",
                "[other](../../table.eidos#section) [self](./Note.md#section)\r\n\r\n",
                "[web](https://example.test/assets/photo%20one.png) [email](mailto:a@b.test)\r\n",
                "![root](/Notes%20with%20spaces/assets/photo%20one.png) ![missing](assets/no.png)\r\n",
                "![outside](../../secret.png) [fragment](#section)\r\n",
                "\x60![code](assets/photo%20one.png)\x60\r\n",
            )
        );
        assert_eq!(plan["version"], format!("{:x}", Sha256::digest(text)));
        assert_eq!(fs::read_to_string(root.join(source))?, text);
        assert!(!root.join(target).exists());
        Ok(())
    }
}
