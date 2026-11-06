import assert from "node:assert/strict"
import fs from "node:fs/promises"
import http from "node:http"
import path from "node:path"
import { performance } from "node:perf_hooks"
import { app, utilityProcess, type UtilityProcess } from "electron"
import type { GraftClient } from "../graft/graft-client"
import type { WindowController } from "../window-controller"
import type { PackagedSmokeStartup } from "../packaged-startup-smoke"
import type { SpaceSession } from "../space/space-session"
import { AutomaticSync, AUTOMATIC_SYNC_INTERVAL_MS } from "./automatic-sync"

interface ObservedUtility {
  pid?: number
  spawnedAtMs?: number
  retiringAtMs?: number
  killAtMs?: number
  exitedAtMs?: number
  exitCode?: number
}

async function bounded<T>(
  request: Promise<T>,
  label: string,
  ms = 10_000
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      request,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out: ${label}`)), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** Only dispatched by the existing explicit, isolated application smoke route. */
export async function runAutomaticSyncElectronSmoke(
  controller: WindowController,
  spaceRoot: string,
  resultPath: string,
  startup: PackagedSmokeStartup
): Promise<void> {
  try {
    await runAutomaticSyncElectronSmokeCore(
      spaceRoot,
      resultPath,
      async (root) => {
        const window = await controller.createSpaceWindow(root)
        const session = controller.requireSession(window.webContents)
        const documentUrl = window.webContents.getURL()
        if (!app.isPackaged)
          assert(documentUrl.startsWith("http://localhost:5179/"))
        return {
          session,
          graft: Reflect.get(session, "graft") as GraftClient,
          documentUrl,
          close: async () => {
            await session.close()
            window.destroy()
          },
        }
      }
    )
  } finally {
    startup.welcomeWindow.destroy()
  }
}

export async function runAutomaticSyncElectronSmokeCore(
  spaceRoot: string,
  resultPath: string,
  createSession: (root: string) => Promise<{
    session: SpaceSession
    graft: GraftClient
    documentUrl?: string
    close(): Promise<void>
  }>
): Promise<void> {
  const evidenceRoot = path.dirname(resultPath)
  assert.equal(
    path.resolve(app.getPath("userData")),
    path.resolve(evidenceRoot, "user-data")
  )
  assert.equal(
    path.dirname(path.resolve(spaceRoot)),
    path.resolve(evidenceRoot)
  )
  const originalFork = utilityProcess.fork
  const reports: unknown[] = []
  try {
    for (const ignoreNativeAbort of [false, true]) {
      const root = path.join(
        spaceRoot,
        ignoreNativeAbort ? "Watchdog Space" : "Cooperative Space"
      )
      await fs.mkdir(root, { recursive: true })
      await fs.writeFile(
        path.join(root, "note.txt"),
        "Keep this local content\n"
      )
      const utilities: ObservedUtility[] = []
      const children = new Set<UtilityProcess>()
      const serviceName = `Graft · ${path.basename(root)}`
      // Fault injection is a separate temporary loader. The production worker,
      // command admission guard, transport factory and native Electron child
      // remain unchanged. Only the simulated native signal is made unresponsive.
      const loader = path.join(evidenceRoot, "ignore-native-abort.mjs")
      utilityProcess.fork = (modulePath, args, options) => {
        if (options?.serviceName !== serviceName)
          return originalFork(modulePath, args, options)
        const child = originalFork(
          ignoreNativeAbort ? loader : modulePath,
          args,
          {
            ...options,
            ...(ignoreNativeAbort
              ? {
                  env: {
                    ...options.env,
                    EIDOS_TEST_PRODUCTION_GRAFT_WORKER: modulePath,
                  },
                }
              : {}),
          }
        )
        const observed: ObservedUtility = {}
        utilities.push(observed)
        children.add(child)
        child.once("spawn", () => {
          observed.pid = child.pid
          observed.spawnedAtMs = performance.now()
        })
        child.on("message", (message: unknown) => {
          if (
            typeof message === "object" &&
            message !== null &&
            "type" in message &&
            message.type === "automatic-cancel-retiring"
          )
            observed.retiringAtMs = performance.now()
        })
        const kill = child.kill.bind(child)
        child.kill = () => {
          observed.killAtMs ??= performance.now()
          return kill()
        }
        child.once("exit", (code) => {
          observed.exitedAtMs = performance.now()
          observed.exitCode = code
          children.delete(child)
        })
        return child
      }
      if (ignoreNativeAbort)
        await fs.writeFile(
          loader,
          [
            "globalThis.AbortController = class extends AbortController { abort() {} };",
            "await import(process.env.EIDOS_TEST_PRODUCTION_GRAFT_WORKER);",
          ].join("\n"),
          { mode: 0o600 }
        )

      let started!: () => void
      const requestStarted = new Promise<void>((resolve) => {
        started = resolve
      })
      const server = http.createServer(() => started())
      await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve)
      )
      const address = server.address()
      assert(address && typeof address !== "string")
      const probe = await createSession(root)
      const { session, graft, documentUrl } = probe
      // Inspect the client made by WindowController's production factory; do
      // not construct an alternate transport or call the native SDK directly.
      let now = 0
      const automatic = new AutomaticSync({
        focused: () => false,
        now: () => now,
      })
      let settledAtMs: number | undefined
      try {
        const initial = await session.enableVersioning()
        await session.gate.withRepositoryOperation(
          "Preparing isolated cancellation probe",
          async () => {
            await graft.addRemote(
              root,
              "origin",
              `graft+http://127.0.0.1:${address.port}/test/hung`
            )
          }
        )
        automatic.configure("interval")
        automatic.attach({
          spaceId: session.canonical.id,
          revision: "isolated-hung-http",
          current: () => true,
          available: () => true,
          execute: (signal) =>
            session.gate.withRepositoryOperation(
              "Automatic cancellation acceptance",
              async (repositorySignal) => {
                await graft.fetch(root, {
                  signal: repositorySignal,
                  forCheckout: true,
                  automaticTransfer: true,
                })
                throw new Error("The hung fixture unexpectedly completed")
              },
              { background: "automatic-sync", signal, preemptible: true }
            ),
          emit: () => undefined,
        })
        now += AUTOMATIC_SYNC_INTERVAL_MS
        const run = automatic.tick().finally(() => {
          settledAtMs = performance.now()
        })
        await bounded(
          Promise.race([
            requestStarted,
            run.then(() => {
              throw new Error(
                `Transfer ended before HTTP: ${JSON.stringify(automatic.status(session.canonical.id))}`
              )
            }),
          ]),
          "native HTTP request"
        )
        const activityAtMs = performance.now()
        automatic.activity()
        const foreground = session.getVersionHistory()
        const [, history] = await bounded(
          Promise.all([run, foreground]),
          "foreground handoff after actual utility exit"
        )
        const foregroundReadyAtMs = performance.now()
        assert.equal(history.commits[0]?.id, initial.graft.currentHead)
        const retired = utilities.find(
          (entry) => entry.retiringAtMs !== undefined
        )
        if (ignoreNativeAbort) {
          assert(retired, "No worker-owned retirement acknowledgement")
          assert(retired.pid && retired.killAtMs && retired.exitedAtMs)
          assert(retired.killAtMs >= retired.retiringAtMs!)
          assert(retired.exitedAtMs >= retired.killAtMs)
          assert(
            settledAtMs! >= retired.exitedAtMs,
            "Repository released before native utility exited"
          )
          assert(
            retired.exitedAtMs - activityAtMs < 2_000,
            "Native utility exit exceeded two seconds"
          )
          const reopened = utilities.find(
            (entry) =>
              entry.pid !== retired.pid &&
              entry.spawnedAtMs! >= retired.exitedAtMs!
          )
          assert(
            reopened?.pid,
            "Foreground did not reopen the production utility"
          )
        }
        await session.createTextFile(null, "Foreground works.txt")
        assert.equal(
          await fs.readFile(path.join(root, "note.txt"), "utf8"),
          "Keep this local content\n"
        )
        assert.equal(session.gate.current().phase, "ready")
        reports.push({
          ignoreNativeAbort,
          documentUrl,
          repository: root,
          activityAtMs,
          settledAtMs,
          foregroundReadyAtMs,
          handoffMs: foregroundReadyAtMs - activityAtMs,
          foregroundHistoryReadable: true,
          foregroundMutationSucceeded: true,
          localContentPreserved: true,
          utilities,
        })
      } finally {
        await automatic.close()
        server.closeAllConnections()
        await new Promise<void>((resolve) => server.close(() => resolve()))
        await probe.close()
        for (const child of children) child.kill()
        utilityProcess.fork = originalFork
      }
    }
    await fs.writeFile(
      resultPath,
      JSON.stringify(
        {
          status: "passed",
          host: "Electron utilityProcess",
          electron: process.versions.electron,
          reports,
        },
        null,
        2
      ),
      { mode: 0o600 }
    )
    console.info("Automatic Sync Electron host acceptance:", resultPath)
  } catch (error) {
    await fs.writeFile(
      resultPath,
      JSON.stringify(
        { status: "failed", message: String(error), reports },
        null,
        2
      ),
      { mode: 0o600 }
    )
    throw error
  } finally {
    utilityProcess.fork = originalFork
  }
}
