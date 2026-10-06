//! Canonical user-visible SQLite naming (spec §6).

use crate::error::{EidosError, Result};

/// Maximum UTF-8 octets for a display or physical name (spec §19).
pub const MAX_NAME_OCTETS: usize = 1024;

/// SQLite `NOCASE` folds ASCII `A`-`Z` only (spec §6.1).
pub fn sqlite_nocase(value: &str) -> String {
    value.to_ascii_lowercase()
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

pub fn is_reserved_table_name(name: &str) -> bool {
    let folded = sqlite_nocase(name);
    folded.starts_with("sqlite_") || folded.starts_with("eidos__")
}

/// Validates a Table display/physical name. Canonical user Tables never map
/// into another persistent SQLite identifier.
pub fn assert_table_name(name: &str) -> Result<()> {
    assert_display_name(name, "Table name")?;
    if is_reserved_table_name(name) {
        return Err(EidosError::InvalidValue(
            "Table name must not begin with sqlite_ or eidos__".into(),
        ));
    }
    Ok(())
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

    #[test]
    fn accepts_direct_user_names() {
        for name in ["项目", "Project Status", "Order", "x__vendor__Tasks"] {
            assert_table_name(name).unwrap();
        }
    }

    #[test]
    fn rejects_reserved_table_names() {
        for name in ["sqlite_Foo", "SQLITE_Foo", "eidos__Tasks", "EIDOS__Tasks"] {
            let error = assert_table_name(name).unwrap_err();
            assert!(error.to_string().contains("must not begin"));
        }
    }

    #[test]
    fn rejects_invalid_display_names() {
        assert!(assert_table_name("").is_err());
        assert!(assert_table_name("a\0b").is_err());
        assert!(assert_table_name(&"a".repeat(1025)).is_err());
    }

    #[test]
    fn quotes_identifiers() {
        assert_eq!(quote_identifier("项目 表").unwrap(), "\"项目 表\"");
        assert_eq!(quote_identifier("a\"b").unwrap(), "\"a\"\"b\"");
        assert!(quote_identifier("a\0b").is_err());
    }
}
