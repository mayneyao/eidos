import {
  EXTENSION_SURFACE_BOOTSTRAP_CHANNEL,
  EXTENSION_SURFACE_PROTOCOL_VERSION,
} from "@eidos.space/extension-surface-protocol"

export interface ExtensionSurfaceBootstrapOptions {
  bundleCode: string
  extensionId: string
  generation: string
}

const BLOCKED_SURFACE_GLOBALS = [
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
  "Worker",
  "SharedWorker",
  "indexedDB",
  "caches",
] as const

const THEME_PROPERTIES = {
  background: "--eidos-color-background",
  foreground: "--eidos-color-foreground",
  mutedBackground: "--eidos-color-muted-background",
  mutedForeground: "--eidos-color-muted-foreground",
  border: "--eidos-color-border",
  accent: "--eidos-color-accent",
  accentForeground: "--eidos-color-accent-foreground",
  destructive: "--eidos-color-destructive",
  destructiveForeground: "--eidos-color-destructive-foreground",
  focusRing: "--eidos-color-focus-ring",
  fontFamily: "--eidos-font-family",
  monoFontFamily: "--eidos-font-family-mono",
} as const

/**
 * Wrap one self-contained UI bundle in the fixed surface client. The bundle is
 * transferred as JavaScript bytes, never interpolated into iframe HTML.
 */
export function createExtensionSurfaceSource(
  options: ExtensionSurfaceBootstrapOptions
): string {
  const extensionId = JSON.stringify(options.extensionId)
  const generation = JSON.stringify(options.generation)
  const blockedGlobals = JSON.stringify(BLOCKED_SURFACE_GLOBALS)
  const themeProperties = JSON.stringify(THEME_PROPERTIES)
  return `(() => {
  "use strict";
  const EXTENSION_ID = ${extensionId};
  const GENERATION = ${generation};
  const PROTOCOL_VERSION = ${EXTENSION_SURFACE_PROTOCOL_VERSION};
  const BLOCKED_GLOBALS = ${blockedGlobals};
  const THEME_PROPERTIES = ${themeProperties};
  let port;
  let disposed = false;
  let initialized = false;
  let sequence = 0;
  let snapshot;
  let appearance;
  let capabilities;
  let activationDisposable;
  const pending = new Map();
  const subscriptions = new Set();
  const changeListeners = new Set();
  const stateListeners = new Set();
  const saveStateListeners = new Set();
  const appearanceListeners = new Set();

  const runtimeError = (error) => error instanceof Error ? error.message : String(error);
  const deepFreeze = (value) => {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    for (const nested of Object.values(value)) deepFreeze(nested);
    return Object.freeze(value);
  };
  const disposable = (dispose) => {
    let active = true;
    return Object.freeze({
      dispose() {
        if (!active) return;
        active = false;
        dispose();
      },
    });
  };
  const listen = (listeners, listener) => {
    if (typeof listener !== "function") throw new Error("Extension listener must be a function");
    listeners.add(listener);
    return disposable(() => listeners.delete(listener));
  };
  const emit = (listeners, event) => {
    for (const listener of [...listeners]) {
      try { listener(event); } catch (error) { console.error("Extension surface listener failed", error); }
    }
  };
  const send = (message) => {
    if (!port || disposed) throw new Error("Extension surface is disposed");
    port.postMessage(message);
  };
  const applyEdits = (text, edits) => {
    let next = text;
    for (let index = edits.length - 1; index >= 0; index -= 1) {
      const edit = edits[index];
      next = next.slice(0, edit.start) + edit.text + next.slice(edit.end);
    }
    return next;
  };
  const stateFrom = (message) => ({
    revision: message.revision,
    savedRevision: message.savedRevision,
    dirty: message.dirty,
    readOnly: message.readOnly,
    canUndo: message.canUndo,
    canRedo: message.canRedo,
    ...(message.externalConflict ? { externalConflict: message.externalConflict } : {}),
  });
  const setAppearance = (next) => {
    appearance = deepFreeze(next);
    document.documentElement.lang = appearance.locale;
    document.documentElement.style.colorScheme = appearance.colorScheme;
    document.documentElement.dataset.theme = appearance.colorScheme;
    for (const [name, property] of Object.entries(THEME_PROPERTIES)) {
      document.documentElement.style.setProperty(property, appearance.theme[name]);
    }
    emit(appearanceListeners, appearance);
  };
  const request = (type, extra = {}) => new Promise((resolve, reject) => {
    if (!snapshot) return reject(new Error("Extension surface is not initialized"));
    const requestId = "surface-" + (++sequence);
    pending.set(requestId, { resolve, reject });
    send({
      type,
      requestId,
      documentId: snapshot.documentId,
      baseRevision: snapshot.revision,
      ...extra,
    });
  });
  const documentApi = Object.freeze({
    get snapshot() { return snapshot; },
    applyEdits(edits) { return request("apply-edits", { edits }); },
    save() { return request("request-save"); },
    undo() { return request("request-undo"); },
    redo() { return request("request-redo"); },
    resync() { return request("request-resync"); },
    onDidChange(listener) { return listen(changeListeners, listener); },
    onDidChangeState(listener) { return listen(stateListeners, listener); },
    onDidChangeSaveState(listener) { return listen(saveStateListeners, listener); },
  });
  const appearanceApi = Object.freeze({
    get current() { return appearance; },
    onDidChange(listener) { return listen(appearanceListeners, listener); },
  });
  const subscriptionStore = Object.freeze({
    add(value) {
      if (!value || typeof value.dispose !== "function") {
        throw new Error("Extension subscriptions must be disposable");
      }
      subscriptions.add(value);
    },
  });

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    try { activationDisposable && activationDisposable.dispose(); } catch {}
    for (const value of [...subscriptions].reverse()) {
      try { value.dispose(); } catch {}
    }
    subscriptions.clear();
    for (const waiter of pending.values()) waiter.reject(new Error("Extension surface is disposed"));
    pending.clear();
    changeListeners.clear();
    stateListeners.clear();
    saveStateListeners.clear();
    appearanceListeners.clear();
    try { port && port.close(); } catch {}
  };

  const activate = async (message) => {
    if (initialized) throw new Error("Extension surface was initialized twice");
    if (message.protocolVersion !== PROTOCOL_VERSION || message.generation !== GENERATION) {
      throw new Error("Extension surface initialization is incompatible or stale");
    }
    initialized = true;
    snapshot = deepFreeze(message.snapshot);
    capabilities = deepFreeze(message.capabilities);
    setAppearance(message.appearance);
    const root = document.getElementById("eidos-extension-root");
    if (!root) throw new Error("Extension surface mount point is unavailable");
    const loadModule = () => {
${options.bundleCode}
      return __eidosExtensionModule;
    };
    const extensionModule = loadModule();
    if (!extensionModule || typeof extensionModule.activate !== "function") {
      throw new Error("UI entrypoint must export an activate(context) function");
    }
    const result = await extensionModule.activate(Object.freeze({
      extensionId: EXTENSION_ID,
      editorId: message.editorId,
      viewId: message.viewId,
      root,
      document: documentApi,
      appearance: appearanceApi,
      capabilities,
      subscriptions: subscriptionStore,
    }));
    if (result !== undefined) {
      if (!result || typeof result.dispose !== "function") {
        throw new Error("UI activate() must return void or a disposable");
      }
      activationDisposable = result;
    }
    send({ type: "activated" });
  };

  const onPortMessage = async (event) => {
    const message = event.data;
    if (!message || typeof message !== "object" || disposed) return;
    if (message.type === "initialize") {
      try { await activate(message); }
      catch (error) { send({ type: "activation-error", message: runtimeError(error) }); }
      return;
    }
    if (message.type === "request-result") {
      const waiter = pending.get(message.requestId);
      if (!waiter) return;
      pending.delete(message.requestId);
      if (message.ok) waiter.resolve(message.revision);
      else waiter.reject(Object.assign(new Error(message.error && message.error.message || "Host request failed"), { code: message.error && message.error.code }));
      return;
    }
    if (!snapshot) return;
    if (message.type === "document-changed") {
      if (message.documentId !== snapshot.documentId || message.revision !== snapshot.revision + 1) {
        void request("request-resync").catch(() => undefined);
        return;
      }
      snapshot = deepFreeze({
        ...snapshot,
        ...stateFrom(message),
        text: applyEdits(snapshot.text, message.edits),
      });
      emit(changeListeners, deepFreeze(message));
      return;
    }
    if (message.type === "document-replaced") {
      snapshot = deepFreeze(message.snapshot);
      emit(changeListeners, deepFreeze(message));
      return;
    }
    if (message.type === "document-state") {
      if (message.documentId !== snapshot.documentId) return;
      snapshot = deepFreeze({
        ...snapshot,
        ...stateFrom(message),
        persistedContentDigest: message.persistedContentDigest,
      });
      emit(stateListeners, deepFreeze(message));
      return;
    }
    if (message.type === "save-state") {
      if (message.documentId === snapshot.documentId) emit(saveStateListeners, deepFreeze(message));
      return;
    }
    if (message.type === "appearance-changed") {
      setAppearance(message.appearance);
      return;
    }
    if (message.type === "dispose") dispose();
  };

  const start = (nextPort, nextGeneration) => {
    if (port || !nextPort || nextGeneration !== GENERATION) return;
    for (const name of BLOCKED_GLOBALS) {
      try { Object.defineProperty(globalThis, name, { value: undefined, configurable: false, writable: false }); }
      catch { try { globalThis[name] = undefined; } catch {} }
    }
    try { Object.defineProperty(globalThis, "open", { value: undefined, configurable: false, writable: false }); } catch {}
    port = nextPort;
    port.addEventListener("message", onPortMessage);
    port.start();
    send({ type: "ready", protocolVersion: PROTOCOL_VERSION });
  };
  Object.defineProperty(globalThis, "__eidosStartSurface", {
    value: start,
    configurable: true,
    enumerable: false,
    writable: false,
  });
})();`
}

/** Fixed iframe document. It only loads the trusted wrapper from a Blob. */
export function createExtensionSurfaceHostHtml(): string {
  const channel = JSON.stringify(EXTENSION_SURFACE_BOOTSTRAP_CHANNEL)
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="referrer" content="no-referrer">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' blob:; style-src 'unsafe-inline'; connect-src 'none'; img-src data: blob:; media-src 'none'; font-src 'none'; object-src 'none'; frame-src 'none'; child-src 'none'; base-uri 'none'; form-action 'none'">
  <style>html,body,#eidos-extension-root{box-sizing:border-box;width:100%;height:100%;margin:0}body{overflow:auto;background:var(--eidos-color-background);color:var(--eidos-color-foreground);font-family:var(--eidos-font-family,system-ui,sans-serif)}</style>
</head>
<body>
  <div id="eidos-extension-root"></div>
  <script>
  (() => {
    "use strict";
    let started = false;
    window.addEventListener("message", (event) => {
      if (started || !event.data || event.data.type !== ${channel}) return;
      const port = event.ports && event.ports[0];
      if (!port || typeof event.data.source !== "string" || typeof event.data.generation !== "string") return;
      started = true;
      const blobUrl = URL.createObjectURL(new Blob([event.data.source], { type: "text/javascript" }));
      const script = document.createElement("script");
      script.src = blobUrl;
      script.onload = () => {
        URL.revokeObjectURL(blobUrl);
        const start = window.__eidosStartSurface;
        try { delete window.__eidosStartSurface; } catch {}
        if (typeof start === "function") start(port, event.data.generation);
        else port.close();
      };
      script.onerror = () => {
        URL.revokeObjectURL(blobUrl);
        port.postMessage({ type: "activation-error", message: "Unable to load extension UI" });
        port.close();
      };
      document.head.append(script);
    }, { once: true });
  })();
  </script>
</body>
</html>`
}

export function extensionSurfaceDataUrl(): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(createExtensionSurfaceHostHtml())}`
}
