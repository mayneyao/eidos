use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use hmac::{Hmac, Mac};
use rusqlite::types::Value;
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use sha2::Sha256;

use crate::{RuntimeErrorPayload, RuntimeResult};

fn invalid() -> RuntimeErrorPayload {
    RuntimeErrorPayload::new("invalid-query", "Invalid cursor or cursor binding")
}

pub(crate) struct CursorKey([u8; 32]);

impl CursorKey {
    pub fn new() -> RuntimeResult<Self> {
        let mut key = [0; 32];
        getrandom::fill(&mut key).map_err(|e| RuntimeErrorPayload::new("fatal", e.to_string()))?;
        Ok(Self(key))
    }

    pub fn seal<T: Serialize>(&self, value: &T) -> RuntimeResult<String> {
        let body = serde_json::to_vec(value).map_err(|_| invalid())?;
        let mut mac = Hmac::<Sha256>::new_from_slice(&self.0).expect("fixed size key");
        mac.update(&body);
        Ok(format!(
            "{}.{}",
            URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes()),
            URL_SAFE_NO_PAD.encode(body)
        ))
    }

    pub fn page_boundaries(
        &self,
        page: PageCursor<()>,
        boundaries: &[Vec<BoundaryValue>],
        backward: bool,
        has_more: bool,
        continued: bool,
    ) -> RuntimeResult<(Option<String>, Option<String>)> {
        let encode = |boundary: Option<&Vec<BoundaryValue>>| {
            boundary
                .map(|boundary| {
                    self.seal(&PageCursor {
                        binding: page.binding.clone(),
                        revision: page.revision.clone(),
                        instant: page.instant.clone(),
                        boundary,
                    })
                })
                .transpose()
        };
        let (has_next, has_previous) = if backward {
            (continued, has_more)
        } else {
            (has_more, continued)
        };
        Ok((
            if has_next {
                encode(boundaries.last())?
            } else {
                None
            },
            if has_previous {
                encode(boundaries.first())?
            } else {
                None
            },
        ))
    }

    pub fn open<T: DeserializeOwned>(&self, cursor: &str) -> RuntimeResult<T> {
        let (tag, body) = cursor.split_once('.').ok_or_else(invalid)?;
        let tag = URL_SAFE_NO_PAD.decode(tag).map_err(|_| invalid())?;
        let body = URL_SAFE_NO_PAD.decode(body).map_err(|_| invalid())?;
        let mut mac = Hmac::<Sha256>::new_from_slice(&self.0).expect("fixed size key");
        mac.update(&body);
        mac.verify_slice(&tag).map_err(|_| invalid())?;
        serde_json::from_slice(&body).map_err(|_| invalid())
    }
}

#[derive(Serialize, Deserialize)]
pub(crate) struct PageCursor<T> {
    pub binding: String,
    pub revision: String,
    pub instant: Option<String>,
    pub boundary: T,
}

impl<T> PageCursor<T> {
    pub fn check(&self, binding: &str, revision: &str, instant: Option<&str>) -> RuntimeResult<()> {
        if binding != self.binding || instant.is_some_and(|r| Some(r) != self.instant.as_deref()) {
            return Err(invalid());
        }
        if revision != self.revision {
            return Err(
                RuntimeErrorPayload::new("stale-revision", "Cursor revision changed")
                    .with_current_revision(revision),
            );
        }
        Ok(())
    }
}

// Preserve the SQLite storage class and every bit of a binary64 sort key.
#[derive(Clone, Serialize, Deserialize)]
pub(crate) enum BoundaryValue {
    Null,
    Integer(i64),
    Real(u64),
    Text(String),
    Blob(Vec<u8>),
}

impl From<Value> for BoundaryValue {
    fn from(v: Value) -> Self {
        match v {
            Value::Null => Self::Null,
            Value::Integer(i) => Self::Integer(i),
            Value::Real(n) => Self::Real(n.to_bits()),
            Value::Text(s) => Self::Text(s),
            Value::Blob(b) => Self::Blob(b),
        }
    }
}

impl BoundaryValue {
    fn sql_value(&self) -> Value {
        match self {
            Self::Null => Value::Null,
            Self::Integer(i) => Value::Integer(*i),
            Self::Real(n) => Value::Real(f64::from_bits(*n)),
            Self::Text(s) => Value::Text(s.clone()),
            Self::Blob(b) => Value::Blob(b.clone()),
        }
    }
}

pub(crate) struct SortKey {
    pub expr: String,
    pub descending: bool,
    pub nulls_first: bool,
}

impl SortKey {
    pub fn order(&self, backward: bool) -> String {
        let direction = if self.descending ^ backward {
            "DESC"
        } else {
            "ASC"
        };
        let nulls = if self.nulls_first ^ backward {
            "FIRST"
        } else {
            "LAST"
        };
        format!("{} {direction} NULLS {nulls}", self.expr)
    }
}

/// Lexicographic seek. IS handles equality for both ordinary and NULL keys.
pub(crate) fn seek(
    keys: &[SortKey],
    values: &[BoundaryValue],
    backward: bool,
    params: &mut Vec<Value>,
) -> RuntimeResult<String> {
    if keys.len() != values.len() {
        return Err(invalid());
    }
    let mut suffix = "0".to_string();
    for (key, value) in keys.iter().zip(values).rev() {
        let expr = &key.expr;
        let nulls_first = key.nulls_first ^ backward;
        let cmp = if key.descending ^ backward { "<" } else { ">" };
        params.push(value.sql_value());
        let arg = format!("?{}", params.len());
        let after = match (value, nulls_first) {
            (BoundaryValue::Null, true) => format!("{expr} IS NOT NULL"),
            (BoundaryValue::Null, false) => "0".into(),
            (_, true) => format!("{expr} {cmp} {arg}"),
            (_, false) => format!("{expr} IS NULL OR {expr} {cmp} {arg}"),
        };
        suffix = format!("({after} OR ({expr} IS {arg} AND {suffix}))");
    }
    Ok(suffix)
}
