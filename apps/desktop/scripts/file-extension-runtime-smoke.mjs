import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { app, BrowserWindow, MessageChannelMain, session } from "electron"
import {
  createExtensionEidosFileViewTemplate,
  createExtensionCommandTemplate,
  createExtensionPanelTemplate,
  createExtensionTextEditorTemplate,
} from "@eidos.space/extension-manifest"
import { inspectExtensionPackageSnapshot } from "@eidos.space/extension-manifest/node"
import {
  EXTENSION_RUNTIME_BOOTSTRAP_CHANNEL,
  createExtensionWorkerSource,
  extensionRuntimeDataUrl,
} from "@eidos.space/extension-runtime"
import {
  compileExtensionSurface,
  compileExtensionWorker,
} from "@eidos.space/extension-runtime/compiler"
import {
  createExtensionSurfaceSource,
  extensionSurfaceDataUrl,
} from "@eidos.space/extension-runtime/surface"
import {
  EXTENSION_SURFACE_BOOTSTRAP_CHANNEL,
  EXTENSION_SURFACE_PROTOCOL_VERSION,
} from "@eidos.space/extension-surface-protocol"

const desktopRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
)
const workspaceRoot = path.resolve(desktopRoot, "../..")
const preload = path.join(
  desktopRoot,
  "dist-electron",
  "file-extension-runtime-preload.cjs"
)
const exampleRoot = path.join(
  workspaceRoot,
  "apps",
  "docs",
  "examples",
  "markdown-task-counter"
)
const taskBoardRoot = path.join(
  workspaceRoot,
  "apps",
  "docs",
  "examples",
  "markdown-task-board"
)

// The smoke opens one isolated renderer per scenario. Keep Electron alive
// between windows and quit only after every scenario has completed.
app.on("window-all-closed", () => {})

function bytes(content) {
  return new TextEncoder().encode(content)
}

const SMOKE_APPEARANCE = {
  colorScheme: "light",
  locale: "en",
  theme: {
    background: "rgb(255, 255, 255)",
    foreground: "rgb(17, 24, 39)",
    mutedBackground: "rgb(249, 250, 251)",
    mutedForeground: "rgb(107, 114, 128)",
    border: "rgb(209, 213, 219)",
    accent: "rgb(37, 99, 235)",
    accentForeground: "rgb(255, 255, 255)",
    destructive: "rgb(220, 38, 38)",
    destructiveForeground: "rgb(255, 255, 255)",
    focusRing: "rgb(59, 130, 246)",
    fontFamily: "system-ui, sans-serif",
    monoFontFamily: "ui-monospace, monospace",
  },
}

function createRuntimeSession(scenarioId) {
  const runtimeSession = session.fromPartition(
    `eidos-file-extension-smoke-${scenarioId}-${Date.now()}`,
    { cache: false }
  )
  runtimeSession.setPermissionCheckHandler(() => false)
  runtimeSession.setPermissionRequestHandler((_contents, _permission, done) =>
    done(false)
  )
  runtimeSession.webRequest.onBeforeRequest(
    {
      urls: [
        "http://*/*",
        "https://*/*",
        "file://*/*",
        "ws://*/*",
        "wss://*/*",
      ],
    },
    (_details, done) => done({ cancel: true })
  )
  return runtimeSession
}

function observeRuntimeWindow(runtimeWindow, label) {
  runtimeWindow.webContents.on(
    "preload-error",
    (_event, preloadPath, error) => {
      console.error(`${label} preload failed: ${preloadPath}`, error)
    }
  )
  runtimeWindow.webContents.on("did-fail-load", (_event, code, description) => {
    console.error(`${label} failed to load (${code}): ${description}`)
  })
  runtimeWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error(`${label} renderer exited`, details)
  })
  runtimeWindow.webContents.on("console-message", (event) => {
    console.error(`${label} console (${event.level}): ${event.message}`)
  })
  runtimeWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }))
}

async function runCommandScenario({
  scenarioId,
  extensionId,
  commandId,
  entrypoint,
  files,
  resourcePath,
  handleRpc,
  panelIds = [],
}) {
  const generation = `smoke-${scenarioId}`
  const bundle = await compileExtensionWorker({ entrypoint, files })
  const source = createExtensionWorkerSource({
    bundleCode: bundle.code,
    extensionId,
    generation,
    commandIds: [commandId],
    panelIds,
  })
  const runtimeSession = createRuntimeSession(scenarioId)
  const runtimeWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      session: runtimeSession,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      contextIsolation: true,
      webSecurity: true,
      devTools: false,
      preload,
    },
  })
  observeRuntimeWindow(runtimeWindow, `${scenarioId} runtime`)

  let hostPort
  try {
    await runtimeWindow.loadURL(extensionRuntimeDataUrl())
    const { port1, port2 } = new MessageChannelMain()
    hostPort = port2
    let sawExpectedRpc = false
    let sawInvokeResult = false
    const invokeRequestId = `${scenarioId}-invoke`

    await new Promise((resolve, reject) => {
      let settled = false
      const timeout = setTimeout(
        () => fail(new Error(`${scenarioId} extension smoke timed out`)),
        10_000
      )
      const fail = (error) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        reject(error)
      }
      const finish = () => {
        if (settled || !sawExpectedRpc || !sawInvokeResult) return
        settled = true
        clearTimeout(timeout)
        resolve()
      }

      port2.on("message", ({ data }) => {
        void (async () => {
          if (data?.type === "activation-error") {
            throw new Error(
              `Extension activation failed: ${data.error?.message ?? "Unknown error"}`
            )
          }
          if (data?.type === "ready") {
            if (
              data.generation !== generation ||
              !Array.isArray(data.commands) ||
              data.commands.length !== 1 ||
              data.commands[0] !== commandId
            ) {
              throw new Error("Worker activated with an unexpected contract")
            }
            port2.postMessage({
              type: "invoke",
              requestId: invokeRequestId,
              commandId,
              resource: { path: resourcePath },
            })
            return
          }
          if (data?.type === "rpc") {
            const result = await handleRpc(data)
            sawExpectedRpc ||= result.completes === true
            port2.postMessage({
              type: "rpc-result",
              requestId: data.requestId,
              ok: true,
              value: result.value,
            })
            finish()
            return
          }
          if (
            data?.type === "invoke-result" &&
            data.requestId === invokeRequestId
          ) {
            if (!data.ok) {
              throw new Error(
                `Extension invocation failed: ${data.error?.message ?? "Unknown error"}`
              )
            }
            sawInvokeResult = true
            finish()
          }
        })().catch(fail)
      })
      port2.start()
      runtimeWindow.webContents.postMessage(
        EXTENSION_RUNTIME_BOOTSTRAP_CHANNEL,
        { type: "eidos-extension-bootstrap", source, generation },
        [port1]
      )
    })
    console.log(`${scenarioId} extension smoke passed`)
  } finally {
    try {
      hostPort?.close()
    } catch {}
    if (!runtimeWindow.isDestroyed()) runtimeWindow.destroy()
    await runtimeSession.clearStorageData()
  }
}

async function runSurfaceScenario({
  scenarioId,
  extensionId,
  editorId,
  entrypoint,
  files,
  interaction,
  resourcePath,
  initialText,
  expectedText,
  cssMarker,
  expectedLog,
}) {
  const generation = `smoke-${scenarioId}`
  const bundle = await compileExtensionSurface({ entrypoint, files })
  const source = createExtensionSurfaceSource({
    bundleCode: bundle.code,
    extensionId,
    generation,
  })
  const runtimeSession = createRuntimeSession(scenarioId)
  const runtimeWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      session: runtimeSession,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      contextIsolation: true,
      webSecurity: true,
      devTools: false,
    },
  })
  observeRuntimeWindow(runtimeWindow, `${scenarioId} surface`)

  const initialize = {
    type: "initialize",
    surfaceKind: "file-editor",
    protocolVersion: EXTENSION_SURFACE_PROTOCOL_VERSION,
    packageId: extensionId,
    generation,
    editorId,
    viewId: `${scenarioId}-view`,
    snapshot: {
      documentId: `${scenarioId}-document`,
      resource: {
        path: resourcePath,
        mediaType: "text/markdown",
        languageId: "markdown",
        encoding: "utf-8",
      },
      text: initialText,
      persistedContentDigest: `sha256:${"3".repeat(64)}`,
      revision: 1,
      savedRevision: 1,
      dirty: false,
      readOnly: false,
      canUndo: false,
      canRedo: false,
    },
    capabilities: {
      editable: true,
      save: true,
      undoRedo: true,
      savePolicy: { mode: "afterDelay", delayMs: 700 },
    },
    appearance: SMOKE_APPEARANCE,
  }

  try {
    await runtimeWindow.loadURL(extensionSurfaceDataUrl())
    const result = await runtimeWindow.webContents.executeJavaScript(
      `new Promise((resolve, reject) => {
        const source = ${JSON.stringify(source)};
        const generation = ${JSON.stringify(generation)};
        const initialize = ${JSON.stringify(initialize)};
        const expectedText = ${JSON.stringify(expectedText)};
        const interaction = ${JSON.stringify(interaction)};
        const cssMarker = ${JSON.stringify(cssMarker)};
        const channel = new MessageChannel();
        const port = channel.port1;
        const surfaceLogs = [];
        let settled = false;
        const timeout = setTimeout(() => fail(new Error("Surface smoke timed out")), 10000);
        const fail = (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          try { port.close(); } catch {}
          reject(error);
        };
        const finish = (value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          try { port.close(); } catch {}
          resolve(value);
        };
        const applyEdits = (text, edits) => {
          let next = text;
          for (let index = edits.length - 1; index >= 0; index -= 1) {
            const edit = edits[index];
            next = next.slice(0, edit.start) + edit.text + next.slice(edit.end);
          }
          return next;
        };
        port.onmessage = (event) => {
          try {
            const message = event.data;
            if (message?.type === "activation-error") {
              throw new Error("Surface activation failed: " + message.message);
            }
            if (message?.type === "surface-log") {
              if (
                message.generation !== generation ||
                !["debug", "info", "log", "warn", "error"].includes(message.level) ||
                typeof message.message !== "string" ||
                message.message.length === 0 ||
                message.message.length > 4096
              ) {
                throw new Error("Surface emitted an invalid runtime log");
              }
              surfaceLogs.push(message);
              return;
            }
            if (message?.type === "ready") {
              if (message.protocolVersion !== initialize.protocolVersion) {
                throw new Error("Surface activated with an unexpected protocol");
              }
              port.postMessage(initialize);
              return;
            }
            if (message?.type === "activated") {
              if (typeof fetch !== "undefined" || typeof XMLHttpRequest !== "undefined") {
                throw new Error("Blocked network globals are still available");
              }
              if (interaction === "textarea") {
                const textarea = document.querySelector('textarea[aria-label="Document text"]');
                if (!(textarea instanceof HTMLTextAreaElement)) {
                  throw new Error("Generated surface did not render its text editor");
                }
                if (textarea.value !== initialize.snapshot.text) {
                  throw new Error("Generated surface did not render the initial document");
                }
                textarea.value = expectedText;
                textarea.dispatchEvent(new Event("input", { bubbles: true }));
                return;
              }
              if (interaction === "task-board") {
                const progress = document.querySelector(".progress-label");
                const task = Array.from(document.querySelectorAll(".task-card")).find(
                  (candidate) => candidate.textContent?.includes("Finish UI")
                );
                if (progress?.textContent !== "1 to do · 1 completed · 50%") {
                  throw new Error("Task Board did not render its initial counts");
                }
                if (!(task instanceof HTMLButtonElement)) {
                  throw new Error("Task Board did not render the open task");
                }
                task.click();
                return;
              }
              throw new Error("Unknown surface smoke interaction: " + interaction);
              return;
            }
            if (message?.type === "request-resync") {
              throw new Error("Generated surface unexpectedly requested a resync");
            }
            if (message?.type !== "apply-edits") return;
            if (
              message.documentId !== initialize.snapshot.documentId ||
              message.eidosFileRevision !== initialize.snapshot.revision ||
              !Array.isArray(message.edits) ||
              applyEdits(initialize.snapshot.text, message.edits) !== expectedText
            ) {
              throw new Error("Generated surface emitted invalid document edits");
            }
            port.postMessage({
              type: "document-changed",
              documentId: initialize.snapshot.documentId,
              originViewId: initialize.viewId,
              reason: "edit",
              edits: message.edits,
              revision: 2,
              savedRevision: 1,
              dirty: true,
              readOnly: false,
              canUndo: true,
              canRedo: false,
            });
            port.postMessage({
              type: "request-result",
              requestId: message.requestId,
              ok: true,
              revision: 2,
            });
            setTimeout(() => {
              try {
                const textarea = document.querySelector('textarea[aria-label="Document text"]');
                const status = interaction === "task-board"
                  ? document.querySelector(".save-status")
                  : document.querySelector("header span");
                const progress = document.querySelector(".progress-label");
                if (
                  interaction === "textarea" &&
                  (!(textarea instanceof HTMLTextAreaElement) || textarea.value !== expectedText)
                ) {
                  throw new Error("Generated surface lost the accepted document edit");
                }
                if (
                  interaction === "task-board" &&
                  progress?.textContent !== "0 to do · 2 completed · 100%"
                ) {
                  throw new Error("Task Board did not move the edited task to completed");
                }
                if (status?.textContent !== "Unsaved") {
                  throw new Error("Surface did not reflect the dirty document state");
                }
                const cssLoaded = Array.from(document.querySelectorAll("style")).some(
                  (style) => style.textContent?.includes(cssMarker)
                );
                finish({
                  interaction,
                  text: textarea?.value ?? expectedText,
                  status: status.textContent,
                  edits: message.edits,
                  cssLoaded,
                  progress: progress?.textContent,
                  surfaceLogs,
                  background: document.documentElement.style.getPropertyValue("--eidos-color-background"),
                });
              } catch (error) {
                fail(error);
              }
            }, 0);
          } catch (error) {
            fail(error);
          }
        };
        port.start();
        window.postMessage(
          {
            type: ${JSON.stringify(EXTENSION_SURFACE_BOOTSTRAP_CHANNEL)},
            source,
            generation,
          },
          "*",
          [channel.port2]
        );
      })`,
      true
    )
    if (
      result?.text !== expectedText ||
      result?.interaction !== interaction ||
      result?.status !== "Unsaved" ||
      result?.cssLoaded !== true ||
      result?.background !== initialize.appearance.theme.background ||
      !Array.isArray(result?.edits) ||
      result.edits.length !== 1 ||
      (expectedLog &&
        !result?.surfaceLogs?.some(
          (log) => log.level === "info" && log.message.includes(expectedLog)
        ))
    ) {
      throw new Error("Generated surface returned an unexpected result")
    }
    console.log(`${scenarioId} extension smoke passed`)
  } finally {
    if (!runtimeWindow.isDestroyed()) runtimeWindow.destroy()
    await runtimeSession.clearStorageData()
  }
}

async function runPanelScenario({
  scenarioId,
  extensionId,
  panelId,
  entrypoint,
  files,
  state,
  expectedTitle,
  cssMarker,
  expectedLog,
}) {
  const generation = `smoke-${scenarioId}`
  const bundle = await compileExtensionSurface({ entrypoint, files })
  const source = createExtensionSurfaceSource({
    bundleCode: bundle.code,
    extensionId,
    generation,
  })
  const runtimeSession = createRuntimeSession(scenarioId)
  const runtimeWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      session: runtimeSession,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      contextIsolation: true,
      webSecurity: true,
      devTools: false,
    },
  })
  observeRuntimeWindow(runtimeWindow, `${scenarioId} panel`)

  const initialize = {
    type: "initialize",
    surfaceKind: "panel",
    protocolVersion: EXTENSION_SURFACE_PROTOCOL_VERSION,
    packageId: extensionId,
    generation,
    panelId,
    sessionId: `${scenarioId}-session`,
    state,
    appearance: SMOKE_APPEARANCE,
  }

  try {
    await runtimeWindow.loadURL(extensionSurfaceDataUrl())
    const result = await runtimeWindow.webContents.executeJavaScript(
      `new Promise((resolve, reject) => {
        const source = ${JSON.stringify(source)};
        const generation = ${JSON.stringify(generation)};
        const initialize = ${JSON.stringify(initialize)};
        const expectedTitle = ${JSON.stringify(expectedTitle)};
        const cssMarker = ${JSON.stringify(cssMarker)};
        const channel = new MessageChannel();
        const port = channel.port1;
        const surfaceLogs = [];
        let settled = false;
        const timeout = setTimeout(() => fail(new Error("Panel smoke timed out")), 10000);
        const fail = (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          try { port.close(); } catch {}
          reject(error);
        };
        const finish = (value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          try { port.close(); } catch {}
          resolve(value);
        };
        port.onmessage = (event) => {
          try {
            const message = event.data;
            if (message?.type === "activation-error") {
              throw new Error("Panel activation failed: " + message.message);
            }
            if (message?.type === "surface-log") {
              if (
                message.generation !== generation ||
                !["debug", "info", "log", "warn", "error"].includes(message.level) ||
                typeof message.message !== "string" ||
                message.message.length === 0 ||
                message.message.length > 4096
              ) {
                throw new Error("Panel emitted an invalid runtime log");
              }
              surfaceLogs.push(message);
              return;
            }
            if (message?.type === "ready") {
              if (message.protocolVersion !== initialize.protocolVersion) {
                throw new Error("Panel activated with an unexpected protocol");
              }
              port.postMessage(initialize);
              return;
            }
            if (message?.type !== "activated") return;
            if (typeof fetch !== "undefined" || typeof XMLHttpRequest !== "undefined") {
              throw new Error("Blocked network globals are still available");
            }
            const title = document.querySelector(".task-summary h1");
            const resource = document.querySelector(".task-summary .resource");
            const pending = document.querySelector('[data-count="pending"]');
            const completed = document.querySelector('[data-count="completed"]');
            const total = document.querySelector('[data-count="total"]');
            const cssLoaded = Array.from(document.querySelectorAll("style")).some(
              (style) => style.textContent?.includes(cssMarker)
            );
            if (title?.textContent !== expectedTitle) {
              throw new Error("Panel did not render its title");
            }
            if (resource?.textContent !== initialize.state.path) {
              throw new Error("Panel did not render its resource state");
            }
            if (
              pending?.textContent !== String(initialize.state.pending) ||
              completed?.textContent !== String(initialize.state.completed) ||
              total?.textContent !== String(initialize.state.total)
            ) {
              throw new Error("Panel did not render its task counts");
            }
            finish({
              title: title.textContent,
              resource: resource.textContent,
              pending: pending.textContent,
              completed: completed.textContent,
              total: total.textContent,
              cssLoaded,
              surfaceLogs,
              background: document.documentElement.style.getPropertyValue("--eidos-color-background"),
            });
          } catch (error) {
            fail(error);
          }
        };
        port.start();
        window.postMessage(
          {
            type: ${JSON.stringify(EXTENSION_SURFACE_BOOTSTRAP_CHANNEL)},
            source,
            generation,
          },
          "*",
          [channel.port2]
        );
      })`,
      true
    )
    if (
      result?.title !== expectedTitle ||
      result?.resource !== state.path ||
      result?.pending !== String(state.pending) ||
      result?.completed !== String(state.completed) ||
      result?.total !== String(state.total) ||
      result?.cssLoaded !== true ||
      result?.background !== SMOKE_APPEARANCE.theme.background ||
      (expectedLog &&
        !result?.surfaceLogs?.some(
          (log) => log.level === "info" && log.message.includes(expectedLog)
        ))
    ) {
      throw new Error("Generated panel returned an unexpected result")
    }
    console.log(`${scenarioId} extension smoke passed`)
  } finally {
    if (!runtimeWindow.isDestroyed()) runtimeWindow.destroy()
    await runtimeSession.clearStorageData()
  }
}

async function runEidosFileViewScenario({
  scenarioId,
  extensionId,
  eidosFileViewId,
  entrypoint,
  files,
  expectedLog,
}) {
  const generation = `smoke-${scenarioId}`
  const bundle = await compileExtensionSurface({ entrypoint, files })
  const source = createExtensionSurfaceSource({
    bundleCode: bundle.code,
    extensionId,
    generation,
  })
  const runtimeSession = createRuntimeSession(scenarioId)
  const runtimeWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      session: runtimeSession,
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      devTools: false,
    },
  })
  observeRuntimeWindow(runtimeWindow, `${scenarioId} Eidos File view`)
  const initialize = {
    type: "initialize",
    surfaceKind: "eidos-file-view",
    protocolVersion: EXTENSION_SURFACE_PROTOCOL_VERSION,
    packageId: extensionId,
    generation,
    eidosFileViewId,
    viewId: "view-cards",
    context: {
      resourcePath: "tasks.eidos",
      table: { id: "tasks", name: "Tasks", rowCount: 2 },
      view: { id: "view-cards", name: "Cards" },
      fields: [
        { name: "Title", columnName: "title", type: "title", property: null },
        {
          name: "Status",
          columnName: "status",
          type: "select",
          property: null,
        },
      ],
    },
    appearance: SMOKE_APPEARANCE,
  }

  try {
    await runtimeWindow.loadURL(extensionSurfaceDataUrl())
    const result = await runtimeWindow.webContents.executeJavaScript(
      `new Promise((resolve, reject) => {
        const source = ${JSON.stringify(source)};
        const generation = ${JSON.stringify(generation)};
        const initialize = ${JSON.stringify(initialize)};
        const channel = new MessageChannel();
        const port = channel.port1;
        const surfaceLogs = [];
        let settled = false;
        let activated = false;
        let pageLoaded = false;
        const timeout = setTimeout(() => fail(new Error("Eidos File view smoke timed out")), 10000);
        const fail = (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          try { port.close(); } catch {}
          reject(error);
        };
        const finish = () => {
          if (settled || !activated || !pageLoaded) return;
          setTimeout(() => {
            try {
              const title = document.querySelector("header strong");
              const cards = document.querySelectorAll(".record-grid article");
              const cssLoaded = Array.from(document.querySelectorAll("style")).some(
                (style) => style.textContent?.includes(".record-grid")
              );
              if (title?.textContent !== "Tasks" || cards.length !== 2) {
                throw new Error("Generated Eidos File view did not render its page");
              }
              settled = true;
              clearTimeout(timeout);
              try { port.close(); } catch {}
              resolve({ title: title.textContent, cards: cards.length, cssLoaded, surfaceLogs });
            } catch (error) {
              fail(error);
            }
          }, 0);
        };
        port.onmessage = (event) => {
          try {
            const message = event.data;
            if (message?.type === "activation-error") {
              throw new Error("Eidos File view activation failed: " + message.message);
            }
            if (message?.type === "surface-log") {
              surfaceLogs.push(message);
              return;
            }
            if (message?.type === "ready") {
              port.postMessage(initialize);
              return;
            }
            if (message?.type === "activated") {
              activated = true;
              finish();
              return;
            }
            if (message?.type === "eidos-file-page-request") {
              if (message.generation !== generation || message.offset !== 0 || message.limit !== 60) {
                throw new Error("Generated Eidos File view requested an invalid page");
              }
              port.postMessage({
                type: "eidos-file-page-result",
                requestId: message.requestId,
                ok: true,
                page: {
                  offset: 0,
                  limit: 60,
                  total: 2,
                  rows: [
                    { _id: "row-1", title: "Ship Eidos File views", status: "Doing" },
                    { _id: "row-2", title: "Run smoke", status: "Done" },
                  ],
                },
              });
              pageLoaded = true;
              finish();
            }
          } catch (error) {
            fail(error);
          }
        };
        port.start();
        window.postMessage(
          { type: ${JSON.stringify(EXTENSION_SURFACE_BOOTSTRAP_CHANNEL)}, source, generation },
          "*",
          [channel.port2]
        );
      })`,
      true
    )
    if (
      result?.title !== "Tasks" ||
      result?.cards !== 2 ||
      result?.cssLoaded !== true ||
      !result?.surfaceLogs?.some(
        (log) => log.level === "info" && log.message.includes(expectedLog)
      )
    ) {
      throw new Error("Generated Eidos File view returned an unexpected result")
    }
    console.log(`${scenarioId} extension smoke passed`)
  } finally {
    if (!runtimeWindow.isDestroyed()) runtimeWindow.destroy()
    await runtimeSession.clearStorageData()
  }
}

async function run() {
  await app.whenReady()

  const taskCounterId = "example.markdown-task-counter.count-tasks"
  await runCommandScenario({
    scenarioId: "task-counter",
    extensionId: "example.markdown-task-counter",
    commandId: taskCounterId,
    entrypoint: "src/extension.ts",
    files: [
      {
        path: "src/extension.ts",
        content: await readFile(path.join(exampleRoot, "src", "extension.ts")),
      },
    ],
    resourcePath: "tasks.md",
    handleRpc(message) {
      if (message.method === "space.files.readText") {
        if (message.params?.path !== "tasks.md") {
          throw new Error(`Unexpected task path: ${message.params?.path}`)
        }
        return {
          value: "- [ ] first\n- [x] second\n- [ ] third\n",
          completes: false,
        }
      }
      if (message.method === "window.showNotice") {
        if (!message.params?.message?.includes("2 open, 1 completed")) {
          throw new Error(`Unexpected notice: ${message.params?.message}`)
        }
        return { value: undefined, completes: true }
      }
      throw new Error(`Unexpected runtime RPC: ${message.method}`)
    },
  })

  const generatedPanel = createExtensionPanelTemplate({
    publisher: "local",
    name: "panel-smoke",
    displayName: "Panel Smoke",
    engineRange: ">=0.33.0",
  })
  const panelCommand = generatedPanel.manifest.contributes.commands?.[0]
  const panel = generatedPanel.manifest.contributes.panels?.[0]
  if (
    !panelCommand ||
    !panel ||
    !generatedPanel.manifest.entrypoints.worker ||
    !generatedPanel.manifest.entrypoints.ui
  ) {
    throw new Error("Generated panel template is missing its runtime contract")
  }
  await runCommandScenario({
    scenarioId: "generated-panel",
    extensionId: generatedPanel.canonicalId,
    commandId: panelCommand.id,
    panelIds: [panel.id],
    entrypoint: generatedPanel.manifest.entrypoints.worker,
    files: generatedPanel.files.map((file) => ({
      path: file.path,
      content: bytes(file.content),
    })),
    resourcePath: "tasks.md",
    handleRpc(message) {
      if (message.method === "space.files.readText") {
        return {
          value: "- [ ] first\n- [x] second\n- [ ] third\n",
          completes: false,
        }
      }
      if (message.method === "window.openPanel") {
        if (
          message.params?.panelId !== panel.id ||
          message.params?.state?.pending !== 2 ||
          message.params?.state?.completed !== 1
        ) {
          throw new Error("Generated panel emitted unexpected state")
        }
        return { value: undefined, completes: true }
      }
      throw new Error(
        `Generated panel emitted an unexpected RPC: ${message.method}`
      )
    },
  })
  await runPanelScenario({
    scenarioId: "generated-panel-ui",
    extensionId: generatedPanel.canonicalId,
    panelId: panel.id,
    entrypoint: generatedPanel.manifest.entrypoints.ui,
    files: generatedPanel.files.map((file) => ({
      path: file.path,
      content: bytes(file.content),
    })),
    state: {
      path: "tasks.md",
      pending: 2,
      completed: 1,
      total: 3,
    },
    expectedTitle: "Panel Smoke",
    cssMarker: ".task-summary",
    expectedLog: "Panel Smoke panel activated",
  })

  const generatedEidosFileView = createExtensionEidosFileViewTemplate({
    publisher: "local",
    name: "eidos-file-view-smoke",
    displayName: "Eidos File View Smoke",
    engineRange: ">=0.33.0",
  })
  const eidosFileView =
    generatedEidosFileView.manifest.contributes.eidosFileViews?.[0]
  if (!eidosFileView || !generatedEidosFileView.manifest.entrypoints.ui) {
    throw new Error(
      "Generated Eidos File view template is missing its surface contract"
    )
  }
  await runEidosFileViewScenario({
    scenarioId: "generated-eidos-file-view",
    extensionId: generatedEidosFileView.canonicalId,
    eidosFileViewId: eidosFileView.id,
    entrypoint: generatedEidosFileView.manifest.entrypoints.ui,
    files: generatedEidosFileView.files.map((file) => ({
      path: file.path,
      content: bytes(file.content),
    })),
    expectedLog: "Eidos File View Smoke Eidos File view activated",
  })

  const generated = createExtensionCommandTemplate({
    publisher: "local",
    name: "runtime-smoke",
    displayName: "Runtime Smoke",
    engineRange: ">=0.33.0",
  })
  const generatedCommand = generated.manifest.contributes.commands?.[0]
  if (!generatedCommand || !generated.manifest.entrypoints.worker) {
    throw new Error(
      "Generated command template is missing its runtime contract"
    )
  }
  await runCommandScenario({
    scenarioId: "generated-command",
    extensionId: generated.canonicalId,
    commandId: generatedCommand.id,
    entrypoint: generated.manifest.entrypoints.worker,
    files: generated.files.map((file) => ({
      path: file.path,
      content: bytes(file.content),
    })),
    resourcePath: "README.md",
    handleRpc(message) {
      if (
        message.method !== "window.showNotice" ||
        message.params?.message !== "Hello from Runtime Smoke"
      ) {
        throw new Error(
          `Generated template emitted an unexpected RPC: ${message.method}`
        )
      }
      return { value: undefined, completes: true }
    },
  })

  const generatedEditor = createExtensionTextEditorTemplate({
    publisher: "local",
    name: "surface-smoke",
    displayName: "Surface Smoke",
    engineRange: ">=0.33.0",
    filenamePattern: "**/*.notes.md",
    mediaType: "text/markdown",
  })
  const editor = generatedEditor.manifest.contributes.fileEditors?.[0]
  if (!editor || !generatedEditor.manifest.entrypoints.ui) {
    throw new Error("Generated editor template is missing its surface contract")
  }
  await runSurfaceScenario({
    scenarioId: "generated-text-editor",
    extensionId: generatedEditor.canonicalId,
    editorId: editor.id,
    entrypoint: generatedEditor.manifest.entrypoints.ui,
    files: generatedEditor.files.map((file) => ({
      path: file.path,
      content: bytes(file.content),
    })),
    interaction: "textarea",
    resourcePath: "notes.notes.md",
    initialText: "- [ ] Ship the editor\n",
    expectedText: "- [ ] Ship the editor\nSecond line\n",
    cssMarker: ".editor-shell",
    expectedLog: "Surface Smoke editor activated",
  })

  const taskBoard = await inspectExtensionPackageSnapshot(taskBoardRoot, {
    hostVersion: "0.33.0",
    requireCanonicalDirectoryName: false,
  })
  const taskBoardEditor =
    taskBoard.inspection.manifest?.contributes.fileEditors?.[0]
  if (
    taskBoard.inspection.status !== "ready" ||
    !taskBoard.inspection.canonicalId ||
    !taskBoardEditor ||
    !taskBoard.inspection.manifest?.entrypoints.ui
  ) {
    throw new Error("Markdown Task Board package is not runtime-ready")
  }
  const taskBoardInitial = "# Launch\n\n- [ ] Finish UI\n- [x] Write docs\n"
  await runSurfaceScenario({
    scenarioId: "markdown-task-board",
    extensionId: taskBoard.inspection.canonicalId,
    editorId: taskBoardEditor.id,
    entrypoint: taskBoard.inspection.manifest.entrypoints.ui,
    files: taskBoard.files,
    interaction: "task-board",
    resourcePath: "projects/launch.tasks.md",
    initialText: taskBoardInitial,
    expectedText: taskBoardInitial.replace(
      "- [ ] Finish UI",
      "- [x] Finish UI"
    ),
    cssMarker: ".task-board",
  })

  console.log("File extension runtime smoke passed")
}

run()
  .then(() => app.quit())
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })
