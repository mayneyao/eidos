//! Per-field-type validation and coercion from transport JSON to SQL
//! bindings (spec §5, §8, §9, §10.1, §19).
//!
//! The transport model is Eidos Runtime 1.0's logical-value boundary:
//! integers arrive as canonical signed int64 decimal strings (never JSON
//! numbers), JSON Fields arrive as strings containing JSON, and SQL NULL is
//! JSON `null`. For CLI ergonomics an integral JSON number is also accepted
//! for `integer`.
//!
//! Cardinality (`one`/`many`) of a Relation is NOT enforced here; the caller
//! applies it from `eidos__relation_fields` where applicable.

use rusqlite::types::Value as SqlValue;
use serde_json::Value as JsonValue;

use crate::error::{EidosError, Result};
use crate::id::is_valid_uuidv7;
use crate::jcs;
use crate::model::{FieldMeta, FieldType};
use crate::time::{is_valid_date, is_valid_instant};

/// Maximum elements in one Multi-select, Relation, or File array (spec §19).
pub const MAX_ARRAY_ELEMENTS: usize = 10_000;
/// Maximum octets of one canonical JSON cell (spec §19).
pub const MAX_JSON_CELL_OCTETS: usize = 16 * 1024 * 1024;
/// Maximum decoded octets of an inline image Data URL (spec §8.3).
pub const MAX_INLINE_IMAGE_OCTETS: u64 = 1_048_576;

fn invalid(field: &FieldMeta, message: impl Into<String>) -> EidosError {
    EidosError::InvalidValue(format!(
        "field {:?} ({}): {}",
        field.name,
        field.field_type.as_str(),
        message.into()
    ))
}

fn resource_limit(field: &FieldMeta, message: impl Into<String>) -> EidosError {
    EidosError::ResourceLimit(format!(
        "field {:?} ({}): {}",
        field.name,
        field.field_type.as_str(),
        message.into()
    ))
}

/// Validates and coerces one transport value for `field` into the SQL
/// binding for its physical column.
///
/// JSON `null` maps to SQL NULL exactly when `field.nullable` is set; the
/// array-typed fields (`multi-select`, `file`, forward `relation`) are
/// never nullable (`[]` is their empty value), so `null` is rejected there
/// and for any other `nullable = 0` field.
///
/// Virtual fields (inverse `relation`, `formula`, `lookup`) have no column;
/// coercing a value for them is an `invalid-request`.
pub fn coerce_value(field: &FieldMeta, value: &JsonValue) -> Result<SqlValue> {
    if value.is_null() {
        if field.nullable {
            return Ok(SqlValue::Null);
        }
        return Err(invalid(
            field,
            "null is not allowed for a non-nullable field",
        ));
    }
    match field.field_type {
        FieldType::Text | FieldType::Url | FieldType::Select => {
            let text = value
                .as_str()
                .ok_or_else(|| invalid(field, "value must be a string"))?;
            Ok(SqlValue::Text(text.to_string()))
        }
        FieldType::Number => {
            let float = value
                .as_f64()
                .filter(|f| f.is_finite())
                .ok_or_else(|| invalid(field, "value must be a finite binary64 number"))?;
            // Normalize -0 to +0 before storage (spec §8).
            Ok(SqlValue::Real(if float == 0.0 { 0.0 } else { float }))
        }
        FieldType::Integer => coerce_integer(field, value),
        FieldType::Checkbox => {
            let boolean = value
                .as_bool()
                .ok_or_else(|| invalid(field, "value must be a boolean"))?;
            Ok(SqlValue::Integer(i64::from(boolean)))
        }
        FieldType::Date => {
            let text = value
                .as_str()
                .filter(|text| is_valid_date(text))
                .ok_or_else(|| invalid(field, "value must use canonical YYYY-MM-DD text"))?;
            Ok(SqlValue::Text(text.to_string()))
        }
        FieldType::Datetime => {
            let text = value
                .as_str()
                .filter(|text| is_valid_instant(text))
                .ok_or_else(|| {
                    invalid(
                        field,
                        "value must use canonical YYYY-MM-DDTHH:MM:SS.sssZ text",
                    )
                })?;
            Ok(SqlValue::Text(text.to_string()))
        }
        FieldType::Json => {
            let text = value.as_str().ok_or_else(|| {
                invalid(field, "JSON Field values arrive as strings containing JSON")
            })?;
            let parsed: JsonValue = serde_json::from_str(text)
                .map_err(|_| invalid(field, "value is not valid JSON"))?;
            let canonical =
                jcs::to_jcs(&parsed).map_err(|_| invalid(field, "value is not valid I-JSON"))?;
            if canonical.len() > MAX_JSON_CELL_OCTETS {
                return Err(resource_limit(
                    field,
                    "value exceeds the 16 MiB canonical JSON cell limit",
                ));
            }
            Ok(SqlValue::Text(canonical))
        }
        FieldType::MultiSelect => {
            let items = string_array(field, value, "multi-select")?;
            let canonical =
                jcs::to_jcs(&JsonValue::Array(items)).expect("strings always serialize");
            Ok(SqlValue::Text(canonical))
        }
        FieldType::Relation => {
            let items = value
                .as_array()
                .ok_or_else(|| invalid(field, "Relation value must be a JSON array"))?;
            if items.len() > MAX_ARRAY_ELEMENTS {
                return Err(resource_limit(field, "Relation contains too many targets"));
            }
            let mut seen = std::collections::HashSet::with_capacity(items.len());
            for item in items {
                let id = item
                    .as_str()
                    .filter(|id| is_valid_uuidv7(id))
                    .ok_or_else(|| {
                        invalid(
                            field,
                            "Relation values must be lowercase hyphenated UUIDv7 strings",
                        )
                    })?;
                if !seen.insert(id.to_string()) {
                    return Err(invalid(field, "Relation target Row IDs must be unique"));
                }
            }
            let canonical = jcs::to_jcs(value).expect("validated UUID strings always serialize");
            Ok(SqlValue::Text(canonical))
        }
        FieldType::File => coerce_file(field, value),
        FieldType::Formula | FieldType::Lookup => Err(EidosError::InvalidRequest(format!(
            "field {:?} ({}) is virtual and has no stored column",
            field.name,
            field.field_type.as_str()
        ))),
    }
}

/// Shared unique-string-array coercion for `multi-select`.
fn string_array(field: &FieldMeta, value: &JsonValue, what: &str) -> Result<Vec<JsonValue>> {
    let items = value
        .as_array()
        .ok_or_else(|| invalid(field, format!("{what} value must be a JSON array")))?;
    if items.len() > MAX_ARRAY_ELEMENTS {
        return Err(resource_limit(
            field,
            format!("{what} value contains too many elements"),
        ));
    }
    let mut seen = std::collections::HashSet::with_capacity(items.len());
    for item in items {
        let text = item
            .as_str()
            .ok_or_else(|| invalid(field, format!("{what} elements must be strings")))?;
        if !seen.insert(text) {
            return Err(invalid(field, format!("{what} elements must be unique")));
        }
    }
    Ok(items.clone())
}

/// Canonical signed int64 decimal string per the Runtime logical-value
/// contract: `-?(?:0|[1-9][0-9]*)`.
fn coerce_integer(field: &FieldMeta, value: &JsonValue) -> Result<SqlValue> {
    let expect = || {
        invalid(
            field,
            "value must be a canonical signed int64 decimal string (or an integral JSON number)",
        )
    };
    match value {
        JsonValue::String(text) => {
            let digits = text.strip_prefix('-').unwrap_or(text);
            let canonical = !digits.is_empty()
                && digits.bytes().all(|b| b.is_ascii_digit())
                && (digits.len() == 1 || !digits.starts_with('0'))
                // "-0" is not a canonical int64 spelling.
                && !(text.starts_with('-') && digits == "0");
            if !canonical {
                return Err(expect());
            }
            let parsed: i64 = text.parse().map_err(|_| expect())?;
            Ok(SqlValue::Integer(parsed))
        }
        JsonValue::Number(number) => {
            // CLI ergonomics: accept an integral JSON number in int64 range.
            if let Some(int) = number.as_i64() {
                return Ok(SqlValue::Integer(int));
            }
            if let Some(uint) = number.as_u64() {
                let int = i64::try_from(uint).map_err(|_| expect())?;
                return Ok(SqlValue::Integer(int));
            }
            let float = number.as_f64().ok_or_else(expect)?;
            if !float.is_finite() || float.fract() != 0.0 || float.abs() > 9.007_199_254_740_992e15
            {
                return Err(expect());
            }
            let int = float as i64;
            if int as f64 != float {
                return Err(expect());
            }
            Ok(SqlValue::Integer(int))
        }
        _ => Err(expect()),
    }
}

/// Validates a §8.3 File array and returns the canonical JSON cell text.
fn coerce_file(field: &FieldMeta, value: &JsonValue) -> Result<SqlValue> {
    let entries = value
        .as_array()
        .ok_or_else(|| invalid(field, "File value must be a JSON array"))?;
    if entries.len() > MAX_ARRAY_ELEMENTS {
        return Err(resource_limit(
            field,
            "File value contains too many entries",
        ));
    }
    let bad_entry = || invalid(field, "File value contains an invalid entry");
    let mut ids = std::collections::HashSet::with_capacity(entries.len());
    for entry in entries {
        let object = entry.as_object().ok_or_else(bad_entry)?;
        let entry_id = object
            .get("id")
            .and_then(JsonValue::as_str)
            .filter(|id| is_valid_uuidv7(id))
            .ok_or_else(bad_entry)?;
        if !ids.insert(entry_id.to_string()) {
            return Err(bad_entry());
        }
        let name = object
            .get("name")
            .and_then(JsonValue::as_str)
            .ok_or_else(bad_entry)?;
        if name.is_empty() || name.contains('\0') {
            return Err(bad_entry());
        }
        let media_type = object
            .get("mediaType")
            .and_then(JsonValue::as_str)
            .filter(|mt| is_media_type(mt))
            .ok_or_else(bad_entry)?;
        let size = object
            .get("size")
            .and_then(JsonValue::as_str)
            .filter(|size| is_canonical_non_negative_int64(size))
            .ok_or_else(bad_entry)?;
        let uri = object
            .get("uri")
            .and_then(JsonValue::as_str)
            .ok_or_else(bad_entry)?;
        match uri_class(uri) {
            Some(UriClass::Relative) | Some(UriClass::Https) => {}
            Some(UriClass::Data) => {
                let (data_media_type, decoded_size) =
                    inline_image_data_url(uri).ok_or_else(bad_entry)?;
                if data_media_type != media_type
                    || decoded_size != size.parse::<u64>().map_err(|_| bad_entry())?
                {
                    return Err(bad_entry());
                }
            }
            None => return Err(bad_entry()),
        }
    }
    // Unknown members are preserved: re-serialize the validated array.
    let canonical = jcs::to_jcs(value).map_err(|_| bad_entry())?;
    if canonical.len() > MAX_JSON_CELL_OCTETS {
        return Err(resource_limit(
            field,
            "File value exceeds the 16 MiB canonical JSON limit",
        ));
    }
    Ok(SqlValue::Text(canonical))
}

/// RFC 6838 restricted-name check for `<type>/<subtype>` media types,
/// ported from `file-values.ts` (`MEDIA_TYPE_RESTRICTED_NAME`).
fn is_media_type(value: &str) -> bool {
    fn restricted_name(part: &str) -> bool {
        let mut bytes = part.bytes();
        match bytes.next() {
            Some(first) if first.is_ascii_alphanumeric() => {}
            _ => return false,
        }
        part.len() <= 127
            && bytes.all(|b| {
                b.is_ascii_alphanumeric()
                    || matches!(
                        b,
                        b'!' | b'#' | b'$' | b'&' | b'+' | b'.' | b'^' | b'_' | b'-'
                    )
            })
    }
    let Some(separator) = value.find('/') else {
        return false;
    };
    if separator != value.rfind('/').unwrap() {
        return false;
    }
    restricted_name(&value[..separator]) && restricted_name(&value[separator + 1..])
}

/// `^(?:0|[1-9][0-9]*)$` and at most `i64::MAX`.
fn is_canonical_non_negative_int64(value: &str) -> bool {
    if value.is_empty()
        || !value.bytes().all(|b| b.is_ascii_digit())
        || (value.len() > 1 && value.starts_with('0'))
    {
        return false;
    }
    value.parse::<u64>().is_ok_and(|n| n <= i64::MAX as u64)
}

/// RFC 3986 URI scheme prefix, e.g. `https:`.
fn has_uri_scheme(value: &str) -> bool {
    let mut chars = value.chars();
    match chars.next() {
        Some(first) if first.is_ascii_alphabetic() => {}
        _ => return false,
    }
    let mut saw_colon = false;
    for ch in chars {
        match ch {
            ':' => {
                saw_colon = true;
                break;
            }
            c if c.is_ascii_alphanumeric() || matches!(c, '+' | '.' | '-') => {}
            _ => return false,
        }
    }
    saw_colon
}

/// Allowed visible-ASCII / percent-triplet charset from `file-values.ts`
/// (`URI_REFERENCE_ASCII`).
fn is_uri_reference_ascii(value: &str) -> bool {
    let bytes = value.as_bytes();
    let mut index = 0;
    while index < bytes.len() {
        let byte = bytes[index];
        if byte == b'%' {
            if index + 2 >= bytes.len()
                || !bytes[index + 1].is_ascii_hexdigit()
                || !bytes[index + 2].is_ascii_hexdigit()
            {
                return false;
            }
            index += 3;
            continue;
        }
        let allowed = byte.is_ascii_alphanumeric()
            || matches!(
                byte,
                b'-' | b'.'
                    | b'_'
                    | b'~'
                    | b'!'
                    | b'$'
                    | b'&'
                    | b'\''
                    | b'('
                    | b')'
                    | b'*'
                    | b'+'
                    | b','
                    | b';'
                    | b'='
                    | b':'
                    | b'@'
                    | b'/'
                    | b'?'
                    | b'#'
                    | b'['
                    | b']'
            );
        if !allowed {
            return false;
        }
        index += 1;
    }
    true
}

/// Percent-decodes like `decodeURIComponent` (fails on malformed UTF-8).
fn percent_decode(value: &str) -> Option<String> {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            let hex = |b: u8| -> Option<u8> {
                match b {
                    b'0'..=b'9' => Some(b - b'0'),
                    b'a'..=b'f' => Some(b - b'a' + 10),
                    b'A'..=b'F' => Some(b - b'A' + 10),
                    _ => None,
                }
            };
            if index + 2 >= bytes.len() {
                return None;
            }
            out.push(hex(bytes[index + 1])? * 16 + hex(bytes[index + 2])?);
            index += 3;
        } else {
            out.push(bytes[index]);
            index += 1;
        }
    }
    String::from_utf8(out).ok()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum UriClass {
    Relative,
    Https,
    Data,
}

const BASE64_ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/// Canonical padded RFC 4648 Base64 (standard alphabet, zero padding bits);
/// returns the decoded length. Ported from `decodedBase64Size`.
fn decoded_base64_size(payload: &str) -> Option<u64> {
    if payload.is_empty() || !payload.len().is_multiple_of(4) {
        return None;
    }
    let bytes = payload.as_bytes();
    let padding = if payload.ends_with("==") {
        2
    } else if payload.ends_with('=') {
        1
    } else {
        0
    };
    let body_len = bytes.len() - padding;
    if !bytes[..body_len]
        .iter()
        .all(|b| BASE64_ALPHABET.contains(b))
    {
        return None;
    }
    // Canonical encoding requires the unused low bits of the last quantum
    // character to be zero.
    let value_of = |b: u8| {
        BASE64_ALPHABET
            .iter()
            .position(|&a| a == b)
            .map(|p| p as u8)
    };
    if padding == 2 {
        let last = value_of(*bytes.get(bytes.len().checked_sub(3)?)?)?;
        if last & 0b1111 != 0 {
            return None;
        }
    } else if padding == 1 {
        let last = value_of(*bytes.get(bytes.len().checked_sub(2)?)?)?;
        if last & 0b11 != 0 {
            return None;
        }
    }
    Some(bytes.len() as u64 / 4 * 3 - padding as u64)
}

/// Parses a canonical inline image Data URL; returns
/// `(media_type, decoded_size)`. Ported from `inlineImageDataUrl`.
fn inline_image_data_url(uri: &str) -> Option<(&str, u64)> {
    let rest = uri.strip_prefix("data:")?;
    let marker = ";base64,";
    let marker_index = rest.find(marker)?;
    if rest[marker_index + 1..].contains(marker) {
        return None;
    }
    let media_type = &rest[..marker_index];
    let payload = &rest[marker_index + marker.len()..];
    if !media_type.starts_with("image/")
        || media_type.bytes().any(|b| b.is_ascii_uppercase())
        || !is_media_type(media_type)
    {
        return None;
    }
    let decoded_size = decoded_base64_size(payload)?;
    if !(1..=MAX_INLINE_IMAGE_OCTETS).contains(&decoded_size) {
        return None;
    }
    Some((media_type, decoded_size))
}

/// Contained relative reference per §8.3: no scheme, no authority, ASCII
/// charset, and the percent-decoded path neither is absolute nor escapes
/// the File's directory after dot-segment removal.
fn is_contained_relative_uri(uri: &str) -> bool {
    if !is_uri_reference_ascii(uri)
        || uri.contains('\\')
        || uri.starts_with('/')
        || has_uri_scheme(uri)
    {
        return false;
    }
    let path_end = uri.find(['?', '#']).unwrap_or(uri.len());
    let path = &uri[..path_end];
    let Some(decoded) = percent_decode(path) else {
        return false;
    };
    if decoded.starts_with('/') || decoded.contains('\\') {
        return false;
    }
    let mut depth: u32 = 0;
    for part in decoded.split('/') {
        if part.is_empty() || part == "." {
            continue;
        }
        if part == ".." {
            if depth == 0 {
                return false;
            }
            depth -= 1;
        } else {
            depth += 1;
        }
    }
    true
}

/// Normalizes a contained relative File URI for filesystem-backed hosts.
///
/// Publish deliberately rejects query/fragment components and encoded path
/// separators because they do not have an unambiguous local-file meaning. The
/// returned tuple is `(canonical_uri, decoded_relative_path)`. URI segments
/// use the same encoding as JavaScript `encodeURIComponent`, which is also the
/// canonical form produced by the TypeScript Runtime helper.
pub fn normalize_relative_file_uri(uri: &str) -> Option<(String, String)> {
    if uri.contains(['?', '#'])
        || contains_ascii_case_insensitive(uri, "%2f")
        || contains_ascii_case_insensitive(uri, "%5c")
        || !is_contained_relative_uri(uri)
    {
        return None;
    }
    let decoded = percent_decode(uri)?;
    let mut parts: Vec<&str> = Vec::new();
    for part in decoded.split('/') {
        if part.is_empty() || part == "." {
            continue;
        }
        if part == ".." {
            parts.pop()?;
        } else {
            parts.push(part);
        }
    }
    if parts.is_empty() {
        return None;
    }
    let path = parts.join("/");
    let canonical_uri = parts
        .iter()
        .map(|part| encode_uri_component(part))
        .collect::<Vec<_>>()
        .join("/");
    Some((canonical_uri, path))
}

fn contains_ascii_case_insensitive(value: &str, needle: &str) -> bool {
    value
        .as_bytes()
        .windows(needle.len())
        .any(|window| window.eq_ignore_ascii_case(needle.as_bytes()))
}

fn encode_uri_component(value: &str) -> String {
    let mut encoded = String::with_capacity(value.len());
    const HEX: &[u8; 16] = b"0123456789ABCDEF";
    for byte in value.as_bytes() {
        if byte.is_ascii_alphanumeric()
            || matches!(
                byte,
                b'-' | b'_' | b'.' | b'!' | b'~' | b'*' | b'\'' | b'(' | b')'
            )
        {
            encoded.push(char::from(*byte));
        } else {
            encoded.push('%');
            encoded.push(char::from(HEX[(byte >> 4) as usize]));
            encoded.push(char::from(HEX[(byte & 0x0f) as usize]));
        }
    }
    encoded
}

/// Classifies a §8.3 File-entry URI. The `https` arm approximates WHATWG
/// URL parsing with the §8.3 ASCII charset plus a non-empty authority —
/// full RFC 3986 validation is the semantic validation phase's job.
fn uri_class(uri: &str) -> Option<UriClass> {
    if uri.starts_with("data:") {
        return inline_image_data_url(uri).map(|_| UriClass::Data);
    }
    if uri.len() >= "https://".len() && uri[..8].eq_ignore_ascii_case("https://") {
        let rest = &uri[8..];
        let authority_end = rest.find(['/', '?', '#']).unwrap_or(rest.len());
        if authority_end > 0 && is_uri_reference_ascii(uri) {
            return Some(UriClass::Https);
        }
        return None;
    }
    is_contained_relative_uri(uri).then_some(UriClass::Relative)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const ID: &str = "0198c72d-82b5-7968-b163-98be4b7477df";
    const OTHER_ID: &str = "0198c72d-82b5-7968-a163-98be4b7477df";

    fn field(name: &str, field_type: FieldType, nullable: bool) -> FieldMeta {
        FieldMeta {
            id: ID.to_string(),
            table_id: OTHER_ID.to_string(),
            name: name.to_string(),
            physical_name: Some(name.to_string()),
            field_type,
            system_role: None,
            nullable,
            position: 0,
            settings_json: "{}".to_string(),
            created_at: "2025-07-01T00:00:00.000Z".to_string(),
            updated_at: "2025-07-01T00:00:00.000Z".to_string(),
        }
    }

    #[test]
    fn text_url_select_take_strings() {
        for ty in [FieldType::Text, FieldType::Url, FieldType::Select] {
            let f = field("c", ty, true);
            assert_eq!(
                coerce_value(&f, &json!("hello")).unwrap(),
                SqlValue::Text("hello".into())
            );
            assert!(coerce_value(&f, &json!(1)).is_err());
            assert_eq!(coerce_value(&f, &json!(null)).unwrap(), SqlValue::Null);
            let required = field("c", ty, false);
            assert!(coerce_value(&required, &json!(null)).is_err());
        }
    }

    #[test]
    fn number_requires_finite_and_normalizes_negative_zero() {
        let f = field("n", FieldType::Number, true);
        assert_eq!(coerce_value(&f, &json!(-0.0)).unwrap(), SqlValue::Real(0.0));
        assert_eq!(coerce_value(&f, &json!(1.5)).unwrap(), SqlValue::Real(1.5));
        assert!(coerce_value(&f, &json!("1.5")).is_err());
        // serde_json::Value cannot hold a non-finite f64 (From<f64> maps NaN
        // to Null; Number::from_f64 returns None), so the finite check in
        // the coercion is a defensive net only.
    }

    #[test]
    fn integer_accepts_decimal_string_and_integral_number() {
        let f = field("i", FieldType::Integer, true);
        assert_eq!(
            coerce_value(&f, &json!("9223372036854775807")).unwrap(),
            SqlValue::Integer(i64::MAX)
        );
        assert_eq!(
            coerce_value(&f, &json!("-9223372036854775808")).unwrap(),
            SqlValue::Integer(i64::MIN)
        );
        assert_eq!(coerce_value(&f, &json!("0")).unwrap(), SqlValue::Integer(0));
        assert_eq!(coerce_value(&f, &json!(42)).unwrap(), SqlValue::Integer(42));
        // Rejected: leading zeros, empty, non-canonical, out of range, fraction.
        for bad in ["01", "", "-0", "1.5", "9223372036854775808", "+1"] {
            assert!(coerce_value(&f, &json!(bad)).is_err(), "{bad}");
        }
        assert!(coerce_value(&f, &json!(1.5)).is_err());
        assert!(coerce_value(&f, &json!(9.3e18)).is_err());
        assert!(coerce_value(&f, &json!(true)).is_err());
    }

    #[test]
    fn checkbox_maps_to_zero_one() {
        let f = field("b", FieldType::Checkbox, true);
        assert_eq!(
            coerce_value(&f, &json!(true)).unwrap(),
            SqlValue::Integer(1)
        );
        assert_eq!(
            coerce_value(&f, &json!(false)).unwrap(),
            SqlValue::Integer(0)
        );
        assert!(coerce_value(&f, &json!(1)).is_err());
    }

    #[test]
    fn date_and_datetime_require_canonical_text() {
        let d = field("d", FieldType::Date, true);
        assert_eq!(
            coerce_value(&d, &json!("2024-02-29")).unwrap(),
            SqlValue::Text("2024-02-29".into())
        );
        assert!(coerce_value(&d, &json!("2023-02-29")).is_err());
        let dt = field("t", FieldType::Datetime, true);
        assert_eq!(
            coerce_value(&dt, &json!("2025-07-01T12:00:00.000Z")).unwrap(),
            SqlValue::Text("2025-07-01T12:00:00.000Z".into())
        );
        assert!(coerce_value(&dt, &json!("2025-07-01T12:00:00Z")).is_err());
    }

    #[test]
    fn json_field_canonicalizes_string_payload() {
        let f = field("j", FieldType::Json, true);
        assert_eq!(
            coerce_value(&f, &json!("{ \"b\": 1, \"a\": [2, null] }")).unwrap(),
            SqlValue::Text(r#"{"a":[2,null],"b":1}"#.into())
        );
        // JSON literal null arrives as the string "null" and stays text.
        assert_eq!(
            coerce_value(&f, &json!("null")).unwrap(),
            SqlValue::Text("null".into())
        );
        // SQL NULL is transport null.
        assert_eq!(coerce_value(&f, &json!(null)).unwrap(), SqlValue::Null);
        assert!(coerce_value(&f, &json!("[1,")).is_err());
        assert!(coerce_value(&f, &json!({"a": 1})).is_err());
    }

    #[test]
    fn multi_select_requires_unique_strings() {
        let f = field("m", FieldType::MultiSelect, false);
        assert_eq!(
            coerce_value(&f, &json!(["b", "a"])).unwrap(),
            SqlValue::Text(r#"["b","a"]"#.into())
        );
        assert_eq!(
            coerce_value(&f, &json!([])).unwrap(),
            SqlValue::Text("[]".into())
        );
        assert!(coerce_value(&f, &json!(["a", "a"])).is_err());
        assert!(coerce_value(&f, &json!(["a", 1])).is_err());
        assert!(coerce_value(&f, &json!(null)).is_err());
    }

    // Ported from eidos-file-1.0-conformance.test.ts relation-value vectors.
    #[test]
    fn relation_encodes_ordered_unique_uuid_arrays() {
        let f = field("r", FieldType::Relation, false);
        assert_eq!(
            coerce_value(&f, &json!([ID, OTHER_ID])).unwrap(),
            SqlValue::Text(format!(r#"["{ID}","{OTHER_ID}"]"#))
        );
        assert_eq!(
            coerce_value(&f, &json!([])).unwrap(),
            SqlValue::Text("[]".into())
        );
        // Duplicates rejected (conformance: encodeEidosFileRelationIds([ID, ID])).
        let err = coerce_value(&f, &json!([ID, ID])).unwrap_err();
        assert_eq!(err.code(), "invalid-value");
        assert!(err.to_string().contains("unique"));
        // Non-array rejected (conformance: decodeEidosFileRelationIds("null")).
        assert!(coerce_value(&f, &json!("not-an-array")).is_err());
        // Non-UUIDv7 members rejected.
        assert!(coerce_value(&f, &json!(["xyz"])).is_err());
        assert!(coerce_value(&f, &json!([ID.to_uppercase()])).is_err());
    }

    #[test]
    fn file_entries_validate_and_preserve_unknown_members() {
        let f = field("f", FieldType::File, false);
        let entry = json!({
            "id": ID,
            "name": "diagram.png",
            "mediaType": "image/png",
            "size": "18234",
            "uri": "assets/diagram.png",
            "x-custom": { "kept": true }
        });
        let out = coerce_value(&f, &json!([entry])).unwrap();
        let SqlValue::Text(text) = out else {
            panic!("expected text")
        };
        assert_eq!(
            text,
            format!(
                r#"[{{"id":"{ID}","mediaType":"image/png","name":"diagram.png","size":"18234","uri":"assets/diagram.png","x-custom":{{"kept":true}}}}]"#
            )
        );

        // https URI class.
        let https = json!([{
            "id": ID, "name": "a", "mediaType": "text/plain",
            "size": "0", "uri": "https://example.com/a.txt"
        }]);
        assert!(coerce_value(&f, &https).is_ok());

        // Inline image data URL: mediaType must match and size must equal
        // the decoded payload length.
        let data = json!([{
            "id": ID, "name": "dot.png", "mediaType": "image/png",
            "size": "68",
            "uri": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
        }]);
        assert!(coerce_value(&f, &data).is_ok());
        let wrong_size = json!([{
            "id": ID, "name": "dot.png", "mediaType": "image/png",
            "size": "67",
            "uri": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
        }]);
        assert!(coerce_value(&f, &wrong_size).is_err());
        let wrong_type = json!([{
            "id": ID, "name": "dot.png", "mediaType": "image/jpeg",
            "size": "68",
            "uri": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
        }]);
        assert!(coerce_value(&f, &wrong_type).is_err());
    }

    #[test]
    fn file_entries_reject_bad_shapes() {
        let f = field("f", FieldType::File, false);
        let base = json!({
            "id": ID, "name": "a", "mediaType": "text/plain",
            "size": "1", "uri": "assets/a.txt"
        });
        // Missing member.
        let mut missing = base.clone();
        missing.as_object_mut().unwrap().remove("uri");
        assert!(coerce_value(&f, &json!([missing])).is_err());
        // Duplicate entry ids.
        assert!(coerce_value(&f, &json!([base.clone(), base.clone()])).is_err());
        // Bad size spellings.
        for size in ["01", "-1", "1.0", "9223372036854775808", ""] {
            let mut entry = base.clone();
            entry["size"] = json!(size);
            assert!(coerce_value(&f, &json!([entry])).is_err(), "size {size}");
        }
        // Escaping relative URIs.
        for uri in [
            "../x",
            "a/../../x",
            "/abs/x",
            "http://x/y",
            "C:\\x",
            "%2e%2e/x",
        ] {
            let mut entry = base.clone();
            entry["uri"] = json!(uri);
            assert!(coerce_value(&f, &json!([entry])).is_err(), "uri {uri}");
        }
        // Empty name, bad media type.
        let mut entry = base.clone();
        entry["name"] = json!("");
        assert!(coerce_value(&f, &json!([entry])).is_err());
        let mut entry = base.clone();
        entry["mediaType"] = json!("not a type");
        assert!(coerce_value(&f, &json!([entry])).is_err());
    }

    #[test]
    fn virtual_fields_have_no_column() {
        for ty in [FieldType::Formula, FieldType::Lookup] {
            let f = field("v", ty, true);
            let err = coerce_value(&f, &json!(1)).unwrap_err();
            assert_eq!(err.code(), "invalid-request");
        }
    }

    #[test]
    fn uri_classes() {
        assert_eq!(uri_class("assets/diagram.png"), Some(UriClass::Relative));
        assert_eq!(uri_class("a/./b/../c"), Some(UriClass::Relative));
        assert_eq!(uri_class("https://example.com/x"), Some(UriClass::Https));
        assert_eq!(uri_class("https://"), None);
        assert_eq!(
            uri_class("data:image/png;base64,AAAA"),
            Some(UriClass::Data)
        );
        // Unpadded length that is not a multiple of 4 is not canonical.
        assert_eq!(uri_class("data:image/png;base64,AAA"), None);
        // Padding in the middle of the payload is not canonical.
        assert_eq!(uri_class("data:image/png;base64,AA=A"), None);
        // Data URL with non-image media type.
        assert_eq!(uri_class("data:text/plain;base64,AAAA"), None);
        // Non-base64 data URL.
        assert_eq!(uri_class("data:image/png,xyz"), None);
    }

    #[test]
    fn normalizes_relative_file_uris_for_filesystem_hosts() {
        assert_eq!(
            normalize_relative_file_uri("assets/a/../hello%20world%40.png"),
            Some((
                "assets/hello%20world%40.png".into(),
                "assets/hello world@.png".into()
            ))
        );
        assert_eq!(normalize_relative_file_uri("../outside"), None);
        assert_eq!(normalize_relative_file_uri("assets/a%2Fb.png"), None);
        assert_eq!(normalize_relative_file_uri("assets/a.png?download=1"), None);
    }
}
