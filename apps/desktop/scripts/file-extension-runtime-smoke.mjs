import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { app, BrowserWindow, MessageChannelMain, session } from "electron"
import { createExtensionCommandTemplate } from "@eidos.space/extension-manifest"
import {
  EXTENSION_RUNTIME_BOOTSTRAP_CHANNEL,
  createExtensionWorkerSource,
  extensionRuntimeDataUrl,
} from "@eidos.space/extension-runtime"
import { compileExtensionWorker } from "@eidos.space/extension-runtime/compiler"

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

// The smoke opens one isolated renderer per scenario. Keep Electron alive
// between windows and quit only after every scenario has completed.
app.on("window-all-closed", () => {})

function bytes(content) {
  return new TextEncoder().encode(content)
}

async function runCommandScenario({
  scenarioId,
  extensionId,
  commandId,
  entrypoint,
  files,
  resourcePath,
  handleRpc,
}) {
  const generation = `smoke-${scenarioId}`
  const bundle = await compileExtensionWorker({ entrypoint, files })
  const source = createExtensionWorkerSource({
    bundleCode: bundle.code,
    extensionId,
    generation,
    commandIds: [commandId],
  })
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
  runtimeWindow.webContents.on(
    "preload-error",
    (_event, preloadPath, error) => {
      console.error(`Preload failed: ${preloadPath}`, error)
    }
  )
  runtimeWindow.webContents.on("did-fail-load", (_event, code, description) => {
    console.error(`Runtime host failed to load (${code}): ${description}`)
  })
  runtimeWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error("Runtime renderer exited", details)
  })
  runtimeWindow.webContents.on("console-message", (event) => {
    console.error(`Runtime console (${event.level}): ${event.message}`)
  })
  runtimeWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }))

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

  console.log("File extension runtime smoke passed")
}

run()
  .then(() => app.quit())
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })
