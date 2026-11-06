import fs from "node:fs/promises"
import http from "node:http"
import os from "node:os"
import path from "node:path"
import { fork, type ChildProcess } from "node:child_process"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { utilityProcess, type UtilityProcess } from "electron"
import { AutomaticSync, AUTOMATIC_SYNC_INTERVAL_MS } from "./automatic-sync"
import { SyncExecutor } from "./sync-executor"
import type { SyncControlPlane } from "./sync-control-plane"
import { GraftClient } from "../graft/graft-client"
import { GraftInProcessTransport } from "../graft/graft-in-process-transport"
import { GraftUtilityTransport } from "../graft/graft-utility-transport"
import type { GraftSdkTransport } from "../graft/graft-sdk-transport"
import { SpaceSession } from "../space/space-session"
import type { SpaceSnapshot } from "../../shared/contracts"
import { openEidosFile } from "@eidos.space/eidos-file/node-sqlite"
import { build } from "esbuild"

const verifiedRemote = "https://sync-staging.eidos.space/test/automatic"
vi.mock("electron", () => ({ utilityProcess: { fork: vi.fn() } }))

async function fixture(
  transport: GraftSdkTransport = new GraftInProcessTransport(),
  database = false,
  prepareMaterialization?: () => Promise<void>
) {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "eidos-automatic-sync-")
  )
  const source = path.join(directory, "source")
  const root = path.join(directory, "Space")
  const remote = `fs://${path.join(directory, "remote")}`
  const sourceGraft = new GraftClient({
    sdkTransport: new GraftInProcessTransport(),
  })
  const graft = new GraftClient({ sdkTransport: transport })
  await fs.mkdir(source)
  await fs.writeFile(path.join(source, "note.txt"), "initial\n")
  await fs.writeFile(path.join(source, ".graftignore"), "ignored.txt\n")
  if (database)
    await fs.copyFile(
      fileURLToPath(
        new URL(
          "../../../../eidos-file-web/fixtures/project-tracker.eidos",
          import.meta.url
        )
      ),
      path.join(source, "data.eidos")
    )
  await sourceGraft.open(source)
  await sourceGraft.initialize(source)
  await sourceGraft.stageAll(source)
  await sourceGraft.commit(source, "Initial")
  await sourceGraft.addRemote(source, "origin", remote)
  await sourceGraft.setMainUpstream(source)
  await sourceGraft.push(source)
  await graft.clone(root, remote)
  const runtimeWorker = path.join(directory, "runtime-worker.mjs")
  if (database) {
    const repositoryRoot = fileURLToPath(
      new URL("../../../../../", import.meta.url)
    )
    await build({
      entryPoints: [
        fileURLToPath(
          new URL("../../runtime/runtime-worker.ts", import.meta.url)
        ),
      ],
      outfile: runtimeWorker,
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node24",
      banner: {
        js: "import { createRequire as automaticTestRequire } from 'node:module'; const require = automaticTestRequire(import.meta.url);",
      },
      alias: {
        "@eidos.space/eidos-file": path.join(
          repositoryRoot,
          "packages/eidos-file/src/index.ts"
        ),
        "@eidos.space/eidos-file/node-sqlite": path.join(
          repositoryRoot,
          "packages/eidos-file/src/node-sqlite.ts"
        ),
        "@eidos.space/eidos-file-ui/runtime-editor-data-source": path.join(
          repositoryRoot,
          "packages/eidos-file-ui/src/runtime-editor-data-source.ts"
        ),
        "@eidos.space/eidos-file-ui/create-table-with-content": path.join(
          repositoryRoot,
          "packages/eidos-file-ui/src/create-table-with-content.ts"
        ),
      },
    })
  }
  const session = await SpaceSession.create(
    root,
    path.join(directory, "state"),
    {
      graft,
      ...(database
        ? {
            workerPath: runtimeWorker,
          }
        : {}),
    }
  )
  // Isolate account metadata from a real local Graft remote. All repository
  // scanning, staging, commits, fetches, push CAS and fast-forwards remain native.
  vi.spyOn(session, "officialSyncRemoteUrl").mockResolvedValue(verifiedRemote)
  vi.spyOn(
    session as unknown as { configureHostedSyncRemote(): Promise<void> },
    "configureHostedSyncRemote"
  ).mockResolvedValue()
  vi.spyOn(
    session as unknown as { recordSyncHistoryCheck(): Promise<void> },
    "recordSyncHistoryCheck"
  ).mockResolvedValue()
  const executor = new SyncExecutor({
    repositoryAccess: async () => ({
      accessToken: "synthetic-token",
      access: "read_write",
    }),
  } as unknown as SyncControlPlane)
  let now = 0
  const sync = new AutomaticSync({ focused: () => false, now: () => now })
  sync.configure("interval")
  sync.attach({
    spaceId: session.canonical.id,
    revision: "fixture",
    current: () => true,
    available: () => true,
    execute: (signal) =>
      executor.run(session, () => undefined, "sync", {
        signal,
        prepareMaterialization,
      }),
    emit: () => undefined,
  })
  return {
    root,
    directory,
    source,
    sourceGraft,
    graft,
    session,
    sync,
    tick: () => {
      now += AUTOMATIC_SYNC_INTERVAL_MS
      return sync.tick()
    },
    advance: (ms: number) => {
      now += ms
    },
    close: async () => {
      await sync.close()
      await session.close()
      await graft.close()
      await sourceGraft.close()
      await fs.rm(directory, { recursive: true, force: true })
    },
  }
}

describe("Automatic Sync with the native Graft SDK", () => {
  it("syncs a real shared Runtime table edit after the change debounce without waiting ten minutes", async () => {
    const utilityFixture = fileURLToPath(
      new URL("./fixtures/automatic-graft-utility.ts", import.meta.url)
    )
    const tsxLoader = createRequire(import.meta.url).resolve("tsx")
    vi.mocked(utilityProcess.fork).mockImplementation((workerPath) => {
      const child = fork(utilityFixture, [workerPath], {
        execArgv: ["--import", tsxLoader],
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
        stdio: ["ignore", "pipe", "pipe", "ipc"],
        serialization: "advanced",
      })
      Object.assign(child, {
        postMessage: (message: unknown) =>
          child.send(message as Parameters<ChildProcess["send"]>[0]),
      })
      return child as unknown as UtilityProcess
    })
    const f = await fixture(new GraftInProcessTransport(), true)
    try {
      f.sync.configure("on-change")
      const opened = await f.session.openEidosFile("data.eidos")
      const table = opened.snapshot.tables[0]!.table.id
      const before = opened.snapshot.tables[0]!.rowCount
      const changed = vi.fn((snapshot: SpaceSnapshot) => {
        if (snapshot.graft.clean !== true)
          f.sync.changed(f.session.canonical.id)
      })
      const stop = f.session.onChanged(changed)
      await f.session.callRuntime(opened.sessionId, "insertRow", [table, {}])
      await vi.waitFor(
        () =>
          expect(
            changed.mock.calls.some(
              ([snapshot]) => snapshot.graft.clean === false
            )
          ).toBe(true),
        { timeout: 5_000 }
      )
      f.advance(5_000)
      await f.sync.tick()
      expect(f.sync.status(f.session.canonical.id)?.state).toBe("idle")
      expect(await f.graft.status(f.root)).toMatchObject({
        dirty: false,
        ahead: 0,
        behind: 0,
      })
      const verificationRoot = path.join(f.directory, "verification")
      const verifier = new GraftClient({
        sdkTransport: new GraftInProcessTransport(),
      })
      try {
        await verifier.clone(
          verificationRoot,
          `fs://${path.join(f.directory, "remote")}`
        )
        const runtime = openEidosFile(
          path.join(verificationRoot, "data.eidos"),
          { readonly: true }
        )
        try {
          expect(runtime.countRows(table)).toBe(before + 1)
        } finally {
          runtime.close()
        }
      } finally {
        await verifier.close()
      }
      stop()
    } finally {
      await f.close()
    }
  }, 30_000)
  it("checkpoints saved changes using existing ignores, uploads, and never creates an empty checkpoint", async () => {
    const f = await fixture()
    try {
      await fs.writeFile(path.join(f.root, "note.txt"), "saved locally\n")
      await fs.writeFile(path.join(f.root, "ignored.txt"), "keep local\n")
      await f.tick()
      expect(f.sync.status(f.session.canonical.id)?.state).toBe("idle")
      expect(await f.graft.status(f.root)).toMatchObject({
        dirty: false,
        ahead: 0,
        behind: 0,
      })
      expect((await f.graft.history(f.root)).commits).toHaveLength(2)
      await f.tick()
      expect((await f.graft.history(f.root)).commits).toHaveLength(2)
      await f.sourceGraft.fetch(f.source, { forCheckout: true })
      expect(await f.sourceGraft.status(f.source)).toMatchObject({ behind: 1 })
      expect(
        await f.graft.inspectIgnores(f.root, ["ignored.txt"])
      ).toMatchObject([{ isIgnored: true, isTracked: false }])
      expect(await fs.readFile(path.join(f.root, "ignored.txt"), "utf8")).toBe(
        "keep local\n"
      )
    } finally {
      await f.close()
    }
  }, 30_000)

  it("receives remote changes without local edits and emits paths for the open editor refresh", async () => {
    const f = await fixture()
    try {
      const emitted: SpaceSnapshot[] = []
      const stop = f.session.onChanged((snapshot) => emitted.push(snapshot))
      await fs.writeFile(
        path.join(f.source, "note.txt"),
        "from another device\n"
      )
      await f.sourceGraft.stageAll(f.source)
      await f.sourceGraft.commit(f.source, "Remote change")
      await f.sourceGraft.push(f.source)
      await f.tick()
      expect(await fs.readFile(path.join(f.root, "note.txt"), "utf8")).toBe(
        "from another device\n"
      )
      expect(
        emitted.some((snapshot) =>
          snapshot.materializedPaths?.includes("note.txt")
        )
      ).toBe(true)
      expect(f.sync.status(f.session.canonical.id)?.state).toBe("idle")
      expect((await f.session.snapshot()).operation.phase).toBe("ready")
      stop()
    } finally {
      await f.close()
    }
  }, 30_000)

  it("requires renderer admission and recovers a successful apply whose whole materialized snapshot failed", async () => {
    const prepare = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(
        new DOMException("Pending shared draft", "AbortError")
      )
      .mockResolvedValue(undefined)
    const f = await fixture(new GraftInProcessTransport(), false, prepare)
    try {
      await fs.writeFile(
        path.join(f.source, "note.txt"),
        "Remote replacement\n"
      )
      await f.sourceGraft.stageAll(f.source)
      await f.sourceGraft.commit(f.source, "Remote update")
      await f.sourceGraft.push(f.source)
      const apply = vi.spyOn(f.graft, "applyMerge")
      await f.tick()
      expect(prepare).toHaveBeenCalledOnce()
      expect(apply).not.toHaveBeenCalled()
      expect(await fs.readFile(path.join(f.root, "note.txt"), "utf8")).toBe(
        "initial\n"
      )
      const target = f.session as unknown as {
        freshSnapshotAndEmit(
          refresh: boolean,
          paths?: readonly string[] | null
        ): Promise<SpaceSnapshot>
      }
      const fresh = target.freshSnapshotAndEmit.bind(target)
      vi.spyOn(target, "freshSnapshotAndEmit").mockImplementation(
        async (refresh, paths) => {
          if (paths !== undefined)
            throw new Error("Synthetic shell directory read failed after apply")
          return fresh(refresh, paths)
        }
      )
      const materialized = vi.fn()
      const stop = f.session.onChanged((snapshot) => {
        if (snapshot.materializedPaths !== undefined) materialized(snapshot)
      })
      await f.tick()
      expect(apply).toHaveBeenCalledOnce()
      expect(materialized).not.toHaveBeenCalled()
      expect(await fs.readFile(path.join(f.root, "note.txt"), "utf8")).toBe(
        "Remote replacement\n"
      )
      // This is the release fallback's actual production read, not a cached snapshot.
      const recovered = await f.session.refresh()
      expect(recovered.operation.phase).toBe("ready")
      expect(recovered.graft.clean).toBe(true)
      stop()
    } finally {
      await f.close()
    }
  }, 30_000)

  it("preserves both versions on divergence and never starts an automatic merge", async () => {
    const f = await fixture()
    try {
      await fs.writeFile(path.join(f.source, "note.txt"), "remote version\n")
      await f.sourceGraft.stageAll(f.source)
      await f.sourceGraft.commit(f.source, "Remote edit")
      await f.sourceGraft.push(f.source)
      await fs.writeFile(path.join(f.root, "note.txt"), "local version\n")
      const apply = vi.spyOn(f.graft, "applyMerge")
      await f.tick()
      expect(f.sync.status(f.session.canonical.id)).toMatchObject({
        state: "paused",
        lastFailure: { action: "review-local" },
      })
      expect(await fs.readFile(path.join(f.root, "note.txt"), "utf8")).toBe(
        "local version\n"
      )
      expect(await f.graft.status(f.root)).toMatchObject({
        ahead: 1,
        behind: 1,
        hasConflicts: false,
      })
      expect(apply).not.toHaveBeenCalled()
      const checkpointCount = (await f.graft.history(f.root)).commits.length
      await f.tick()
      expect((await f.graft.history(f.root)).commits).toHaveLength(
        checkpointCount
      )
    } finally {
      await f.close()
    }
  }, 30_000)

  it.each([false, true])(
    "cancels a real stalled HTTP fetch and releases the repository (native ignores abort=%s)",
    async (ignoreAbort) => {
      const children: ChildProcess[] = []
      const utilityFixture = fileURLToPath(
        new URL("./fixtures/automatic-graft-utility.ts", import.meta.url)
      )
      const tsxLoader = createRequire(import.meta.url).resolve("tsx")
      vi.mocked(utilityProcess.fork).mockImplementation(() => {
        const child = fork(utilityFixture, [], {
          execArgv: ["--import", tsxLoader],
          env: {
            ...process.env,
            ELECTRON_RUN_AS_NODE: "1",
            EIDOS_TEST_STALLED_NATIVE_ABORT: ignoreAbort ? "1" : "0",
          },
          stdio: ["ignore", "pipe", "pipe", "ipc"],
          serialization: "advanced",
        })
        children.push(child)
        Object.assign(child, {
          postMessage: (message: unknown) =>
            child.send(message as Parameters<ChildProcess["send"]>[0]),
        })
        return child as unknown as UtilityProcess
      })
      const f = await fixture(
        new GraftUtilityTransport("production-worker-through-node-ipc")
      )
      let requestStarted!: () => void
      const started = new Promise<void>((resolve) => {
        requestStarted = resolve
      })
      const server = http.createServer((_request, _response) =>
        requestStarted()
      )
      await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve)
      )
      const address = server.address()
      if (!address || typeof address === "string")
        throw new Error("Test server did not bind")
      try {
        await f.graft.removeRemote(f.root)
        await f.graft.addRemote(
          f.root,
          "origin",
          `graft+http://127.0.0.1:${address.port}/test/automatic`
        )
        await f.graft.setMainUpstream(f.root)
        const run = f.tick()
        await Promise.race([
          started,
          run.then(() => {
            throw new Error(
              `Sync stopped before HTTP request: ${JSON.stringify(f.sync.status(f.session.canonical.id))}`
            )
          }),
        ])
        const returnedAt = performance.now()
        f.sync.activity()
        await run
        expect(performance.now() - returnedAt).toBeLessThan(2_000)
        if (ignoreAbort)
          expect(children.some((child) => child.signalCode === "SIGTERM")).toBe(
            true
          )
        // This status request uses the same SDK repository session as the cancelled fetch.
        await expect(f.graft.status(f.root)).resolves.toMatchObject({
          dirty: false,
        })
        if (ignoreAbort) expect(children.length).toBeGreaterThan(1)
        expect(f.sync.status(f.session.canonical.id)?.state).toBe("idle")
        expect((await f.session.snapshot()).operation.phase).toBe("ready")
        expect(await fs.readFile(path.join(f.root, "note.txt"), "utf8")).toBe(
          "initial\n"
        )
      } finally {
        server.closeAllConnections()
        await new Promise<void>((resolve) => server.close(() => resolve()))
        await f.close()
      }
    },
    30_000
  )
})
