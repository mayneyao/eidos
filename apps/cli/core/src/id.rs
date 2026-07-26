//! UUIDv7 identity (spec §5.1).
//!
//! Every persistent ID is a lowercase, hyphenated, 36-octet UUIDv7 TEXT
//! value: `xxxxxxxx-xxxx-7xxx-yxxx-xxxxxxxxxxxx` with `y` in `8/9/a/b`.

use uuid::Uuid;

use crate::error::{EidosError, Result};

/// Generates a fresh RFC 9562 UUIDv7 using the current Unix millisecond
/// timestamp, in the canonical lowercase hyphenated TEXT form.
pub fn generate_uuidv7() -> String {
    Uuid::now_v7().to_string()
}

/// Returns whether `value` is a canonical Eidos File UUIDv7:
/// exactly 36 octets, hyphens at positions 8/13/18/23 (0-based), version
/// nibble `7`, variant nibble in `8/9/a/b`, lowercase hex only.
///
/// This mirrors the SQL CHECK bodies in the §7 DDL exactly.
pub fn is_valid_uuidv7(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 36 {
        return false;
    }
    for (index, &byte) in bytes.iter().enumerate() {
        let ok = match index {
            8 | 13 | 18 | 23 => byte == b'-',
            14 => byte == b'7',
            19 => matches!(byte, b'8' | b'9' | b'a' | b'b'),
            _ => byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte),
        };
        if !ok {
            return false;
        }
    }
    true
}

/// Validates a canonical UUIDv7, or returns `invalid-value`.
pub fn assert_uuidv7(value: &str, label: &str) -> Result<()> {
    if is_valid_uuidv7(value) {
        Ok(())
    } else {
        Err(EidosError::InvalidValue(format!(
            "{label} must be a lowercase hyphenated UUIDv7"
        )))
    }
}

/// Returns the 32 lowercase hex digits of a canonical UUIDv7 with hyphens
/// removed. This is the `<table-id-hex>` / `<field-id-hex>` suffix used by
/// trigger and index naming (spec §10.4, §15); it is an identifier suffix
/// only, never an alternative ID representation.
pub fn uuid_hex(id: &str) -> Result<String> {
    assert_uuidv7(id, "ID")?;
    Ok(id.chars().filter(|&c| c != '-').collect())
}

/// First 8 hex digits of the ID (hyphens stripped), the default physical
/// name / trigger suffix form.
pub fn hex8(id: &str) -> Result<String> {
    Ok(uuid_hex(id)?[..8].to_string())
}

/// First `n` hex digits of the ID (hyphens stripped); `n` must be `8..=32`.
pub fn hex_prefix(id: &str, n: usize) -> Result<String> {
    let hex = uuid_hex(id)?;
    if n > 32 {
        return Err(EidosError::InvalidValue(
            "hex prefix length must be at most 32".into(),
        ));
    }
    Ok(hex[..n].to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    const ID: &str = "0198c72d-82b5-7968-b163-98be4b7477df";

    #[test]
    fn accepts_canonical_uuidv7() {
        assert!(is_valid_uuidv7(ID));
        assert!(is_valid_uuidv7("0198c0f4-7b10-7e2e-8bc9-f28a3e11a621"));
        assert!(assert_uuidv7(ID, "ID").is_ok());
    }

    #[test]
    fn rejects_non_canonical_ids() {
        // Uppercase is not canonical.
        assert!(!is_valid_uuidv7(&ID.to_uppercase()));
        // Unhyphenated 32-char form is not canonical.
        assert!(!is_valid_uuidv7(&ID.replace('-', "")));
        // Nil UUID (version nibble 0, not 7).
        assert!(!is_valid_uuidv7("00000000-0000-0000-0000-000000000000"));
        // Wrong version nibble.
        assert!(!is_valid_uuidv7("0198c72d-82b5-4968-b163-98be4b7477df"));
        // Wrong variant nibble.
        assert!(!is_valid_uuidv7("0198c72d-82b5-7968-c163-98be4b7477df"));
        // Non-hex / wrong length.
        assert!(!is_valid_uuidv7("0198c72d-82b5-7968-b163-98be4b7477dg"));
        assert!(!is_valid_uuidv7("0198c72d-82b5-7968-b163-98be4b7477d"));
        assert!(!is_valid_uuidv7(""));
    }

    #[test]
    fn generated_ids_are_valid_and_orderable() {
        let a = generate_uuidv7();
        let b = generate_uuidv7();
        assert!(is_valid_uuidv7(&a));
        assert!(is_valid_uuidv7(&b));
        assert_ne!(a, b);
    }

    #[test]
    fn hex_helpers_strip_hyphens() {
        assert_eq!(uuid_hex(ID).unwrap(), "0198c72d82b57968b16398be4b7477df");
        assert_eq!(hex8(ID).unwrap(), "0198c72d");
        assert_eq!(hex_prefix(ID, 12).unwrap(), "0198c72d82b5");
        assert!(uuid_hex("nope").is_err());
    }
}
