//! Isolated, bounded plugin computation. File mutation remains owned by each host.
use anyhow::{bail, ensure, Result};
use rquickjs::{Context, Function, Module, Promise, Runtime};
use serde_json::Value;
use std::time::{Duration, Instant};

const BOOTSTRAP: &str = include_str!("../../../packages/plugin-runtime/src/file-hook-vm.js");

pub fn run(request: &Value) -> Result<Value> {
    let code = request["code"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("Missing hook module"))?;
    ensure!(code.len() <= 16 * 1024 * 1024, "Hook module exceeds limit");
    let input = &request["input"];
    ensure!(
        input["event"]["source"] == "local",
        "Hooks accept local events only"
    );
    let runtime = Runtime::new()?;
    runtime.set_memory_limit(32 * 1024 * 1024);
    runtime.set_max_stack_size(512 * 1024);
    let deadline = Instant::now() + Duration::from_secs(2);
    runtime.set_interrupt_handler(Some(Box::new(move || Instant::now() >= deadline)));
    let context = Context::full(&runtime)?;
    let output: String = context.with(|ctx| -> Result<String> {
        ctx.eval::<(), _>(BOOTSTRAP)?;
        ctx.eval::<(), _>(format!("globalThis.__eidosHookInput = {};", input))?;
        let (module, ready) = Module::declare(ctx.clone(), "hook.js", code)?.eval()?;
        ready.finish::<()>()?;
        let activate: Function = module.get("default")?;
        let run: Function = ctx.globals().get("__eidosRunFileHook")?;
        let input: rquickjs::Value = ctx.globals().get("__eidosHookInput")?;
        let promise: Promise = run.call((activate, input))?;
        Ok(promise.finish::<String>()?)
    })?;
    let mut result: Value = serde_json::from_str(&output)?;
    validate_plan(
        &result["plan"],
        &request["declaration"],
        &request["input"]["event"],
    )?;
    let event = &request["input"]["event"];
    if let Some(plan) = result["plan"].as_object_mut() {
        if plan.get("text") == Some(&event["document"]["text"]) {
            plan.remove("text");
        }
        if plan.get("name").and_then(Value::as_str)
            == event["path"]
                .as_str()
                .and_then(|path| path.rsplit('/').next())
        {
            plan.remove("name");
        }
        if plan.is_empty() {
            result["plan"] = Value::Null;
        }
    }
    Ok(result)
}

fn validate_plan(plan: &Value, declaration: &Value, event: &Value) -> Result<()> {
    if plan.is_null() {
        return Ok(());
    }
    let fields = plan
        .as_object()
        .ok_or_else(|| anyhow::anyhow!("Invalid hook plan"))?;
    ensure!(
        fields.keys().all(|key| key == "name" || key == "text"),
        "Unknown hook plan field"
    );
    ensure!(
        fields.is_empty() || declaration["access"] == "write",
        "Hook is read-only"
    );
    if let Some(text) = fields.get("text") {
        ensure!(
            text.as_str()
                .is_some_and(|text| text.len() <= 2 * 1024 * 1024),
            "Invalid hook text"
        );
    }
    if let Some(name) = fields.get("name") {
        let name = name
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Invalid hook filename"))?;
        ensure!(
            !name.is_empty()
                && name.len() <= 200
                && !name.starts_with('.')
                && !name.ends_with(['.', ' '])
                && !name.chars().any(|c| c < ' ' || "<>:\"/\\|?*".contains(c)),
            "Invalid hook filename"
        );
        let stem = name.split('.').next().unwrap_or("").to_ascii_uppercase();
        if matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
            || (stem.len() == 4
                && (stem.starts_with("COM") || stem.starts_with("LPT"))
                && matches!(stem.as_bytes()[3], b'1'..=b'9'))
        {
            bail!("Reserved hook filename");
        }
        let path = event["path"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing event path"))?;
        ensure!(
            name.rsplit_once('.')
                .map(|(_, ext)| ext.to_ascii_lowercase())
                == path
                    .rsplit_once('.')
                    .map(|(_, ext)| ext.to_ascii_lowercase()),
            "Hook must retain the extension"
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn request(code: &str) -> Value {
        json!({"code":code,"declaration":{"access":"write"},"input":{"hooks":["saved"],"actions":[],"formatters":[],"hook":"saved","settings":{},"event":{"source":"local","path":"old.md","document":{"text":"# New","version":"one"}}}})
    }
    #[test]
    fn isolated_async_activation_and_plan() {
        let result = run(&request("export default async ctx => { ctx.subscriptions.add(ctx.capabilities.hooks.register('saved', async ({event}) => ({name:event.document.text.slice(2)+'.md'}))); }" )).unwrap();
        assert_eq!(result["plan"]["name"], "New.md");
    }
    #[test]
    fn invalid_or_missing_registration_and_escaping_paths_fail() {
        assert!(run(&request("export default ctx => {}")).is_err());
        assert!(run(&request("export default ctx => {ctx.capabilities.hooks.register('saved', () => ({name:'../escape.md'}))}" )).is_err());
        assert!(run(&request("export default ctx => {ctx.capabilities.hooks.register('saved', () => ({name:'CON.md'}))}" )).is_err());
    }
    #[test]
    fn has_no_ambient_host_capabilities() {
        let result = run(&request("export default ctx => {ctx.capabilities.hooks.register('saved', () => ({text:[typeof fetch,typeof process,typeof document,typeof require].join(',')}))}" )).unwrap();
        assert_eq!(
            result["plan"]["text"],
            "undefined,undefined,undefined,undefined"
        );
    }
    #[test]
    fn hybrid_extensions_register_actions_without_granting_action_capabilities() {
        let mut input = request("export default ctx => { ctx.capabilities.actions.registerTableProvider('table', {getItems: () => [], run: async () => {}}); ctx.capabilities.hooks.register('saved', () => ({name:'New.md'})); return {dispose(){}}; }");
        input["input"]["actions"] = json!(["table"]);
        assert_eq!(run(&input).unwrap()["plan"]["name"], "New.md");
        input["code"] = json!("export default ctx => {ctx.capabilities.actions.register('table', undefined); ctx.capabilities.hooks.register('saved', () => null);}");
        assert!(run(&input).is_err());
    }
    #[test]
    fn runaway_plugin_is_interrupted() {
        let start = Instant::now();
        assert!(run(&request("export default ctx => {while(true){}}")).is_err());
        assert!(start.elapsed() < Duration::from_secs(4));
    }
}
