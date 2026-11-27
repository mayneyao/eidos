//! Calendar & IANA timezone resolution using `jiff` (replaces `moment-timezone`),
//! including `TODAY()`, `calendar-period`, and `calendar-window` query compilation.

use std::collections::HashMap;

use eidos_file_core::model::{FieldMeta, FieldType};
use eidos_file_core::query::{FilterNode, RowQuery};
use jiff::civil::{Date, date};
use jiff::tz::TimeZone;
use jiff::{Timestamp, ToSpan};
use serde_json::Value as JsonValue;

use crate::contract::{CalendarContext, RuntimeErrorPayload, RuntimeResult};

const MIN_YEAR: i16 = 1970;
const MAX_YEAR: i16 = 2499;

/// Half-open bounds for a calendar period or window:
/// - `[start_date, end_date)` for `date` fields
/// - `[start_instant, end_instant)` for `datetime` fields (UTC RFC 3339 milliseconds)
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CalendarBounds {
    pub start_date: String,
    pub end_date: String,
    pub start_instant: String,
    pub end_instant: String,
}

fn parse_timezone(calendar: Option<&CalendarContext>) -> RuntimeResult<TimeZone> {
    match calendar.and_then(|c| c.time_zone.as_deref()) {
        Some(zone) if !zone.is_empty() => {
            if calendar
                .and_then(|c| c.time_zone_data.as_deref())
                .is_some_and(|v| v != jiff_tzdb::VERSION)
            {
                return Err(RuntimeErrorPayload::new(
                    "unsupported",
                    "Unsupported time zone data version",
                ));
            }
            let (name, tzif) = jiff_tzdb::get(zone).ok_or_else(|| {
                RuntimeErrorPayload::new("invalid-query", format!("Unknown time zone {zone:?}"))
            })?;
            TimeZone::tzif(name, tzif)
                .map_err(|e| RuntimeErrorPayload::new("invalid-query", e.to_string()))
        }
        _ => Ok(TimeZone::UTC),
    }
}

fn parse_timestamp(reference_instant: Option<&str>) -> RuntimeResult<Timestamp> {
    match reference_instant {
        Some(raw) => raw.parse::<Timestamp>().map_err(|err| {
            RuntimeErrorPayload::new(
                "invalid-request",
                format!("Invalid referenceInstant {raw:?}: {err}"),
            )
        }),
        None => Ok(Timestamp::now()),
    }
}

fn format_date(d: Date) -> String {
    format!("{:04}-{:02}-{:02}", d.year(), d.month(), d.day())
}

fn format_utc_millis(ts: Timestamp) -> String {
    let dt = ts.to_zoned(TimeZone::UTC).datetime();
    let millis = dt.subsec_nanosecond() / 1_000_000;
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        dt.year(),
        dt.month(),
        dt.day(),
        dt.hour(),
        dt.minute(),
        dt.second(),
        millis
    )
}

fn date_range_to_bounds(start: Date, end: Date, tz: &TimeZone) -> RuntimeResult<CalendarBounds> {
    if start.year() < MIN_YEAR
        || end.year() > MAX_YEAR + 1
        || (end.year() == MAX_YEAR + 1 && (end.month() != 1 || end.day() != 1))
    {
        return Err(RuntimeErrorPayload::new(
            "unsupported",
            "Calendar target is outside profile years 1970–2499",
        ));
    }
    let start_zoned = start
        .at(0, 0, 0, 0)
        .to_zoned(tz.clone())
        .map_err(|e| RuntimeErrorPayload::new("invalid-query", e.to_string()))?;
    let end_zoned = end
        .at(0, 0, 0, 0)
        .to_zoned(tz.clone())
        .map_err(|e| RuntimeErrorPayload::new("invalid-query", e.to_string()))?;

    Ok(CalendarBounds {
        start_date: format_date(start),
        end_date: format_date(end),
        start_instant: format_utc_millis(start_zoned.timestamp()),
        end_instant: format_utc_millis(end_zoned.timestamp()),
    })
}

/// Resolves the canonical `YYYY-MM-DD` date string for `TODAY()` given an
/// optional reference instant (RFC 3339) and IANA timezone.
pub fn resolve_today_date(
    calendar: Option<&CalendarContext>,
    reference_instant: Option<&str>,
) -> RuntimeResult<(String, String)> {
    let ts = parse_timestamp(reference_instant)?;
    let tz = parse_timezone(calendar)?;
    let d = ts.to_zoned(tz).date();
    Ok((format_date(d), format_utc_millis(ts)))
}

/// Computes local calendar period bounds (`day`, `week`, `month`, `year` with `offset` in `-1..=1`).
pub fn calendar_period_bounds(
    unit: &str,
    offset: i64,
    calendar: &CalendarContext,
    reference_instant: &str,
) -> RuntimeResult<CalendarBounds> {
    if !(-1..=1).contains(&offset) {
        return Err(RuntimeErrorPayload::new(
            "invalid-query",
            format!("Calendar period offset must be -1, 0, or 1, got {offset}"),
        ));
    }
    let ts = parse_timestamp(Some(reference_instant))?;
    let tz = parse_timezone(Some(calendar))?;
    let today = ts.to_zoned(tz.clone()).date();
    if today.year() < MIN_YEAR || today.year() > MAX_YEAR {
        return Err(RuntimeErrorPayload::new(
            "unsupported",
            "Calendar reference is outside profile years 1970–2499",
        ));
    }

    let week_starts_on = calendar.week_starts_on.unwrap_or(0);
    let (start, end) = match unit {
        "day" => {
            let s = today
                .checked_add(offset.days())
                .map_err(|e| RuntimeErrorPayload::new("unsupported", e.to_string()))?;
            let e = s
                .checked_add(1.days())
                .map_err(|e| RuntimeErrorPayload::new("unsupported", e.to_string()))?;
            (s, e)
        }
        "week" => {
            // jiff Weekday: Sunday=0 when using to_sunday_zero_offset()
            let dow = today.weekday().to_sunday_zero_offset() as i64;
            let start_dow = i64::from(week_starts_on);
            let back = (dow - start_dow + 7) % 7;
            let s = today
                .checked_sub(back.days())
                .and_then(|d| d.checked_add((offset * 7).days()))
                .map_err(|e| RuntimeErrorPayload::new("unsupported", e.to_string()))?;
            let e = s
                .checked_add(7.days())
                .map_err(|e| RuntimeErrorPayload::new("unsupported", e.to_string()))?;
            (s, e)
        }
        "month" => {
            let month_idx = (today.year() as i32) * 12 + (today.month() as i32 - 1) + offset as i32;
            let y1 = month_idx.div_euclid(12) as i16;
            let m1 = (month_idx.rem_euclid(12) + 1) as i8;
            let next_idx = month_idx + 1;
            let y2 = next_idx.div_euclid(12) as i16;
            let m2 = (next_idx.rem_euclid(12) + 1) as i8;
            (date(y1, m1, 1), date(y2, m2, 1))
        }
        "year" => {
            let y = today.year() + offset as i16;
            (date(y, 1, 1), date(y + 1, 1, 1))
        }
        other => {
            return Err(RuntimeErrorPayload::new(
                "invalid-query",
                format!("Invalid calendar period unit: {other}"),
            ));
        }
    };

    date_range_to_bounds(start, end, &tz)
}

/// Computes rolling calendar window bounds (`past`/`next`, `count >= 1`, `day`/`week`/`month`/`year`).
/// Includes both today and the shifted target date (matches `calendar-window.ts`).
pub fn calendar_window_bounds(
    direction: &str,
    count: i64,
    unit: &str,
    calendar: &CalendarContext,
    reference_instant: &str,
) -> RuntimeResult<CalendarBounds> {
    if !(1..=1_000_000).contains(&count) {
        return Err(RuntimeErrorPayload::new(
            "invalid-query",
            format!("Calendar window count out of range: {count}"),
        ));
    }
    let sign: i64 = match direction {
        "past" => -1,
        "next" => 1,
        _ => {
            return Err(RuntimeErrorPayload::new(
                "invalid-query",
                format!("Invalid calendar window direction: {direction}"),
            ));
        }
    };
    let ts = parse_timestamp(Some(reference_instant))?;
    let tz = parse_timezone(Some(calendar))?;
    let today = ts.to_zoned(tz.clone()).date();
    let amount = count * sign;

    let target = match unit {
        "day" => today
            .checked_add(amount.days())
            .map_err(|e| RuntimeErrorPayload::new("unsupported", e.to_string()))?,
        "week" => today
            .checked_add((amount * 7).days())
            .map_err(|e| RuntimeErrorPayload::new("unsupported", e.to_string()))?,
        "month" | "year" => {
            let months = if unit == "year" { amount * 12 } else { amount };
            let month_idx = (today.year() as i64) * 12 + (today.month() as i64 - 1) + months;
            let y = month_idx.div_euclid(12);
            if !(i64::from(MIN_YEAR)..=i64::from(MAX_YEAR)).contains(&y) {
                return Err(RuntimeErrorPayload::new(
                    "unsupported",
                    "Calendar window is outside profile years 1970–2499",
                ));
            }
            let m = (month_idx.rem_euclid(12) + 1) as i8;
            let first = date(y as i16, m, 1);
            let day = today.day().min(first.days_in_month());
            date(y as i16, m, day)
        }
        other => {
            return Err(RuntimeErrorPayload::new(
                "invalid-query",
                format!("Invalid calendar window unit: {other}"),
            ));
        }
    };

    let (start, end_inclusive) = if direction == "past" {
        (target, today)
    } else {
        (today, target)
    };
    let end = end_inclusive
        .checked_add(1.days())
        .map_err(|e| RuntimeErrorPayload::new("unsupported", e.to_string()))?;
    date_range_to_bounds(start, end, &tz)
}

/// Rewrites `calendar-period` and `calendar-window` filter leaves into half-open
/// `[start, end)` `And(Gte, Lt)` nodes so `eidos_file_core::query::compile_query`
/// can execute them with full total-Boolean NULL semantics across all query paths.
pub fn rewrite_calendar_query(
    query: &RowQuery,
    fields: &[FieldMeta],
    calendar: Option<&CalendarContext>,
    reference_instant: &str,
) -> RuntimeResult<RowQuery> {
    let Some(filter) = &query.filter else {
        return Ok(query.clone());
    };
    let field_by_id: HashMap<&str, &FieldMeta> =
        fields.iter().map(|f| (f.id.as_str(), f)).collect();
    let rewritten = rewrite_filter_node(filter, &field_by_id, calendar, reference_instant)?;
    Ok(RowQuery {
        filter: Some(rewritten),
        search: query.search.clone(),
        sort: query.sort.clone(),
    })
}

fn rewrite_filter_node(
    node: &FilterNode,
    fields: &HashMap<&str, &FieldMeta>,
    calendar: Option<&CalendarContext>,
    reference_instant: &str,
) -> RuntimeResult<FilterNode> {
    match node {
        FilterNode::And { args } => Ok(FilterNode::And {
            args: args
                .iter()
                .map(|c| rewrite_filter_node(c, fields, calendar, reference_instant))
                .collect::<RuntimeResult<_>>()?,
        }),
        FilterNode::Or { args } => Ok(FilterNode::Or {
            args: args
                .iter()
                .map(|c| rewrite_filter_node(c, fields, calendar, reference_instant))
                .collect::<RuntimeResult<_>>()?,
        }),
        FilterNode::Not { arg } => Ok(FilterNode::Not {
            arg: Box::new(rewrite_filter_node(
                arg,
                fields,
                calendar,
                reference_instant,
            )?),
        }),
        FilterNode::CalendarPeriod(f) => {
            let cal = calendar.ok_or_else(|| {
                RuntimeErrorPayload::new("invalid-query", "Calendar context is required")
            })?;
            let field = *fields.get(f.field_id.as_str()).ok_or_else(|| {
                RuntimeErrorPayload::new("invalid-query", format!("Unknown field {}", f.field_id))
            })?;
            let bounds =
                calendar_period_bounds(&f.unit, i64::from(f.offset), cal, reference_instant)?;
            bounds_to_filter(field, &bounds)
        }
        FilterNode::CalendarWindow(f) => {
            let cal = calendar.ok_or_else(|| {
                RuntimeErrorPayload::new("invalid-query", "Calendar context is required")
            })?;
            let field = *fields.get(f.field_id.as_str()).ok_or_else(|| {
                RuntimeErrorPayload::new("invalid-query", format!("Unknown field {}", f.field_id))
            })?;
            let bounds = calendar_window_bounds(
                &f.direction,
                i64::from(f.count),
                &f.unit,
                cal,
                reference_instant,
            )?;
            bounds_to_filter(field, &bounds)
        }
        other => Ok(other.clone()),
    }
}

fn bounds_to_filter(field: &FieldMeta, bounds: &CalendarBounds) -> RuntimeResult<FilterNode> {
    let (start, end) = match field.field_type {
        FieldType::Date => (bounds.start_date.clone(), bounds.end_date.clone()),
        FieldType::Datetime => (bounds.start_instant.clone(), bounds.end_instant.clone()),
        _ => {
            return Err(RuntimeErrorPayload::new(
                "invalid-query",
                format!(
                    "Calendar filter requires a date or datetime field, got {}",
                    field.field_type.as_str()
                ),
            ));
        }
    };
    Ok(FilterNode::And {
        args: vec![
            FilterNode::Gte {
                field_id: field.id.clone(),
                value: JsonValue::String(start),
            },
            FilterNode::Lt {
                field_id: field.id.clone(),
                value: JsonValue::String(end),
            },
        ],
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_today_across_timezones() {
        let cal_sh = CalendarContext {
            time_zone: Some("Asia/Shanghai".into()),
            time_zone_data: None,
            week_starts_on: Some(1),
        };
        let cal_la = CalendarContext {
            time_zone: Some("America/Los_Angeles".into()),
            time_zone_data: None,
            week_starts_on: Some(0),
        };
        let (d_sh, _) = resolve_today_date(Some(&cal_sh), Some("2026-11-26T20:00:00Z")).unwrap();
        let (d_la, _) = resolve_today_date(Some(&cal_la), Some("2026-11-26T04:00:00Z")).unwrap();
        assert_eq!(d_sh, "2026-11-27");
        assert_eq!(d_la, "2026-11-25");
    }

    #[test]
    fn computes_week_and_month_period_bounds() {
        // 2026-11-26 is a Thursday
        let cal = CalendarContext {
            time_zone: Some("UTC".into()),
            time_zone_data: None,
            week_starts_on: Some(1), // Monday
        };
        let this_week =
            calendar_period_bounds("week", 0, &cal, "2026-11-26T12:00:00.000Z").unwrap();
        assert_eq!(this_week.start_date, "2026-11-23");
        assert_eq!(this_week.end_date, "2026-11-30");

        let next_month =
            calendar_period_bounds("month", 1, &cal, "2026-11-26T12:00:00.000Z").unwrap();
        assert_eq!(next_month.start_date, "2026-12-01");
        assert_eq!(next_month.end_date, "2027-01-01");

        let past_7d =
            calendar_window_bounds("past", 7, "day", &cal, "2026-11-26T12:00:00.000Z").unwrap();
        assert_eq!(past_7d.start_date, "2026-11-19");
        assert_eq!(past_7d.end_date, "2026-11-27");
    }
}
