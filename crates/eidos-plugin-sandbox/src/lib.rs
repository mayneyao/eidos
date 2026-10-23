mod bluetooth;
mod network;
use anyhow::{anyhow, bail, ensure, Context as _, Result};
use rquickjs::{
    function::Func, promise::PromiseState, CatchResultExt, Context, Function, Module, Object,
    Persistent, Promise, Runtime,
};
use std::{
    cell::{Cell, RefCell},
    collections::{BTreeMap, HashMap},
    hash::{DefaultHasher, Hash, Hasher},
    io::{self, BufRead, Read, Write},
    path::PathBuf,
    rc::Rc,
    sync::mpsc::{self, Receiver, SyncSender, TryRecvError},
    thread,
    time::{Duration, Instant},
};

const MAX_MESSAGE: usize = 1024 * 1024;
const MAX_SOURCE: usize = 4 * 1024 * 1024;
const MAX_OUTPUT: usize = 16 * 1024 * 1024;
const MAX_TIMERS: usize = 1024;

/// Process-scoped runner configuration. Use the CLI/Node SDK for isolated instances.
#[derive(Debug, Clone)]
pub struct RunOptions {
    pub file: PathBuf,
    pub listen: bool,
    pub memory_mb: usize,
    pub turn_budget_ms: u64,
    pub max_duration_ms: u64,
    pub allow_net: Vec<String>,
    pub allow_private_net: bool,
    pub bluetooth_policy: Option<PathBuf>,
    pub bluetooth_mock: bool,
    pub control_protocol: bool,
}

pub use bluetooth::scan as scan_bluetooth;

#[derive(Default)]
struct Host {
    control_protocol: bool,
    timers: BTreeMap<u32, Instant>,
    closed: bool,
    output_bytes: usize,
    fatal: Option<String>,
}

enum Input {
    Stop,
    Message(String),
    Error(String),
    Eof,
}

enum Task {
    Timer(u32),
    Network(serde_json::Value),
    Bluetooth(serde_json::Value),
    Input(Input),
}

fn input_reader(wake: SyncSender<()>, control: bool) -> Receiver<Input> {
    let (tx, rx) = mpsc::sync_channel(8);
    thread::spawn(move || {
        let mut reader = io::stdin().lock();
        loop {
            let mut bytes = Vec::new();
            let result = reader
                .by_ref()
                .take((MAX_MESSAGE + 1) as u64)
                .read_until(b'\n', &mut bytes);
            let event = match result {
                Ok(0) => {
                    if control {
                        Input::Stop
                    } else {
                        Input::Eof
                    }
                }
                Ok(_) if bytes.len() > MAX_MESSAGE => {
                    Input::Error("Input line exceeds 1 MiB".into())
                }
                Ok(_) => match String::from_utf8(bytes) {
                    Ok(line) if line.trim().is_empty() => continue,
                    Ok(line) => match serde_json::from_str::<serde_json::Value>(&line) {
                        Ok(value) => {
                            if control {
                                match value["type"].as_str() {
                                    Some("message") if value.get("data").is_some() => {
                                        Input::Message(value["data"].to_string())
                                    }
                                    Some("stop") => Input::Stop,
                                    _ => Input::Error("Invalid host protocol frame".into()),
                                }
                            } else {
                                Input::Message(line)
                            }
                        }
                        Err(error) => Input::Error(format!("Invalid JSON input: {error}")),
                    },
                    Err(error) => Input::Error(format!("Input must be UTF-8: {error}")),
                },
                Err(error) => Input::Error(format!("Input I/O: {error}")),
            };
            let terminal = !matches!(event, Input::Message(_));
            if tx.send(event).is_err() {
                break;
            }
            let _ = wake.try_send(());
            if terminal {
                break;
            }
        }
    });
    rx
}

fn install(
    ctx: &rquickjs::Ctx<'_>,
    host: &Rc<RefCell<Host>>,
    network: &Rc<RefCell<network::Network>>,
    bluetooth: &Rc<RefCell<bluetooth::Bluetooth>>,
) -> rquickjs::Result<()> {
    let b = bluetooth.clone();
    let h = host.clone();
    ctx.globals().set(
        "__bluetooth",
        Func::from(move |method: String, input: String| -> String {
            if h.borrow().closed {
                return r#"{"ok":false,"error":"InvalidStateError: Worker closed"}"#.into();
            }
            b.borrow_mut().call(method, input)
        }),
    )?;
    let n = network.clone();
    let h = host.clone();
    ctx.globals().set(
        "__network",
        Func::from(move |method: String, input: String| -> String {
            if h.borrow().closed {
                return r#"{"ok":false,"error":"Worker closed"}"#.into();
            }
            n.borrow_mut().call(&method, &input)
        }),
    )?;
    let h = host.clone();
    ctx.globals().set(
        "__emit",
        Func::from(move |kind: String, text: String| -> bool {
            let mut host = h.borrow_mut();
            if host.closed {
                return true;
            }
            if text.len() > MAX_MESSAGE
                || host.output_bytes.saturating_add(text.len() + 16) > MAX_OUTPUT
            {
                host.fatal = Some("Output quota exceeded (1 MiB/message, 16 MiB/run)".into());
                return false;
            }
            host.output_bytes += text.len() + 16;
            let result = if kind == "message" {
                let mut out = io::stdout().lock();
                if host.control_protocol {
                    writeln!(out, "{{\"type\":\"message\",\"data\":{text}}}")
                        .and_then(|_| out.flush())
                } else {
                    writeln!(out, "{text}").and_then(|_| out.flush())
                }
            } else {
                writeln!(io::stderr().lock(), "[{kind}] {text}")
            };
            if let Err(error) = result {
                host.fatal = Some(format!("Output I/O: {error}"));
                return false;
            }
            true
        }),
    )?;
    let h = host.clone();
    ctx.globals().set(
        "__schedule",
        Func::from(move |id: u32, delay: u32| -> bool {
            let mut host = h.borrow_mut();
            if host.closed || host.timers.len() >= MAX_TIMERS {
                return false;
            }
            host.timers
                .insert(id, Instant::now() + Duration::from_millis(delay.into()));
            true
        }),
    )?;
    let h = host.clone();
    ctx.globals().set(
        "__cancel",
        Func::from(move |id: u32| {
            h.borrow_mut().timers.remove(&id);
        }),
    )?;
    let h = host.clone();
    let n = network.clone();
    let b = bluetooth.clone();
    ctx.globals().set(
        "__stop",
        Func::from(move || {
            let mut host = h.borrow_mut();
            host.closed = true;
            host.timers.clear();
            n.borrow_mut().stop();
            b.borrow_mut().stop();
        }),
    )?;
    Ok(())
}

pub fn run(args: RunOptions) -> Result<()> {
    let RunOptions {
        file,
        listen,
        memory_mb,
        turn_budget_ms: budget_ms,
        max_duration_ms: duration_ms,
        allow_net,
        allow_private_net,
        bluetooth_policy,
        bluetooth_mock,
        control_protocol,
    } = args;
    let (wake_tx, wake_rx) = mpsc::sync_channel(1);
    let bluetooth = Rc::new(RefCell::new(bluetooth::Bluetooth::new(
        bluetooth::Policy::load(bluetooth_policy.as_deref())?,
        bluetooth_mock,
        wake_tx.clone(),
    )?));
    let network = Rc::new(RefCell::new(network::Network::new(
        network::Policy::new(allow_net, allow_private_net)?,
        wake_tx.clone(),
    )?));
    ensure!(
        (8..=1024).contains(&memory_mb),
        "--memory-mb must be 8..1024"
    );
    ensure!(
        (1..=10000).contains(&budget_ms),
        "--turn-budget-ms must be 1..10000"
    );
    ensure!(
        duration_ms <= 31_536_000_000,
        "--max-duration-ms must be at most one year"
    );
    let file = file.canonicalize().context("Resolve module path")?;
    let mut bytes = Vec::new();
    std::fs::File::open(&file)?
        .take((MAX_SOURCE + 1) as u64)
        .read_to_end(&mut bytes)?;
    ensure!(bytes.len() <= MAX_SOURCE, "Module exceeds 4 MiB");
    let source = String::from_utf8(bytes).context("Module must be UTF-8")?;
    let runtime = Runtime::new()?;
    runtime.set_memory_limit(memory_mb * 1024 * 1024);
    runtime.set_max_stack_size(512 * 1024);
    let budget = Duration::from_millis(budget_ms);
    let total = (duration_ms != 0).then(|| Instant::now() + Duration::from_millis(duration_ms));
    let deadline = Rc::new(Cell::new(Instant::now() + budget));
    let interrupted = Rc::new(Cell::new(false));
    let d = deadline.clone();
    let flag = interrupted.clone();
    runtime.set_interrupt_handler(Some(Box::new(move || {
        let now = Instant::now();
        let expired = now >= d.get() || total.is_some_and(|end| now >= end);
        if expired {
            flag.set(true);
        }
        expired
    })));
    let rejections = Rc::new(RefCell::new(HashMap::<u64, String>::new()));
    let rejected = rejections.clone();
    runtime.set_host_promise_rejection_tracker(Some(Box::new(
        move |_, promise, reason, handled| {
            let mut hash = DefaultHasher::new();
            promise.hash(&mut hash);
            let id = hash.finish();
            if handled {
                rejected.borrow_mut().remove(&id);
            } else {
                let description = reason
                    .as_string()
                    .and_then(|s| s.to_string().ok())
                    .unwrap_or_else(|| format!("{reason:?}"));
                rejected.borrow_mut().insert(id, description);
            }
        },
    )));
    let context = Context::full(&runtime)?;
    let host = Rc::new(RefCell::new(Host {
        control_protocol,
        ..Host::default()
    }));
    let (bridge, web, ble, entry) = context.with(|ctx| -> Result<_> {
        install(&ctx, &host, &network, &bluetooth)
            .catch(&ctx)
            .map_err(|e| anyhow!("{e}"))?;
        let bridge: Object = ctx
            .eval(include_str!("bootstrap.js"))
            .catch(&ctx)
            .map_err(|e| anyhow!("{e}"))?;
        let web: Object = ctx
            .eval(include_str!("web.js"))
            .catch(&ctx)
            .map_err(|e| anyhow!("{e}"))?;
        let ble: Object = ctx
            .eval(include_str!("bluetooth.js"))
            .catch(&ctx)
            .map_err(|e| anyhow!("{e}"))?;
        let (_, entry) = Module::declare(
            ctx.clone(),
            file.to_string_lossy().as_bytes(),
            source.as_bytes(),
        )
        .and_then(|module| module.eval())
        .catch(&ctx)
        .map_err(|e| anyhow!("{e}"))?;
        Ok((
            Persistent::save(&ctx, bridge),
            Persistent::save(&ctx, web),
            Persistent::save(&ctx, ble),
            Persistent::save(&ctx, entry),
        ))
    })?;
    let input = listen.then(|| input_reader(wake_tx, control_protocol));
    let mut eof = !listen;
    let mut ready = false;
    let mut next_source = 0;
    loop {
        // A task and all of its microtasks share the same deadline.
        let mut jobs = 0;
        while !host.borrow().closed && runtime.is_job_pending() {
            ensure!(
                Instant::now() < deadline.get() && jobs < 10000,
                "JS turn budget exceeded (including microtasks)"
            );
            match runtime.execute_pending_job() {
                Ok(_) => jobs += 1,
                Err(error) => {
                    return error
                        .0
                        .with(|ctx| Err(anyhow!("JavaScript job failed: {:?}", ctx.catch())))
                }
            }
        }
        ensure!(
            !interrupted.get(),
            "JS execution interrupted: turn or total duration limit"
        );
        if let Some(error) = host.borrow_mut().fatal.take() {
            bail!(error);
        }
        if host.borrow().closed {
            return Ok(());
        }
        ensure!(
            total.is_none_or(|end| Instant::now() < end),
            "Total duration limit exceeded"
        );
        let was_ready = ready;
        if !ready {
            ready = context.with(|ctx| -> Result<bool> {
                let promise: Promise = entry.clone().restore(&ctx)?;
                match promise.state() {
                    PromiseState::Pending => Ok(false),
                    _ => {
                        promise
                            .result::<()>()
                            .unwrap()
                            .catch(&ctx)
                            .map_err(|e| anyhow!("Module evaluation: {e}"))?;
                        Ok(true)
                    }
                }
            })?;
        }
        if let Some(error) = rejections.borrow().values().next() {
            bail!("Unhandled promise rejection: {error}");
        }
        if control_protocol && ready && !was_ready {
            let mut out = io::stdout().lock();
            writeln!(out, "{{\"type\":\"ready\",\"protocol\":1}}")?;
            out.flush()?;
        }

        // Rotate task sources so a notification flood cannot starve a stop command.
        let mut task = None;
        for offset in 0..4 {
            let source = (next_source + offset) % 4;
            task = match source {
                0 => host
                    .borrow()
                    .timers
                    .iter()
                    .filter(|(_, at)| **at <= Instant::now())
                    .min_by_key(|(_, at)| **at)
                    .map(|(id, _)| Task::Timer(*id)),
                1 => network.borrow_mut().poll().map(Task::Network),
                2 => bluetooth.borrow_mut().poll().map(Task::Bluetooth),
                3 if (ready || control_protocol) && !eof => {
                    match input.as_ref().unwrap().try_recv() {
                        Ok(event) => Some(Task::Input(event)),
                        Err(TryRecvError::Disconnected) => Some(Task::Input(Input::Eof)),
                        Err(TryRecvError::Empty) => None,
                    }
                }
                _ => None,
            };
            if task.is_some() {
                next_source = (source + 1) % 4;
                break;
            }
        }
        if let Some(task) = task {
            deadline.set(Instant::now() + budget);
            match task {
                Task::Timer(id) => {
                    host.borrow_mut().timers.remove(&id);
                    context.with(|ctx| -> Result<()> {
                        let object = bridge.clone().restore(&ctx)?;
                        let fire: Function = object.get("fire")?;
                        fire.call::<_, ()>((id,))
                            .catch(&ctx)
                            .map_err(|e| anyhow!("Timer callback: {e}"))
                    })?;
                }
                Task::Input(Input::Error(error)) => bail!(error),
                Task::Input(Input::Stop) => return Ok(()),
                Task::Input(Input::Eof) => eof = true,
                task => {
                    let (bridge, method, text) = match task {
                        Task::Input(Input::Message(text)) => {
                            ensure!(ready, "Host sent a message before the worker was ready");
                            (&bridge, "dispatch", text)
                        }
                        Task::Network(event) => (&web, "network", event.to_string()),
                        Task::Bluetooth(event) => (&ble, "bluetooth", event.to_string()),
                        _ => unreachable!(),
                    };
                    context.with(|ctx| -> Result<()> {
                        let object = bridge.clone().restore(&ctx)?;
                        let dispatch: Function = object.get(method)?;
                        dispatch
                            .call::<_, ()>((text,))
                            .catch(&ctx)
                            .map_err(|e| anyhow!("{method} callback: {e}"))
                    })?;
                }
            }
            continue;
        }
        let next_timer = host.borrow().timers.values().min().copied();
        if !ready
            && next_timer.is_none()
            && !network.borrow().pending()
            && !bluetooth.borrow().pending()
        {
            bail!("Top-level await is pending without a runnable task");
        }
        if ready
            && eof
            && next_timer.is_none()
            && !network.borrow().pending()
            && !bluetooth.borrow().pending()
        {
            return Ok(());
        }
        let wake = next_timer.into_iter().chain(total).min();
        let wait = wake
            .map(|at| at.saturating_duration_since(Instant::now()))
            .unwrap_or(Duration::from_secs(60));
        let _ = wake_rx.recv_timeout(wait);
    }
}
