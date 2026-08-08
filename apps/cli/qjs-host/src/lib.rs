use std::cell::RefCell;
use std::rc::Rc;

use anyhow::{anyhow, Context as _};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use rquickjs::{Context, Ctx, Function, Object, Promise, Runtime};
use rusqlite::{
    ffi,
    functions::FunctionFlags,
    limits::Limit,
    types::{Value as SqlValue, ValueRef},
    Connection, DatabaseName,
};
use serde::{Deserialize, Serialize};

pub mod serve;

const BUNDLE: &str = include_str!("../bundle/eidos-runtime.js");

/// JSON-safe mirror of the JS WireSqlValue. Blobs ride as base64 text;
/// integers as canonical signed int64 decimal text.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "tag", content = "value", rename_all = "lowercase")]
enum WireSqlValue {
    Null,
    Integer(String),
    Real(f64),
    Text(String),
    Blob(String),
}

impl WireSqlValue {
    fn to_sql(&self) -> Result<SqlValue, String> {
        match self {
            WireSqlValue::Null => Ok(SqlValue::Null),
            WireSqlValue::Integer(text) => text
                .parse::<i64>()
                .map(SqlValue::Integer)
                .map_err(|_| format!("INTEGER out of int64 range: {text}")),
            WireSqlValue::Real(value) => {
                if value.is_finite() {
                    Ok(SqlValue::Real(*value))
                } else {
                    Err("REAL must be finite binary64".to_string())
                }
            }
            WireSqlValue::Text(value) => Ok(SqlValue::Text(value.clone())),
            WireSqlValue::Blob(value) => B64
                .decode(value)
                .map(SqlValue::Blob)
                .map_err(|_| "blob base64 is invalid".to_string()),
        }
    }

    fn from_sql(value: ValueRef<'_>) -> Result<Self, String> {
        match value {
            ValueRef::Null => Ok(WireSqlValue::Null),
            ValueRef::Integer(value) => Ok(WireSqlValue::Integer(value.to_string())),
            ValueRef::Real(value) => {
                if value.is_finite() {
                    Ok(WireSqlValue::Real(value))
                } else {
                    Err("SQLite returned a non-finite REAL".to_string())
                }
            }
            ValueRef::Text(bytes) => String::from_utf8(bytes.to_vec())
                .map(WireSqlValue::Text)
                .map_err(|_| "SQLite TEXT is not valid UTF-8".to_string()),
            ValueRef::Blob(bytes) => Ok(WireSqlValue::Blob(B64.encode(bytes))),
        }
    }
}

fn ok_envelope<T: Serialize>(value: &T) -> String {
    serde_json::json!({ "ok": true, "value": value }).to_string()
}

fn err_envelope(
    code: &str,
    message: impl Into<String>,
    primary: Option<i32>,
    extended: Option<i32>,
) -> String {
    let mut error = serde_json::json!({
        "code": code,
        "message": message.into(),
        "retryable": false,
        "fatal": false,
    });
    if let Some(primary) = primary {
        error["sqlitePrimaryCode"] = primary.into();
    }
    if let Some(extended) = extended {
        error["sqliteExtendedCode"] = extended.into();
    }
    serde_json::json!({ "ok": false, "error": error }).to_string()
}

fn map_rusqlite_error(error: &rusqlite::Error) -> String {
    match error {
        rusqlite::Error::SqliteFailure(
            ffi::Error {
                code,
                extended_code,
            },
            message,
        ) => {
            let mapped = match code {
                ffi::ErrorCode::ConstraintViolation => "constraint",
                ffi::ErrorCode::DatabaseBusy => "busy",
                ffi::ErrorCode::DatabaseLocked => "locked",
                ffi::ErrorCode::ReadOnly => "read-only",
                ffi::ErrorCode::OperationInterrupted => "cancelled",
                ffi::ErrorCode::SystemIoFailure => "io-error",
                ffi::ErrorCode::DatabaseCorrupt => "corrupt",
                ffi::ErrorCode::NotADatabase => "not-a-database",
                ffi::ErrorCode::ParameterOutOfRange | ffi::ErrorCode::TypeMismatch => {
                    "invalid-argument"
                }
                _ => "sql-error",
            };
            err_envelope(
                mapped,
                message.clone().unwrap_or_else(|| format!("{code:?}")),
                Some(*code as i32),
                Some(*extended_code),
            )
        }
        other => err_envelope("sql-error", other.to_string(), None, None),
    }
}

thread_local! {
    /// The QuickJS context currently executing a host call. rusqlite scalar
    /// trampolines pull it to call back into JS while SQLite is mid-query.
    /// SAFETY: only valid because the VM is single-threaded and every code
    /// path that reads this is synchronously nested inside a host function
    /// that set it; the runtime outlives all such calls.
    pub(crate) static ACTIVE_CTX: RefCell<Option<Ctx<'static>>> = const { RefCell::new(None) };
}

fn activate_ctx(ctx: &Ctx<'_>) {
    ACTIVE_CTX.with(|slot| {
        *slot.borrow_mut() =
            Some(unsafe { std::mem::transmute::<Ctx<'_>, Ctx<'static>>(ctx.clone()) });
    });
}

pub struct HostState {
    conn: Connection,
}

fn parse_bindings(bindings_json: &str) -> Result<Vec<SqlValue>, String> {
    let wire: Vec<WireSqlValue> =
        serde_json::from_str(bindings_json).map_err(|error| error.to_string())?;
    wire.iter().map(WireSqlValue::to_sql).collect()
}

fn host_exec(state: &HostState, sql: &str) -> String {
    match state.conn.execute_batch(sql) {
        Ok(()) => ok_envelope(&serde_json::Value::Null),
        Err(error) => map_rusqlite_error(&error),
    }
}

fn host_query(state: &HostState, sql: &str, bindings_json: &str, forbid_write: bool) -> String {
    let bindings = match parse_bindings(bindings_json) {
        Ok(bindings) => bindings,
        Err(message) => return err_envelope("invalid-sql-value", message, None, None),
    };
    let mut statement = match state.conn.prepare(sql) {
        Ok(statement) => statement,
        Err(error) => return map_rusqlite_error(&error),
    };
    if statement.column_count() == 0 {
        return err_envelope(
            "invalid-argument",
            "query requires one row-producing statement",
            None,
            None,
        );
    }
    if forbid_write && !statement.readonly() {
        return err_envelope(
            "read-only",
            "Mutating statement is forbidden in a read transaction",
            None,
            None,
        );
    }
    let columns: Vec<serde_json::Value> = statement
        .column_names()
        .iter()
        .map(|name| serde_json::json!({ "name": name }))
        .collect();
    let column_count = statement.column_count();
    let mut rows = match statement.query(rusqlite::params_from_iter(bindings)) {
        Ok(rows) => rows,
        Err(error) => return map_rusqlite_error(&error),
    };
    let mut out_rows: Vec<Vec<WireSqlValue>> = Vec::new();
    loop {
        let row = match rows.next() {
            Ok(Some(row)) => row,
            Ok(None) => break,
            Err(error) => return map_rusqlite_error(&error),
        };
        let mut out_row: Vec<WireSqlValue> = Vec::with_capacity(column_count);
        for index in 0..column_count {
            match row.get_ref(index) {
                Ok(value) => match WireSqlValue::from_sql(value) {
                    Ok(value) => out_row.push(value),
                    Err(message) => return err_envelope("invalid-sql-value", message, None, None),
                },
                Err(error) => return map_rusqlite_error(&error),
            }
        }
        out_rows.push(out_row);
    }
    ok_envelope(&serde_json::json!({ "columns": columns, "rows": out_rows }))
}

fn host_run(state: &HostState, sql: &str, bindings_json: &str, forbid_write: bool) -> String {
    let bindings = match parse_bindings(bindings_json) {
        Ok(bindings) => bindings,
        Err(message) => return err_envelope("invalid-sql-value", message, None, None),
    };
    let mut statement = match state.conn.prepare(sql) {
        Ok(statement) => statement,
        Err(error) => return map_rusqlite_error(&error),
    };
    if statement.column_count() != 0 {
        return err_envelope(
            "invalid-argument",
            "run requires one no-result statement",
            None,
            None,
        );
    }
    if forbid_write && !statement.readonly() {
        return err_envelope(
            "read-only",
            "Mutating statement is forbidden in a read transaction",
            None,
            None,
        );
    }
    match statement.execute(rusqlite::params_from_iter(bindings)) {
        Ok(_changes) => ok_envelope(&serde_json::json!({
            "changes": state.conn.changes().to_string(),
            "lastInsertRowid": state.conn.last_insert_rowid().to_string(),
        })),
        Err(error) => map_rusqlite_error(&error),
    }
}

fn sql_value_to_wire(value: &SqlValue) -> Result<WireSqlValue, String> {
    match value {
        SqlValue::Null => Ok(WireSqlValue::Null),
        SqlValue::Integer(value) => Ok(WireSqlValue::Integer(value.to_string())),
        SqlValue::Real(value) => {
            if value.is_finite() {
                Ok(WireSqlValue::Real(*value))
            } else {
                Err("SQLite returned a non-finite REAL".to_string())
            }
        }
        SqlValue::Text(value) => Ok(WireSqlValue::Text(value.clone())),
        SqlValue::Blob(value) => Ok(WireSqlValue::Blob(B64.encode(value))),
    }
}

fn wire_value_to_sql(value: &WireSqlValue) -> rusqlite::Result<SqlValue> {
    value
        .to_sql()
        .map_err(|message| rusqlite::Error::UserFunctionError(message.into()))
}

fn host_register_scalar(state: &HostState, name: &str, arity: i32) -> String {
    let name_owned = name.to_string();
    let result = state.conn.create_scalar_function(
        name,
        arity,
        FunctionFlags::SQLITE_DETERMINISTIC | FunctionFlags::SQLITE_DIRECTONLY,
        move |function_ctx| {
            let mut args: Vec<WireSqlValue> = Vec::with_capacity(function_ctx.len());
            for index in 0..function_ctx.len() {
                let value: SqlValue = function_ctx.get(index)?;
                args.push(
                    sql_value_to_wire(&value)
                        .map_err(|message| rusqlite::Error::UserFunctionError(message.into()))?,
                );
            }
            let args_json = serde_json::to_string(&args)
                .map_err(|error| rusqlite::Error::UserFunctionError(error.to_string().into()))?;
            let response_json = ACTIVE_CTX.with(|slot| -> rusqlite::Result<String> {
                let ctx = slot.borrow().clone().ok_or_else(|| {
                    rusqlite::Error::UserFunctionError(
                        "scalar trampoline outside an active JS call".into(),
                    )
                })?;
                let globals = ctx.globals();
                let dispatch: Function =
                    globals.get("__eidos_scalar_dispatch").map_err(|error| {
                        rusqlite::Error::UserFunctionError(error.to_string().into())
                    })?;
                dispatch
                    .call::<(String, String), String>((name_owned.clone(), args_json))
                    .map_err(|error| rusqlite::Error::UserFunctionError(error.to_string().into()))
            })?;
            #[derive(Deserialize)]
            #[serde(untagged)]
            enum ScalarResponse {
                Ok { value: WireSqlValue },
                Err { error: ScalarError },
            }
            #[derive(Deserialize)]
            struct ScalarError {
                message: String,
            }
            let response: ScalarResponse = serde_json::from_str(&response_json)
                .map_err(|error| rusqlite::Error::UserFunctionError(error.to_string().into()))?;
            match response {
                ScalarResponse::Ok { value, .. } => wire_value_to_sql(&value),
                ScalarResponse::Err { error, .. } => {
                    Err(rusqlite::Error::UserFunctionError(error.message.into()))
                }
            }
        },
    );
    match result {
        Ok(()) => ok_envelope(&serde_json::Value::Null),
        Err(error) => map_rusqlite_error(&error),
    }
}

fn build_host_object(ctx: &Ctx<'_>, state: &Rc<HostState>) -> rquickjs::Result<()> {
    let host = Object::new(ctx.clone())?;

    {
        let state = state.clone();
        host.set(
            "exec",
            Function::new(ctx.clone(), move |ctx: Ctx<'_>, sql: String| -> String {
                activate_ctx(&ctx);
                host_exec(&state, &sql)
            }),
        )?;
    }
    {
        let state = state.clone();
        host.set(
            "query",
            Function::new(
                ctx.clone(),
                move |ctx: Ctx<'_>, sql: String, bindings: String, forbid: bool| -> String {
                    activate_ctx(&ctx);
                    host_query(&state, &sql, &bindings, forbid)
                },
            ),
        )?;
    }
    {
        let state = state.clone();
        host.set(
            "run",
            Function::new(
                ctx.clone(),
                move |ctx: Ctx<'_>, sql: String, bindings: String, forbid: bool| -> String {
                    activate_ctx(&ctx);
                    host_run(&state, &sql, &bindings, forbid)
                },
            ),
        )?;
    }
    {
        let state = state.clone();
        host.set(
            "registerScalar",
            Function::new(
                ctx.clone(),
                move |ctx: Ctx<'_>, name: String, arity: i32| -> String {
                    activate_ctx(&ctx);
                    host_register_scalar(&state, &name, arity)
                },
            ),
        )?;
    }
    {
        let state = state.clone();
        host.set(
            "dataVersion",
            Function::new(ctx.clone(), move || -> String {
                match state
                    .conn
                    .pragma_query_value(None, "data_version", |row| row.get::<_, i64>(0))
                {
                    Ok(value) => ok_envelope(&value.to_string()),
                    Err(error) => map_rusqlite_error(&error),
                }
            }),
        )?;
    }
    {
        let state = state.clone();
        host.set(
            "serialize",
            Function::new(ctx.clone(), move || -> String {
                match state.conn.serialize(DatabaseName::Main) {
                    Ok(bytes) => ok_envelope(&B64.encode(&*bytes)),
                    Err(error) => map_rusqlite_error(&error),
                }
            }),
        )?;
    }
    host.set(
        "interrupt",
        Function::new(ctx.clone(), || -> String {
            err_envelope(
                "unsupported-capability",
                "interrupt is wired in the production host",
                None,
                None,
            )
        }),
    )?;
    host.set(
        "randomBytes",
        Function::new(ctx.clone(), |length: usize| -> String {
            let mut bytes = vec![0u8; length];
            rand::Rng::fill(&mut rand::thread_rng(), &mut bytes[..]);
            B64.encode(bytes)
        }),
    )?;
    host.set(
        "sha256",
        Function::new(ctx.clone(), |bytes_base64: String| -> String {
            use sha2::Digest;
            let bytes = match B64.decode(&bytes_base64) {
                Ok(bytes) => bytes,
                Err(_) => return String::new(),
            };
            let digest = sha2::Sha256::digest(&bytes);
            B64.encode(digest)
        }),
    )?;
    host.set(
        "log",
        Function::new(ctx.clone(), |level: String, message: String| {
            eprintln!("[js:{level}] {message}");
        }),
    )?;
    {
        let state = state.clone();
        host.set(
            "limits",
            Function::new(ctx.clone(), move || -> String {
                let conn = &state.conn;
                ok_envelope(&serde_json::json!({
                    "busyTimeoutMs": 5_000,
                    "maxVariables": conn.limit(Limit::SQLITE_LIMIT_VARIABLE_NUMBER),
                    "maxSqlBytes": conn.limit(Limit::SQLITE_LIMIT_SQL_LENGTH),
                    "maxValueBytes": conn.limit(Limit::SQLITE_LIMIT_LENGTH),
                }))
            }),
        )?;
    }
    {
        let state = state.clone();
        host.set(
            "sqliteProbe",
            Function::new(ctx.clone(), move || -> String {
                match state.conn.query_row(
                    "SELECT sqlite_version(), sqlite_source_id()",
                    [],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
                ) {
                    Ok((version, source)) => ok_envelope(&serde_json::json!({
                        "sqliteVersion": version,
                        "sourceId": source,
                    })),
                    Err(error) => map_rusqlite_error(&error),
                }
            }),
        )?;
    }

    ctx.globals().set("__eidos_host", host)?;
    Ok(())
}

pub struct QjsHost {
    runtime: Runtime,
    context: Context,
}

impl QjsHost {
    pub fn new(state: &Rc<HostState>) -> anyhow::Result<Self> {
        let runtime = Runtime::new().context("create QuickJS runtime")?;
        let context = Context::full(&runtime).context("create QuickJS context")?;
        context.with(|ctx| {
            build_host_object(&ctx, state)
                .map_err(|error| anyhow!("register host object: {error:?}"))?;
            if let Err(error) = ctx.eval::<(), _>(BUNDLE) {
                let caught = ctx.catch();
                return Err(anyhow!(
                    "evaluate runtime bundle: {error:?}; js: {:?}",
                    caught.as_exception().map(|exception| exception.to_string())
                ));
            }
            Ok::<_, anyhow::Error>(())
        })?;
        Ok(Self { runtime, context })
    }

    /// Call one __eidos_runtime method with JSON string arguments, drain the
    /// job queue, and return the settled JSON string result.
    pub fn invoke(&self, method: &str, args: &[String]) -> anyhow::Result<String> {
        let promise = self.context.with(|ctx| {
            let runtime_obj: Object = ctx
                .globals()
                .get("__eidos_runtime")
                .map_err(|error| anyhow!("missing __eidos_runtime: {error:?}"))?;
            let function: Function = runtime_obj
                .get(method)
                .map_err(|error| anyhow!("missing {method}: {error:?}"))?;
            let promise: Promise = match args.len() {
                0 => function.call(()),
                1 => function.call((args[0].clone(),)),
                2 => function.call((args[0].clone(), args[1].clone())),
                3 => function.call((args[0].clone(), args[1].clone(), args[2].clone())),
                _ => return Err(anyhow!("too many invoke arguments")),
            }
            .map_err(|error| anyhow!("call {method}: {error:?}"))?;
            Ok::<_, anyhow::Error>(rquickjs::Persistent::save(&ctx, promise))
        })?;

        loop {
            match self.runtime.execute_pending_job() {
                Ok(true) => continue,
                Ok(false) => break,
                Err(error) => {
                    let detail = error.0.with(|ctx| {
                        let caught = ctx.catch();
                        caught.as_exception().map(|exception| exception.to_string())
                    });
                    return Err(anyhow!(
                        "pending job in {method} failed: {error:?}; js: {detail:?}"
                    ));
                }
            }
        }

        self.context.with(|ctx| {
            let promise = promise
                .restore(&ctx)
                .map_err(|error| anyhow!("restore {method} promise: {error:?}"))?;
            promise
                .finish::<String>()
                .map_err(|error| anyhow!("{method} promise rejected: {error:?}"))
        })
    }
}

fn request_context(id: &str) -> String {
    serde_json::json!({ "requestId": id, "deadlineMilliseconds": 30_000 }).to_string()
}

pub fn open_host_state(db_path: &std::path::Path) -> anyhow::Result<HostState> {
    let conn = Connection::open(db_path).context("open database")?;
    conn.execute_batch(
        "PRAGMA foreign_keys = ON; PRAGMA trusted_schema = OFF; PRAGMA busy_timeout = 5000;",
    )
    .context("install connection pragmas")?;
    Ok(HostState { conn })
}

pub fn run_self_test(db_path: &std::path::Path) -> anyhow::Result<()> {
    if db_path.exists() {
        std::fs::remove_file(db_path).context("remove stale self-test database")?;
    }
    let state = Rc::new(open_host_state(db_path)?);
    let host = QjsHost::new(&state)?;
    let report = host.invoke("selfTest", &[])?;

    ACTIVE_CTX.with(|slot| *slot.borrow_mut() = None);

    let parsed: serde_json::Value = serde_json::from_str(&report)?;
    if parsed.get("ok") == Some(&serde_json::Value::Bool(true)) {
        println!("SELFTEST OK");
        if let Some(checks) = parsed.get("checks").and_then(|c| c.as_array()) {
            for check in checks {
                println!("  ✓ {}", check.as_str().unwrap_or("?"));
            }
        }
        Ok(())
    } else {
        Err(anyhow!("SELFTEST FAILED: {report}"))
    }
}

pub fn run_create(db_path: &std::path::Path, title: &str) -> anyhow::Result<()> {
    let state = Rc::new(open_host_state(db_path)?);
    let host = QjsHost::new(&state)?;
    let request = serde_json::json!({ "mode": "create", "title": title }).to_string();
    println!("open: {}", host.invoke("open", &[request])?);
    println!("close: {}", host.invoke("close", &[])?);
    ACTIVE_CTX.with(|slot| *slot.borrow_mut() = None);
    Ok(())
}

pub fn run_open(db_path: &std::path::Path) -> anyhow::Result<()> {
    let state = Rc::new(open_host_state(db_path)?);
    let host = QjsHost::new(&state)?;
    let request = serde_json::json!({ "mode": "open", "access": "readwrite" }).to_string();
    println!("open: {}", host.invoke("open", &[request])?);
    let snapshot = host.invoke(
        "call",
        &[
            "getSnapshot".to_string(),
            "{}".to_string(),
            request_context("snapshot"),
        ],
    )?;
    println!("getSnapshot: {snapshot}");
    let validation = host.invoke(
        "call",
        &[
            "validate".to_string(),
            serde_json::json!({ "level": "full", "diagnosticsLimit": 100 }).to_string(),
            request_context("validate"),
        ],
    )?;
    println!("validate: {validation}");
    let bytes = host.invoke("snapshot", &[])?;
    println!("snapshot: {} base64 bytes", bytes.len());
    println!("close: {}", host.invoke("close", &[])?);
    ACTIVE_CTX.with(|slot| *slot.borrow_mut() = None);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::run_self_test;

    #[test]
    fn bundled_runtime_passes_the_rusqlite_host_self_test() {
        let path = std::env::temp_dir().join(format!(
            "qjs-host-test-{}-{:?}.eidos",
            std::process::id(),
            std::thread::current().id()
        ));
        let result = run_self_test(&path);
        let _ = std::fs::remove_file(&path);
        result.expect("bundled QuickJS runtime self-test");
    }
}
