//! Canonical date and instant values (spec §5.2).
//!
//! A date is exactly `YYYY-MM-DD`; an instant is exactly the 24-octet UTC
//! millisecond form `YYYY-MM-DDTHH:MM:SS.sssZ`, year `0001..=9999`, no leap
//! seconds.

use chrono::{Datelike, NaiveDate, NaiveTime, Timelike, Utc};

use crate::error::{EidosError, Result};

/// Returns the current canonical UTC instant (`YYYY-MM-DDTHH:MM:SS.sssZ`).
pub fn now_instant() -> String {
    let now = Utc::now();
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        now.year(),
        now.month(),
        now.day(),
        now.hour(),
        now.minute(),
        now.second(),
        now.timestamp_subsec_millis()
    )
}

fn parse_digits(bytes: &[u8], range: std::ops::Range<usize>) -> Option<u32> {
    let mut value: u32 = 0;
    for &byte in &bytes[range] {
        if !byte.is_ascii_digit() {
            return None;
        }
        value = value * 10 + u32::from(byte - b'0');
    }
    Some(value)
}

/// Returns whether `value` is a canonical `YYYY-MM-DD` calendar date with a
/// real day (year `0001..=9999`, leap years honored).
pub fn is_valid_date(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 10 || bytes[4] != b'-' || bytes[7] != b'-' {
        return false;
    }
    let (Some(year), Some(month), Some(day)) = (
        parse_digits(bytes, 0..4),
        parse_digits(bytes, 5..7),
        parse_digits(bytes, 8..10),
    ) else {
        return false;
    };
    if year == 0 {
        return false;
    }
    NaiveDate::from_ymd_opt(year as i32, month, day).is_some()
}

/// Returns whether `value` is the canonical 24-octet instant
/// `YYYY-MM-DDTHH:MM:SS.sssZ`: real calendar date, `HH <= 23`,
/// `MM <= 59`, `SS <= 59` (leap-second spellings are not canonical).
pub fn is_valid_instant(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 24
        || bytes[4] != b'-'
        || bytes[7] != b'-'
        || bytes[10] != b'T'
        || bytes[13] != b':'
        || bytes[16] != b':'
        || bytes[19] != b'.'
        || bytes[23] != b'Z'
    {
        return false;
    }
    let (Some(year), Some(month), Some(day), Some(hour), Some(minute), Some(second), Some(millis)) = (
        parse_digits(bytes, 0..4),
        parse_digits(bytes, 5..7),
        parse_digits(bytes, 8..10),
        parse_digits(bytes, 11..13),
        parse_digits(bytes, 14..16),
        parse_digits(bytes, 17..19),
        parse_digits(bytes, 20..23),
    ) else {
        return false;
    };
    if year == 0 {
        return false;
    }
    NaiveDate::from_ymd_opt(year as i32, month, day).is_some()
        && NaiveTime::from_hms_milli_opt(hour, minute, second, millis).is_some()
}

/// Validates a canonical date, or returns `invalid-value`.
pub fn assert_date(value: &str, label: &str) -> Result<()> {
    if is_valid_date(value) {
        Ok(())
    } else {
        Err(EidosError::InvalidValue(format!(
            "{label} must use canonical YYYY-MM-DD text"
        )))
    }
}

/// Validates a canonical instant, or returns `invalid-value`.
pub fn assert_instant(value: &str, label: &str) -> Result<()> {
    if is_valid_instant(value) {
        Ok(())
    } else {
        Err(EidosError::InvalidValue(format!(
            "{label} must use canonical YYYY-MM-DDTHH:MM:SS.sssZ text"
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn now_instant_is_canonical() {
        let instant = now_instant();
        assert_eq!(instant.len(), 24);
        assert!(is_valid_instant(&instant));
    }

    #[test]
    fn date_validation_matches_spec() {
        assert!(is_valid_date("2025-07-01"));
        assert!(is_valid_date("0001-01-01"));
        assert!(is_valid_date("9999-12-31"));
        assert!(is_valid_date("2024-02-29")); // leap year
        assert!(!is_valid_date("2023-02-29")); // not a leap year
        assert!(!is_valid_date("0000-01-01")); // year 0000 excluded
        assert!(!is_valid_date("2025-13-01"));
        assert!(!is_valid_date("2025-07-1"));
        assert!(!is_valid_date("2025/07/01"));
        assert!(!is_valid_date(""));
    }

    #[test]
    fn instant_validation_matches_spec() {
        assert!(is_valid_instant("2025-07-01T12:34:56.789Z"));
        assert!(is_valid_instant("0001-01-01T00:00:00.000Z"));
        assert!(is_valid_instant("9999-12-31T23:59:59.999Z"));
        assert!(!is_valid_instant("2025-07-01T24:00:00.000Z"));
        assert!(!is_valid_instant("2025-07-01T23:59:60.000Z")); // no leap seconds
        assert!(!is_valid_instant("2023-02-29T00:00:00.000Z"));
        assert!(!is_valid_instant("2025-07-01T12:34:56.789+00:00")); // offsets not canonical
        assert!(!is_valid_instant("2025-07-01 12:34:56.789Z"));
        assert!(!is_valid_instant("2025-07-01T12:34:56.78Z")); // 23 octets
        assert!(!is_valid_instant("0000-01-01T00:00:00.000Z"));
    }
}
