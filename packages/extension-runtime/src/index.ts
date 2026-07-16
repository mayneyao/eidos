import type { ExtensionJsonValue as ExtensionRuntimeJsonValue } from "@eidos.space/extension-surface-protocol"

export type { ExtensionRuntimeJsonValue }

export const EXTENSION_RUNTIME_PROTOCOL_VERSION = 1 as const
export const EXTENSION_RUNTIME_BOOTSTRAP_CHANNEL =
  "file-extension-runtime:bootstrap" as const

export type ExtensionRuntimeErrorCode =
  | "RUNTIME_ACTIVATION_FAILED"
  | "RUNTIME_COMMAND_MISSING"
  | "RUNTIME_COMMAND_FAILED"
  | "RUNTIME_DISPOSED"
  | "RUNTIME_PROTOCOL_ERROR"
  | "RUNTIME_STALE"
  | "RUNTIME_TIMEOUT"
  | "CAPABILITY_DENIED"

export interface ExtensionRuntimeError {
  code: ExtensionRuntimeErrorCode
  message: string
}

export interface ExtensionRuntimeResource {
  path: string
}

export interface ExtensionRuntimeInvokeRequest {
  type: "invoke"
  requestId: string
  commandId: string
  resource: ExtensionRuntimeResource
}

export interface ExtensionRuntimeRpcResult {
  type: "rpc-result"
  requestId: string
  ok: true
  value?: unknown
}

export interface ExtensionRuntimeRpcError {
  type: "rpc-result"
  requestId: string
  ok: false
  error: ExtensionRuntimeError
}

export interface ExtensionRuntimeDisposeRequest {
  type: "dispose"
  reason: string
}

export type ExtensionHostToWorkerMessage =
  | ExtensionRuntimeInvokeRequest
  | ExtensionRuntimeRpcResult
  | ExtensionRuntimeRpcError
  | ExtensionRuntimeDisposeRequest

export interface ExtensionRuntimeReady {
  type: "ready"
  generation: string
  commands: string[]
}

export interface ExtensionRuntimeActivationError {
  type: "activation-error"
  generation: string
  error: ExtensionRuntimeError
}

export type ExtensionRuntimeLogLevel =
  | "debug"
  | "info"
  | "log"
  | "warn"
  | "error"

export interface ExtensionRuntimeLog {
  type: "log"
  generation: string
  level: ExtensionRuntimeLogLevel
  message: string
}

export interface ExtensionRuntimeInvokeResult {
  type: "invoke-result"
  requestId: string
  ok: true
}

export interface ExtensionRuntimeInvokeError {
  type: "invoke-result"
  requestId: string
  ok: false
  error: ExtensionRuntimeError
}

export interface ExtensionRuntimeReadTextRequest {
  type: "rpc"
  requestId: string
  method: "space.files.readText"
  params: { path: string }
}

export interface ExtensionRuntimeNoticeRequest {
  type: "rpc"
  requestId: string
  method: "window.showNotice"
  params: { message: string }
}

export interface ExtensionRuntimeConfirmRequest {
  type: "rpc"
  requestId: string
  method: "window.confirm"
  params: {
    title: string
    message: string
    confirmLabel?: string
    cancelLabel?: string
  }
}

export interface ExtensionRuntimeSelectRequest {
  type: "rpc"
  requestId: string
  method: "window.select"
  params: {
    title: string
    placeholder?: string
    items: Array<{
      value: string
      label: string
      description?: string
    }>
  }
}

export interface ExtensionRuntimeOpenPanelRequest {
  type: "rpc"
  requestId: string
  method: "window.openPanel"
  params: {
    panelId: string
    state?: ExtensionRuntimeJsonValue
  }
}

export type ExtensionRuntimeRpcRequest =
  | ExtensionRuntimeReadTextRequest
  | ExtensionRuntimeNoticeRequest
  | ExtensionRuntimeConfirmRequest
  | ExtensionRuntimeSelectRequest
  | ExtensionRuntimeOpenPanelRequest

export type ExtensionWorkerToHostMessage =
  | ExtensionRuntimeReady
  | ExtensionRuntimeActivationError
  | ExtensionRuntimeLog
  | ExtensionRuntimeInvokeResult
  | ExtensionRuntimeInvokeError
  | ExtensionRuntimeRpcRequest

const RUNTIME_LOG_LEVELS = new Set<ExtensionRuntimeLogLevel>([
  "debug",
  "info",
  "log",
  "warn",
  "error",
])

const RUNTIME_ERROR_CODES = new Set<ExtensionRuntimeErrorCode>([
  "RUNTIME_ACTIVATION_FAILED",
  "RUNTIME_COMMAND_MISSING",
  "RUNTIME_COMMAND_FAILED",
  "RUNTIME_DISPOSED",
  "RUNTIME_PROTOCOL_ERROR",
  "RUNTIME_STALE",
  "RUNTIME_TIMEOUT",
  "CAPABILITY_DENIED",
])

export class ExtensionRuntimeProtocolError extends Error {
  readonly code = "RUNTIME_PROTOCOL_ERROR" as const

  constructor(message: string) {
    super(message)
    this.name = "ExtensionRuntimeProtocolError"
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ExtensionRuntimeProtocolError(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function text(value: unknown, label: string, maxLength: number): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maxLength
  ) {
    throw new ExtensionRuntimeProtocolError(
      `${label} must be a non-empty string no longer than ${maxLength} characters`
    )
  }
  return value
}

function optionalText(
  value: unknown,
  label: string,
  maxLength: number
): string | undefined {
  return value === undefined ? undefined : text(value, label, maxLength)
}

const PANEL_STATE_MAX_BYTES = 64 * 1024
const PANEL_STATE_MAX_DEPTH = 12
const PANEL_STATE_MAX_NODES = 2_048

function jsonValue(value: unknown, label: string): ExtensionRuntimeJsonValue {
  let nodes = 0
  const visit = (input: unknown, depth: number): ExtensionRuntimeJsonValue => {
    nodes += 1
    if (nodes > PANEL_STATE_MAX_NODES) {
      throw new ExtensionRuntimeProtocolError(
        `${label} must contain at most ${PANEL_STATE_MAX_NODES} values`
      )
    }
    if (depth > PANEL_STATE_MAX_DEPTH) {
      throw new ExtensionRuntimeProtocolError(
        `${label} must be at most ${PANEL_STATE_MAX_DEPTH} levels deep`
      )
    }
    if (
      input === null ||
      typeof input === "boolean" ||
      typeof input === "string"
    ) {
      return input
    }
    if (typeof input === "number" && Number.isFinite(input)) return input
    if (Array.isArray(input)) {
      return Array.from(input, (item) => visit(item, depth + 1))
    }
    if (typeof input === "object") {
      const output = Object.create(null) as Record<
        string,
        ExtensionRuntimeJsonValue
      >
      for (const [key, item] of Object.entries(input)) {
        if (key.length === 0 || key.length > 256) {
          throw new ExtensionRuntimeProtocolError(
            `${label} object keys must be between 1 and 256 characters`
          )
        }
        output[key] = visit(item, depth + 1)
      }
      return output
    }
    throw new ExtensionRuntimeProtocolError(`${label} must be JSON-safe`)
  }
  const parsed = visit(value, 0)
  if (
    new TextEncoder().encode(JSON.stringify(parsed)).byteLength >
    PANEL_STATE_MAX_BYTES
  ) {
    throw new ExtensionRuntimeProtocolError(
      `${label} must be no larger than ${PANEL_STATE_MAX_BYTES} bytes`
    )
  }
  return parsed
}

function runtimeError(value: unknown): ExtensionRuntimeError {
  const input = record(value, "Runtime error")
  if (
    typeof input.code !== "string" ||
    !RUNTIME_ERROR_CODES.has(input.code as ExtensionRuntimeErrorCode)
  ) {
    throw new ExtensionRuntimeProtocolError("Runtime error code is invalid")
  }
  return {
    code: input.code as ExtensionRuntimeErrorCode,
    message: text(input.message, "Runtime error message", 4096),
  }
}

function rpcRequest(
  input: Record<string, unknown>,
  requestId: string
): ExtensionRuntimeRpcRequest {
  const method = text(input.method, "RPC method", 128)
  const params = record(input.params, "RPC parameters")
  if (method === "space.files.readText") {
    return {
      type: "rpc",
      requestId,
      method,
      params: { path: text(params.path, "Space path", 4096) },
    }
  }
  if (method === "window.showNotice") {
    return {
      type: "rpc",
      requestId,
      method,
      params: { message: text(params.message, "Notice", 4096) },
    }
  }
  if (method === "window.confirm") {
    return {
      type: "rpc",
      requestId,
      method,
      params: {
        title: text(params.title, "Confirm title", 256),
        message: text(params.message, "Confirm message", 4096),
        confirmLabel: optionalText(params.confirmLabel, "Confirm label", 128),
        cancelLabel: optionalText(params.cancelLabel, "Cancel label", 128),
      },
    }
  }
  if (method === "window.select") {
    if (!Array.isArray(params.items) || params.items.length > 100) {
      throw new ExtensionRuntimeProtocolError(
        "Select items must be an array with at most 100 entries"
      )
    }
    const seen = new Set<string>()
    const items = params.items.map((value, index) => {
      const item = record(value, `Select item ${index}`)
      const itemValue = text(item.value, `Select item ${index} value`, 256)
      if (seen.has(itemValue)) {
        throw new ExtensionRuntimeProtocolError(
          `Select item value is duplicated: ${itemValue}`
        )
      }
      seen.add(itemValue)
      return {
        value: itemValue,
        label: text(item.label, `Select item ${index} label`, 256),
        description: optionalText(
          item.description,
          `Select item ${index} description`,
          1024
        ),
      }
    })
    return {
      type: "rpc",
      requestId,
      method,
      params: {
        title: text(params.title, "Select title", 256),
        placeholder: optionalText(
          params.placeholder,
          "Select placeholder",
          256
        ),
        items,
      },
    }
  }
  if (method === "window.openPanel") {
    return {
      type: "rpc",
      requestId,
      method,
      params: {
        panelId: text(params.panelId, "Panel ID", 256),
        state:
          params.state === undefined
            ? undefined
            : jsonValue(params.state, "Panel state"),
      },
    }
  }
  throw new ExtensionRuntimeProtocolError(`Unsupported runtime RPC: ${method}`)
}

/** Parse every message crossing the untrusted worker boundary. */
export function parseExtensionWorkerMessage(
  value: unknown
): ExtensionWorkerToHostMessage {
  const input = record(value, "Worker message")
  const type = text(input.type, "Worker message type", 64)
  if (type === "ready") {
    if (!Array.isArray(input.commands) || input.commands.length > 256) {
      throw new ExtensionRuntimeProtocolError(
        "Ready commands must be an array with at most 256 entries"
      )
    }
    const commands = input.commands.map((command, index) =>
      text(command, `Ready command ${index}`, 256)
    )
    if (new Set(commands).size !== commands.length) {
      throw new ExtensionRuntimeProtocolError("Ready commands are duplicated")
    }
    return {
      type,
      generation: text(input.generation, "Runtime generation", 256),
      commands,
    }
  }
  if (type === "activation-error") {
    return {
      type,
      generation: text(input.generation, "Runtime generation", 256),
      error: runtimeError(input.error),
    }
  }
  if (type === "log") {
    const level = text(input.level, "Runtime log level", 16)
    if (!RUNTIME_LOG_LEVELS.has(level as ExtensionRuntimeLogLevel)) {
      throw new ExtensionRuntimeProtocolError("Runtime log level is invalid")
    }
    return {
      type,
      generation: text(input.generation, "Runtime generation", 256),
      level: level as ExtensionRuntimeLogLevel,
      message: text(input.message, "Runtime log message", 4096),
    }
  }
  if (type === "invoke-result") {
    const requestId = text(input.requestId, "Invoke request ID", 128)
    if (input.ok === true) return { type, requestId, ok: true }
    if (input.ok === false) {
      return { type, requestId, ok: false, error: runtimeError(input.error) }
    }
    throw new ExtensionRuntimeProtocolError(
      "Invoke result must include a boolean ok field"
    )
  }
  if (type === "rpc") {
    return rpcRequest(input, text(input.requestId, "RPC request ID", 128))
  }
  throw new ExtensionRuntimeProtocolError(`Unsupported worker message: ${type}`)
}

export interface ExtensionWorkerBootstrapOptions {
  bundleCode: string
  extensionId: string
  generation: string
  commandIds: readonly string[]
  panelIds: readonly string[]
}

const BLOCKED_WORKER_GLOBALS = [
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
  "Worker",
  "SharedWorker",
  "importScripts",
  "indexedDB",
  "caches",
] as const

/**
 * Build trusted bootstrap source around one self-contained extension bundle.
 * The containing Electron session and CSP also deny network requests; removing
 * browser globals here is a defense-in-depth layer, not the sole boundary.
 */
export function createExtensionWorkerSource(
  options: ExtensionWorkerBootstrapOptions
): string {
  const extensionId = JSON.stringify(options.extensionId)
  const generation = JSON.stringify(options.generation)
  const commandIds = JSON.stringify([...new Set(options.commandIds)].sort())
  const panelIds = JSON.stringify([...new Set(options.panelIds)].sort())
  const blockedGlobals = JSON.stringify(BLOCKED_WORKER_GLOBALS)
  return `(() => {
  "use strict";
  const EXTENSION_ID = ${extensionId};
  const GENERATION = ${generation};
  const ALLOWED_COMMANDS = new Set(${commandIds});
  const ALLOWED_PANELS = new Set(${panelIds});
  const BLOCKED_GLOBALS = ${blockedGlobals};
  for (const name of BLOCKED_GLOBALS) {
    try {
      Object.defineProperty(globalThis, name, { value: undefined, configurable: false, writable: false });
    } catch {
      try { globalThis[name] = undefined; } catch {}
    }
  }

  const addGlobalListener = globalThis.addEventListener.bind(globalThis);
  const handlers = new Map();
  const pending = new Map();
  const subscriptions = new Set();
  let port;
  let disposed = false;
  let sequence = 0;

  const runtimeError = (code, error) => ({
    code,
    message: error instanceof Error ? error.message : String(error),
  });
  const send = (message) => {
    if (!port || disposed) throw new Error("Extension runtime is disposed");
    port.postMessage(message);
  };
  const formatLogArgument = (value) => {
    if (typeof value === "string") return value;
    if (value instanceof Error) return value.name + ": " + value.message;
    try {
      const seen = new WeakSet();
      const json = JSON.stringify(value, (_key, item) => {
        if (typeof item === "bigint") return String(item) + "n";
        if (typeof item === "function") return "[Function " + (item.name || "anonymous") + "]";
        if (typeof item === "symbol") return String(item);
        if (item && typeof item === "object") {
          if (seen.has(item)) return "[Circular]";
          seen.add(item);
        }
        return item;
      });
      return json === undefined ? String(value) : json;
    } catch {
      try { return String(value); } catch { return "[Unprintable]"; }
    }
  };
  const emitLog = (level, values) => {
    try {
      const message = values.map(formatLogArgument).join(" ").slice(0, 4096);
      if (message) send({ type: "log", generation: GENERATION, level, message });
    } catch {}
  };
  const nativeConsole = globalThis.console && typeof globalThis.console === "object" ? globalThis.console : null;
  const runtimeConsole = Object.freeze(Object.assign(Object.create(nativeConsole), {
    debug: (...values) => emitLog("debug", values),
    info: (...values) => emitLog("info", values),
    log: (...values) => emitLog("log", values),
    warn: (...values) => emitLog("warn", values),
    error: (...values) => emitLog("error", values),
  }));
  const callHost = (method, params) => new Promise((resolve, reject) => {
    const requestId = "rpc-" + (++sequence);
    pending.set(requestId, { resolve, reject });
    send({ type: "rpc", requestId, method, params });
  });
  const assertText = (value, label, maxLength = 4096) => {
    if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
      throw new Error(label + " must be a non-empty string no longer than " + maxLength + " characters");
    }
    return value;
  };
  const context = Object.freeze({
    extensionId: EXTENSION_ID,
    subscriptions: Object.freeze({
      add(disposable) {
        if (!disposable || typeof disposable.dispose !== "function") {
          throw new Error("Extension subscriptions must be disposable");
        }
        subscriptions.add(disposable);
      },
    }),
    commands: Object.freeze({
      register(commandId, handler) {
        assertText(commandId, "Command ID", 256);
        if (!ALLOWED_COMMANDS.has(commandId)) {
          throw new Error("Command is not declared by this extension: " + commandId);
        }
        if (typeof handler !== "function") throw new Error("Command handler must be a function");
        if (handlers.has(commandId)) throw new Error("Command is already registered: " + commandId);
        handlers.set(commandId, handler);
        let active = true;
        return Object.freeze({
          dispose() {
            if (!active) return;
            active = false;
            handlers.delete(commandId);
          },
        });
      },
    }),
    space: Object.freeze({
      files: Object.freeze({
        async readText(path) {
          return callHost("space.files.readText", { path: assertText(path, "Space path", 4096) });
        },
      }),
    }),
    window: Object.freeze({
      showNotice(notice) {
        const message = typeof notice === "string" ? notice : notice && notice.message;
        void callHost("window.showNotice", { message: assertText(message, "Notice", 4096) }).catch(() => undefined);
      },
      async confirm(request) {
        if (!request || typeof request !== "object") throw new Error("Confirm request is required");
        return Boolean(await callHost("window.confirm", request));
      },
      async select(request) {
        if (!request || typeof request !== "object") throw new Error("Select request is required");
        const result = await callHost("window.select", request);
        return typeof result === "string" ? result : undefined;
      },
      async openPanel(request) {
        if (!request || typeof request !== "object") throw new Error("Panel request is required");
        const panelId = assertText(request.panelId, "Panel ID", 256);
        if (!ALLOWED_PANELS.has(panelId)) {
          throw new Error("Panel is not declared by this extension: " + panelId);
        }
        await callHost("window.openPanel", { panelId, state: request.state });
      },
    }),
  });

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const disposable of [...subscriptions].reverse()) {
      try { disposable.dispose(); } catch {}
    }
    subscriptions.clear();
    handlers.clear();
    for (const waiter of pending.values()) waiter.reject(new Error("Extension runtime is disposed"));
    pending.clear();
    try { port && port.close(); } catch {}
    try { globalThis.close(); } catch {}
  };

  const onPortMessage = async (event) => {
    const message = event.data;
    if (!message || typeof message !== "object") return;
    if (message.type === "rpc-result") {
      const waiter = pending.get(message.requestId);
      if (!waiter) return;
      pending.delete(message.requestId);
      if (message.ok) waiter.resolve(message.value);
      else waiter.reject(Object.assign(new Error(message.error && message.error.message || "Host request failed"), { code: message.error && message.error.code }));
      return;
    }
    if (message.type === "dispose") {
      dispose();
      return;
    }
    if (message.type !== "invoke" || disposed) return;
    const handler = handlers.get(message.commandId);
    if (!handler) {
      send({ type: "invoke-result", requestId: message.requestId, ok: false, error: runtimeError("RUNTIME_COMMAND_MISSING", "Command is not registered: " + message.commandId) });
      return;
    }
    try {
      await handler(Object.freeze({ path: message.resource && message.resource.path }));
      send({ type: "invoke-result", requestId: message.requestId, ok: true });
    } catch (error) {
      send({ type: "invoke-result", requestId: message.requestId, ok: false, error: runtimeError("RUNTIME_COMMAND_FAILED", error) });
    }
  };

  addGlobalListener("message", async (event) => {
    if (port || !event.data || event.data.type !== "eidos-extension-connect" || event.data.generation !== GENERATION) return;
    const nextPort = event.ports && event.ports[0];
    if (!nextPort) return;
    port = nextPort;
    port.addEventListener("message", onPortMessage);
    port.start();
    try {
      try {
        Object.defineProperty(globalThis, "console", { value: runtimeConsole, configurable: false, writable: false });
      } catch {
        try { globalThis.console = runtimeConsole; } catch {}
      }
      const loadModule = () => {
${options.bundleCode}
        return __eidosExtensionModule;
      };
      const extensionModule = loadModule();
      if (!extensionModule || typeof extensionModule.activate !== "function") {
        throw new Error("Worker entrypoint must export an activate(context) function");
      }
      await extensionModule.activate(context);
      send({ type: "ready", generation: GENERATION, commands: [...handlers.keys()].sort() });
    } catch (error) {
      send({ type: "activation-error", generation: GENERATION, error: runtimeError("RUNTIME_ACTIVATION_FAILED", error) });
    }
  });
})();`
}

/** HTML loaded in a sandboxed renderer with a fixed transport-only preload. */
export function createExtensionRuntimeHostHtml(): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; worker-src blob:; connect-src 'none'; img-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; style-src 'none'; base-uri 'none'; form-action 'none'">
</head>
<body>
<script>
(() => {
  "use strict";
  let started = false;
  window.addEventListener("message", (event) => {
    if (started || !event.data || event.data.type !== "eidos-extension-bootstrap") return;
    const port = event.ports && event.ports[0];
    if (!port || typeof event.data.source !== "string" || typeof event.data.generation !== "string") return;
    started = true;
    const blobUrl = URL.createObjectURL(new Blob([event.data.source], { type: "text/javascript" }));
    const worker = new Worker(blobUrl, { name: "eidos-extension-worker" });
    URL.revokeObjectURL(blobUrl);
    worker.postMessage({ type: "eidos-extension-connect", generation: event.data.generation }, [port]);
  }, { once: true });
})();
</script>
</body>
</html>`
}

export function extensionRuntimeDataUrl(): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(createExtensionRuntimeHostHtml())}`
}
