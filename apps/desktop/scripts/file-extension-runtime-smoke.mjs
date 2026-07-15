import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { app, BrowserWindow, MessageChannelMain, session } from "electron"
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
const generation = "smoke-generation"
const commandId = "example.markdown-task-counter.count-tasks"

async function run() {
  await app.whenReady()
  const bundle = await compileExtensionWorker({
    entrypoint: "src/extension.ts",
    files: [
      {
        path: "src/extension.ts",
        content: await readFile(path.join(exampleRoot, "src", "extension.ts")),
      },
    ],
  })
  const source = createExtensionWorkerSource({
    bundleCode: bundle.code,
    extensionId: "example.markdown-task-counter",
    generation,
    commandIds: [commandId],
  })
  const runtimeSession = session.fromPartition(
    `eidos-file-extension-smoke-${Date.now()}`,
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
  await runtimeWindow.loadURL(extensionRuntimeDataUrl())

  const { port1, port2 } = new MessageChannelMain()
  let sawNotice = false
  let sawInvokeResult = false
  let invokeRequestId

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("File extension smoke timed out")),
      10_000
    )
    const finish = () => {
      if (!sawNotice || !sawInvokeResult) return
      clearTimeout(timeout)
      resolve()
    }
    port2.on("message", ({ data }) => {
      if (data?.type === "ready") {
        if (
          data.generation !== generation ||
          !data.commands.includes(commandId)
        ) {
          reject(new Error("Worker activated with an unexpected contract"))
          return
        }
        invokeRequestId = "smoke-invoke"
        port2.postMessage({
          type: "invoke",
          requestId: invokeRequestId,
          commandId,
          resource: { path: "tasks.md" },
        })
        return
      }
      if (data?.type === "rpc" && data.method === "space.files.readText") {
        port2.postMessage({
          type: "rpc-result",
          requestId: data.requestId,
          ok: true,
          value: "- [ ] first\n- [x] second\n- [ ] third\n",
        })
        return
      }
      if (data?.type === "rpc" && data.method === "window.showNotice") {
        if (!data.params.message.includes("2 open, 1 completed")) {
          reject(new Error(`Unexpected notice: ${data.params.message}`))
          return
        }
        sawNotice = true
        port2.postMessage({
          type: "rpc-result",
          requestId: data.requestId,
          ok: true,
        })
        finish()
        return
      }
      if (
        data?.type === "invoke-result" &&
        data.requestId === invokeRequestId
      ) {
        if (!data.ok) {
          reject(
            new Error(`Extension invocation failed: ${data.error?.message}`)
          )
          return
        }
        sawInvokeResult = true
        finish()
      }
    })
    port2.start()
    runtimeWindow.webContents.postMessage(
      EXTENSION_RUNTIME_BOOTSTRAP_CHANNEL,
      { type: "eidos-extension-bootstrap", source, generation },
      [port1]
    )
  })

  port2.close()
  runtimeWindow.destroy()
  await runtimeSession.clearStorageData()
  console.log("File extension runtime smoke passed")
}

run()
  .then(() => app.quit())
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })
