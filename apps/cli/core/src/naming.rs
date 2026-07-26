//! Display-first physical naming (spec §6).
//!
//! `physical_name` defaults to the display name. A fallback is used only on
//! a NOCASE collision, a reserved field name (`_id`, `_created_at`,
//! `_updated_at`), or a reserved table prefix (`sqlite_`, `eidos__`, `x__`,
//! ASCII case-insensitive).

use crate::error::{EidosError, Result};
use crate::id::uuid_hex;

/// Maximum UTF-8 octets for a display or physical name (spec §19).
pub const MAX_NAME_OCTETS: usize = 1024;

/// Which kind of object is being named; the reserved-name rules differ.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PhysicalNameKind {
    Table,
    Field,
}

/// SQLite `NOCASE` folds ASCII `A`-`Z` only (spec §6.1).
fn sqlite_nocase(value: &str) -> String {
    value.to_ascii_lowercase()
}

/// Longest prefix of `value` whose UTF-8 encoding is at most `limit`
/// octets, never splitting a Unicode scalar value.
fn utf8_prefix(value: &str, limit: usize) -> &str {
    let mut end = 0;
    for (index, ch) in value.char_indices() {
        let next = index + ch.len_utf8();
        if next > limit {
            break;
        }
        end = next;
    }
    &value[..end]
}

/// Validates a display name: 1..=1024 UTF-8 octets, no U+0000.
/// (Rust strings already exclude lone surrogates by construction.)
pub fn assert_display_name(name: &str, label: &str) -> Result<()> {
    if name.is_empty() || name.contains('\0') || name.len() > MAX_NAME_OCTETS {
        return Err(EidosError::InvalidValue(format!(
            "{label} must be 1..1024 UTF-8 octets, contain Unicode scalar values, and exclude U+0000"
        )));
    }
    Ok(())
}

fn is_reserved_physical_name(kind: PhysicalNameKind, display_name: &str) -> bool {
    let folded = sqlite_nocase(display_name);
    match kind {
        PhysicalNameKind::Field => {
            matches!(folded.as_str(), "_id" | "_created_at" | "_updated_at")
        }
        PhysicalNameKind::Table => ["sqlite_", "eidos__", "x__"]
            .iter()
            .any(|prefix| folded.starts_with(prefix)),
    }
}

/// Applies the display-first physical naming rule from spec §6.2.
///
/// `existing_names` are the physical names already occupied in the same
/// namespace, compared under SQLite's ASCII-only NOCASE behavior; callers
/// exclude the object being renamed. Fallback suffixes grow
/// `8 -> 12 -> 32` hex digits of the stable object ID; the display prefix is
/// truncated on a Unicode scalar boundary to fit the 1024-octet limit.
/// Reserved-prefix tables use the isolated `t__<8 hex>__<display name>` form.
///
/// Returns `already-exists` when even the 32-digit candidate collides; the
/// spec forbids inventing another persistent mapping.
pub fn eidos_file_physical_name(
    kind: PhysicalNameKind,
    display_name: &str,
    stable_id: &str,
    existing_names: &[String],
) -> Result<String> {
    assert_display_name(
        display_name,
        match kind {
            PhysicalNameKind::Table => "Table name",
            PhysicalNameKind::Field => "Field name",
        },
    )?;
    let id_hex = uuid_hex(stable_id)?;
    let existing: std::collections::HashSet<String> = existing_names
        .iter()
        .map(|name| sqlite_nocase(name))
        .collect();
    let available = |candidate: &str| !existing.contains(&sqlite_nocase(candidate));

    if kind == PhysicalNameKind::Table && is_reserved_physical_name(kind, display_name) {
        for length in [8usize, 12, 32] {
            let prefix = format!("t__{}__", &id_hex[..length]);
            let candidate = format!(
                "{prefix}{}",
                utf8_prefix(display_name, MAX_NAME_OCTETS - prefix.len())
            );
            if available(&candidate) {
                return Ok(candidate);
            }
        }
        return Err(EidosError::AlreadyExists(format!(
            "unable to allocate a physical table name for {display_name:?}"
        )));
    }
    if !is_reserved_physical_name(kind, display_name) && available(display_name) {
        return Ok(display_name.to_string());
    }
    for length in [8usize, 12, 32] {
        let suffix = format!("__{}", &id_hex[..length]);
        let candidate = format!(
            "{}{suffix}",
            utf8_prefix(display_name, MAX_NAME_OCTETS - suffix.len())
        );
        if available(&candidate) {
            return Ok(candidate);
        }
    }
    Err(EidosError::AlreadyExists(format!(
        "unable to allocate a physical {} name for {display_name:?}",
        match kind {
            PhysicalNameKind::Table => "table",
            PhysicalNameKind::Field => "field",
        }
    )))
}

/// Quotes a physical name as a SQLite identifier: `"` + the name with every
/// `"` doubled + `"` (spec §6.1). Values are never identifier-quoted.
pub fn quote_identifier(identifier: &str) -> Result<String> {
    if identifier.contains('\0') {
        return Err(EidosError::InvalidValue(
            "SQLite identifiers must not contain U+0000".into(),
        ));
    }
    Ok(format!("\"{}\"", identifier.replace('"', "\"\"")))
}

#[cfg(test)]
mod tests {
    use super::*;

    const ID: &str = "0198c72d-82b5-7968-b163-98be4b7477df";
    const OTHER_ID: &str = "0198c72d-82b5-7968-a163-98be4b7477df";

    fn names(items: &[&str]) -> Vec<String> {
        items.iter().map(|s| s.to_string()).collect()
    }

    // Ported from packages/eidos-file/src/eidos-file-1.0-conformance.test.ts.
    #[test]
    fn uses_display_names_physically_until_collision() {
        assert_eq!(
            eidos_file_physical_name(PhysicalNameKind::Table, "项目", ID, &[]).unwrap(),
            "项目"
        );
        assert_eq!(
            eidos_file_physical_name(PhysicalNameKind::Field, "Project Status", ID, &[]).unwrap(),
            "Project Status"
        );
        assert_eq!(
            eidos_file_physical_name(PhysicalNameKind::Field, "_id", ID, &[]).unwrap(),
            "_id__0198c72d"
        );
        assert_eq!(
            eidos_file_physical_name(
                PhysicalNameKind::Field,
                "Status",
                OTHER_ID,
                &names(&["status"])
            )
            .unwrap(),
            "Status__0198c72d"
        );
        assert_eq!(
            eidos_file_physical_name(
                PhysicalNameKind::Table,
                "tasks",
                OTHER_ID,
                &names(&["Tasks"])
            )
            .unwrap(),
            "tasks__0198c72d"
        );
    }

    // Ported from packages/eidos-file/src/eidos-file-1.0-conformance.test.ts.
    #[test]
    fn maps_reserved_prefix_table_names_into_isolated_namespace() {
        for name in [
            "sqlite_Foo",
            "SQLITE_Foo",
            "eidos__Tasks",
            "EIDOS__Tasks",
            "x__vendor__Tasks",
            "X__vendor__Tasks",
        ] {
            assert_eq!(
                eidos_file_physical_name(PhysicalNameKind::Table, name, ID, &[]).unwrap(),
                format!("t__0198c72d__{name}")
            );
        }
    }

    #[test]
    fn reserved_field_names_and_suffix_growth() {
        for name in ["_id", "_ID", "_created_at", "_Updated_At"] {
            let physical =
                eidos_file_physical_name(PhysicalNameKind::Field, name, ID, &[]).unwrap();
            assert!(
                physical.starts_with(&format!("{name}__0198c72d")),
                "{physical}"
            );
            assert_eq!(physical, format!("{name}__0198c72d"));
        }
        // 8-digit suffix collides -> grows to 12 digits.
        let physical = eidos_file_physical_name(
            PhysicalNameKind::Field,
            "_id",
            ID,
            &names(&["_id__0198c72d"]),
        )
        .unwrap();
        assert_eq!(physical, "_id__0198c72d82b5");
        // 8 and 12 collide -> grows to 32 digits.
        let physical = eidos_file_physical_name(
            PhysicalNameKind::Field,
            "_id",
            ID,
            &names(&["_id__0198c72d", "_id__0198c72d82b5"]),
        )
        .unwrap();
        assert_eq!(physical, "_id__0198c72d82b57968b16398be4b7477df");
        // All candidates collide -> already-exists.
        let err = eidos_file_physical_name(
            PhysicalNameKind::Field,
            "_id",
            ID,
            &names(&[
                "_id__0198c72d",
                "_id__0198c72d82b5",
                "_id__0198c72d82b57968b16398be4b7477df",
            ]),
        )
        .unwrap_err();
        assert_eq!(err.code(), "already-exists");
    }

    #[test]
    fn truncates_on_unicode_scalar_boundary() {
        // 1021 ASCII chars + a 4-octet scalar: prefix must drop the scalar so
        // that prefix + "__" + 8 hex digits (10 octets) fits in 1024.
        let mut display = "a".repeat(1015);
        display.push('\u{1F600}'); // 4 octets -> 1019
        display.push_str("bbbb"); // 1023 total
        let physical = eidos_file_physical_name(
            PhysicalNameKind::Field,
            &display,
            ID,
            &names(&[display.as_str()]),
        )
        .unwrap();
        // suffix is 10 octets, so the display prefix is at most 1014 octets.
        assert!(physical.len() <= MAX_NAME_OCTETS);
        assert!(physical.ends_with("__0198c72d"));
        assert!(!physical.contains('\u{1F600}'));
    }

    #[test]
    fn rejects_invalid_display_names() {
        assert!(eidos_file_physical_name(PhysicalNameKind::Table, "", ID, &[]).is_err());
        assert!(eidos_file_physical_name(PhysicalNameKind::Table, "a\0b", ID, &[]).is_err());
        let too_long = "a".repeat(1025);
        assert!(eidos_file_physical_name(PhysicalNameKind::Table, &too_long, ID, &[]).is_err());
        assert!(
            eidos_file_physical_name(PhysicalNameKind::Table, "ok", "not-a-uuid", &[]).is_err()
        );
    }

    #[test]
    fn quotes_identifiers() {
        assert_eq!(quote_identifier("项目 表").unwrap(), "\"项目 表\"");
        assert_eq!(quote_identifier("a\"b").unwrap(), "\"a\"\"b\"");
        assert!(quote_identifier("a\0b").is_err());
    }
}
