//! Canonical JSON (RFC 8785 JCS) for the Eidos subset (spec §5.3).
//!
//! Rules implemented here:
//! - object keys sorted in UTF-16 code unit order (NOT UTF-8 byte order:
//!   they differ for code points above U+FFFF, whose UTF-16 leading
//!   surrogates `D800..DBFF` sort before BMP code points `E000..FFFF`);
//! - arrays retain order; insignificant whitespace is absent;
//! - strings use the minimal JSON escapes (`\"`, `\\`, `\b`, `\f`, `\n`,
//!   `\r`, `\t`, and `\u00XX` lowercase for other C0 controls); all other
//!   characters, including non-ASCII, are emitted literally (no Unicode
//!   normalization);
//! - integers serialize in decimal; `-0` is normalized to `0`;
//! - finite binary64 values serialize in shortest round-trip form.
//!
//! KNOWN DIVERGENCE FROM RFC 8785: ECMAScript `JSON.stringify` switches to
//! exponent form for magnitudes `>= 1e21` and `< 1e-6` (e.g. `1e+21`,
//! `1e-7`); Rust's `{}` float formatting (Ryū shortest) never emits exponent
//! form, so those values serialize here as long plain decimals. The two
//! spellings denote the same binary64 value but differ byte-for-byte, which
//! matters for cross-implementation JCS equality checks. Affected values are
//! outside any spec-defined canonical encoding (Section 5.3 requires only
//! I-JSON conformance and binary64-compatible numbers), so the divergence is
//! documented rather than worked around in Phase 1.

use serde_json::Value;

use crate::error::{EidosError, Result};

/// Serializes `value` to RFC 8785 canonical JSON text.
///
/// Returns `invalid-value` for non-finite numbers (which `serde_json`
/// normally cannot produce, but `Value::from` can smuggle in via
/// `Number::from_f64`-adjacent paths) — canonical JSON numbers must be
/// finite binary64 values.
pub fn to_jcs(value: &Value) -> Result<String> {
    let mut out = String::new();
    write_value(value, &mut out)?;
    Ok(out)
}

/// Returns whether `text` is byte-identical to the canonical serialization
/// of its own parse: it parses as valid JSON and re-serializes to exactly
/// `text`. Duplicate object keys fail the byte-compare (the parse keeps one
/// value, the reserialization drops the other), so no separate duplicate-key
/// scan is needed.
pub fn is_canonical_jcs(text: &str) -> bool {
    let Ok(value) = serde_json::from_str::<Value>(text) else {
        return false;
    };
    match to_jcs(&value) {
        Ok(canonical) => canonical == text,
        Err(_) => false,
    }
}

fn write_value(value: &Value, out: &mut String) -> Result<()> {
    match value {
        Value::Null => out.push_str("null"),
        Value::Bool(true) => out.push_str("true"),
        Value::Bool(false) => out.push_str("false"),
        Value::Number(number) => write_number(number, out)?,
        Value::String(text) => write_string(text, out),
        Value::Array(items) => {
            out.push('[');
            for (index, item) in items.iter().enumerate() {
                if index > 0 {
                    out.push(',');
                }
                write_value(item, out)?;
            }
            out.push(']');
        }
        Value::Object(map) => {
            out.push('{');
            let mut keys: Vec<&String> = map.keys().collect();
            // UTF-16 code unit order, per RFC 8785 §3.2.3.
            keys.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
            for (index, key) in keys.iter().enumerate() {
                if index > 0 {
                    out.push(',');
                }
                write_string(key, out);
                out.push(':');
                write_value(&map[*key], out)?;
            }
            out.push('}');
        }
    }
    Ok(())
}

fn write_number(number: &serde_json::Number, out: &mut String) -> Result<()> {
    if let Some(int) = number.as_i64() {
        out.push_str(&int.to_string());
        return Ok(());
    }
    if let Some(uint) = number.as_u64() {
        out.push_str(&uint.to_string());
        return Ok(());
    }
    let float = number.as_f64().ok_or_else(|| {
        EidosError::Internal("serde_json::Number is neither i64, u64, nor f64".into())
    })?;
    if !float.is_finite() {
        return Err(EidosError::InvalidValue(
            "canonical JSON numbers must be finite binary64 values".into(),
        ));
    }
    // Normalize -0 to 0 (ECMAScript `JSON.stringify(-0)` is "0"), then
    // shortest round-trip via Rust's float Display (Ryū shortest; never
    // emits exponent form — see the module-level divergence note).
    // `float == 0.0` is true for both zeros.
    let normalized = if float == 0.0 { 0.0 } else { float };
    out.push_str(&format!("{normalized}"));
    Ok(())
}

fn write_string(text: &str, out: &mut String) {
    out.push('"');
    for ch in text.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\u{08}' => out.push_str("\\b"),
            '\u{0C}' => out.push_str("\\f"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            ch if (ch as u32) < 0x20 => {
                out.push_str(&format!("\\u{:04x}", ch as u32));
            }
            ch => out.push(ch),
        }
    }
    out.push('"');
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // Ported from packages/eidos-file/src/eidos-file-1.0-conformance.test.ts:
    // canonicalizeEidosFileJson({ z: [2, 1], a: -0 }) === '{"a":0,"z":[2,1]}'.
    #[test]
    fn canonicalizes_sorted_keys_and_normalizes_negative_zero() {
        let value = json!({ "z": [2, 1], "a": -0.0 });
        assert_eq!(to_jcs(&value).unwrap(), r#"{"a":0,"z":[2,1]}"#);
    }

    // Ported conformance vectors for isCanonicalEidosFileJson.
    #[test]
    fn accepts_only_byte_canonical_text() {
        assert!(is_canonical_jcs(r#"{"a":0,"z":[2,1]}"#));
        assert!(!is_canonical_jcs(r#"{ "z": [2,1], "a": 0 }"#));
        // Duplicate keys: parse keeps one, reserialization drops the other.
        assert!(!is_canonical_jcs(r#"{"a":1,"a":2}"#));
        assert!(!is_canonical_jcs("not json"));
        assert!(!is_canonical_jcs(r#""unterminated"#));
        // Non-minimal escapes are not canonical.
        assert!(!is_canonical_jcs(r#""\u0041""#));
        assert!(is_canonical_jcs(r#""A""#));
    }

    #[test]
    fn sorts_keys_in_utf16_code_unit_order() {
        // U+10FFFF encodes as UTF-16 surrogate pair DBFF DFFF; its leading
        // unit (0xDBFF) sorts before U+FFFD (0xFFFD) in UTF-16 order, but its
        // UTF-8 bytes (F4..) sort after U+FFFD's (EF..) in byte order.
        let mut map = serde_json::Map::new();
        map.insert("\u{FFFD}".to_string(), json!(1));
        map.insert("\u{10FFFF}".to_string(), json!(2));
        let value = Value::Object(map);
        assert_eq!(to_jcs(&value).unwrap(), "{\"\u{10FFFF}\":2,\"\u{FFFD}\":1}");
    }

    #[test]
    fn escapes_strings_minimally() {
        let value = json!("a\"b\\c\u{08}\u{0C}\n\r\t\u{01}\u{1F}é");
        assert_eq!(
            to_jcs(&value).unwrap(),
            r#""a\"b\\c\b\f\n\r\t\u0001\u001fé""#
        );
    }

    #[test]
    fn numbers_serialize_in_shortest_form() {
        assert_eq!(to_jcs(&json!(42)).unwrap(), "42");
        assert_eq!(to_jcs(&json!(-7)).unwrap(), "-7");
        assert_eq!(to_jcs(&json!(u64::MAX)).unwrap(), "18446744073709551615");
        assert_eq!(to_jcs(&json!(0.5)).unwrap(), "0.5");
        // ECMAScript `JSON.stringify(1.0)` is "1"; Rust Display agrees.
        assert_eq!(to_jcs(&json!(1.0)).unwrap(), "1");
        // ECMAScript `JSON.stringify(-0)` is "0"; Rust Display agrees.
        assert_eq!(to_jcs(&json!(-0.0)).unwrap(), "0");
    }

    #[test]
    fn arrays_keep_order_and_nesting_is_compact() {
        let value = json!([[3, 1], { "b": null, "a": true }, []]);
        assert_eq!(to_jcs(&value).unwrap(), r#"[[3,1],{"a":true,"b":null},[]]"#);
    }

    #[test]
    fn round_trips_canonical_text() {
        for text in [
            "null",
            "true",
            "[]",
            "{}",
            r#"[1,2.5,"x",{"k":[null,false]}]"#,
        ] {
            assert!(is_canonical_jcs(text), "{text}");
        }
    }
}
