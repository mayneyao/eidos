import fs from "node:fs/promises"
import { existsSync } from "node:fs"
import path from "node:path"
import os from "node:os"
import { vi, it, expect } from "vitest"
import type {
  RuntimeWorkerRequest,
  RuntimeWorkerResponse,
} from "../../shared/contracts"
import type { PreparedMarkdownLinkBatch } from "../../shared/markdown-link-batch"

const transport = vi.hoisted(() => ({
  bootstrap: "",
  maintenanceForks: 0,
  uiForks: 0,
  children: new Set<number>(),
  prepared: [] as PreparedMarkdownLinkBatch[],
}))
vi.mock("electron", async () => {
  const { fork } = await import("node:child_process")
  return {
    utilityProcess: {
      fork: (
        worker: string,
        _args: string[],
        options: { serviceName?: string }
      ) => {
        const maintenance = options.serviceName === "Eidos link maintenance"
        if (maintenance) transport.maintenanceForks++
        else transport.uiForks++
        const child = fork(transport.bootstrap, [worker], {
          execPath: process.execPath,
          execArgv: [],
          serialization: "advanced",
          env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
          stdio: ["ignore", "pipe", "pipe", "ipc"],
        })
        transport.children.add(child.pid!)
        child.on("exit", () => transport.children.delete(child.pid!))
        child.on("message", (message: RuntimeWorkerResponse) => {
          if (
            maintenance &&
            message.ok &&
            (message.result as PreparedMarkdownLinkBatch)?.stats
          )
            transport.prepared.push(message.result as PreparedMarkdownLinkBatch)
        })
        return Object.assign(child, {
          postMessage: (request: RuntimeWorkerRequest) => child.send(request),
        })
      },
    },
  }
})
import { SpaceSession } from "./space-session"
import { MarkdownLinkWorker } from "../runtime/markdown-link-worker"
import { openEidosLiteFileRuntime } from "../../runtime/eidos-file-runtime"
import {
  seedLinkBatchSpace,
  readLinkBatchRow,
  LINK_BODY,
  LINK_MARKDOWN,
  LINK_PNG,
} from "./markdown-link-batch.test-fixture"

const worker = path.resolve(process.cwd(), "dist-electron/runtime-worker.js")
const graft = {
  backend: "sdk",
  expectedVersion: () => "test",
  hasOpenSession: () => false,
  close: async () => {},
}

async function fixture() {
  const directory = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "eidos-link-batch-"))
  )
  const root = path.join(directory, "Space")
  const seeded = (await seedLinkBatchSpace(root, { databases: 8, rows: 100 }))!
  transport.bootstrap = path.join(directory, "worker.mjs")
  await fs.writeFile(
    transport.bootstrap,
    'Object.defineProperty(process,"parentPort",{value:{on:(_event,listener)=>process.on("message",value=>listener({data:value})),postMessage:value=>process.send(value)}});await import(process.argv[2]);'
  )
  transport.maintenanceForks = 0
  transport.uiForks = 0
  transport.prepared = []
  const session = await SpaceSession.create(
    root,
    path.join(directory, "state"),
    { graft: graft as never, workerPath: worker }
  )
  return {
    directory,
    root,
    seeded,
    session,
    close: async () => {
      await session.close()
      await fs.rm(directory, { recursive: true, force: true })
      expect(transport.children.size).toBe(0)
    },
  }
}

it.skipIf(!existsSync(worker))(
  "snapshots and parses one batch, reuses one maintenance worker, and preserves resident UI edits",
  async () => {
    const f = await fixture()
    try {
      const open = []
      for (let index = 0; index < 3; index++)
        open.push(await f.session.openEidosFile(`data/db-${index}.eidos`))
      const residentBefore = f.session.runtimePool
        .residentRelativePaths()
        .filter((owner) => owner !== "data/db-0.eidos")
        .sort()
      const forksBefore = transport.uiForks
      const result = await f.session.movePaths(
        ["data/db-0.eidos", "assets/c.png", "notes/note-0.md"],
        "destination"
      )
      expect(result.failure).toBeUndefined()
      expect(result.markdownLinks?.skippedPaths).toEqual([])
      expect(transport.maintenanceForks).toBe(1)
      expect(transport.uiForks).toBe(forksBefore)
      expect(transport.prepared).toHaveLength(1)
      expect(transport.prepared[0]!.stats).toMatchObject({
        snapshots: 1,
        eidosReads: 8,
        contentDocuments: 800,
        parsedDocuments: 805,
      })
      expect(f.session.runtimePool.residentRelativePaths().sort()).toEqual(
        residentBefore
      )
      for (let index = 0; index < 8; index++) {
        const owner =
          index === 0 ? "destination/db-0.eidos" : `data/db-${index}.eidos`
        const row = await readLinkBatchRow(
          f.root,
          owner,
          f.seeded.tableId,
          f.seeded.rowId
        )
        expect(row?.[f.seeded.content.tableColumnName]).toBe(
          index === 0
            ? LINK_BODY.replace("../assets/c.png", "c.png")
            : LINK_BODY.replace(
                "../assets/c.png",
                "../destination/c.png"
              ).replace("](db-0.eidos)", "](../destination/db-0.eidos)")
        )
        expect(row?.[f.seeded.other.tableColumnName]).toBe(LINK_BODY)
        expect(row?.[f.seeded.file.tableColumnName]).toEqual(
          f.seeded.originalFiles
        )
      }
      expect(
        await fs.readFile(path.join(f.root, "destination/note-0.md"), "utf8")
      ).toBe(
        LINK_MARKDOWN.replace("../assets/c.png", "c.png").replace(
          "../data/db-0.eidos",
          "db-0.eidos"
        )
      )
      expect(
        await fs.readFile(path.join(f.root, "notes/note-1.md"), "utf8")
      ).toBe(
        LINK_MARKDOWN.replace(
          "../assets/c.png",
          "../destination/c.png"
        ).replace("../data/db-0.eidos", "../destination/db-0.eidos")
      )
      expect(await fs.readFile(path.join(f.root, "destination/c.png"))).toEqual(
        LINK_PNG
      )
      expect(
        await fs.readFile(path.join(f.root, "data/assets/local.png"))
      ).toEqual(LINK_PNG)
      await expect(
        f.session.callRuntime(open[1]!.sessionId, "updateRow", [
          f.seeded.tableId,
          f.seeded.rowId,
          { [f.seeded.other.id]: "UI source revision refreshed" },
        ])
      ).resolves.toBeDefined()
    } finally {
      await f.close()
    }
  },
  30000
)

it.skipIf(!existsSync(worker))(
  "updates references only for the completed prefix when a later owner cannot move",
  async () => {
    const f = await fixture()
    try {
      await fs.writeFile(
        path.join(f.root, "destination/db-0.eidos"),
        "collision sentinel"
      )
      const result = await f.session.movePaths(
        ["assets/c.png", "data/db-0.eidos", "notes/note-0.md"],
        "destination"
      )
      expect(result.failure?.relativePath).toBe("data/db-0.eidos")
      expect(result.moves).toEqual([
        { source: "assets/c.png", relativePath: "destination/c.png" },
      ])
      expect(result.unattemptedPaths).toEqual(["notes/note-0.md"])
      const row = await readLinkBatchRow(
        f.root,
        "data/db-0.eidos",
        f.seeded.tableId,
        f.seeded.rowId
      )
      expect(row?.[f.seeded.content.tableColumnName]).toBe(
        LINK_BODY.replace("../assets/c.png", "../destination/c.png")
      )
      expect(
        await fs.readFile(path.join(f.root, "notes/note-0.md"), "utf8")
      ).toBe(LINK_MARKDOWN.replace("../assets/c.png", "../destination/c.png"))
      expect(
        await fs.readFile(path.join(f.root, "destination/db-0.eidos"), "utf8")
      ).toBe("collision sentinel")
      expect(transport.maintenanceForks).toBe(1)
    } finally {
      await f.close()
    }
  },
  30000
)

it.skipIf(!existsSync(worker))(
  "preserves newer Markdown and Content revisions after the batch snapshot",
  async () => {
    const f = await fixture()
    const prepare = MarkdownLinkWorker.prototype.prepare
    const spy = vi
      .spyOn(MarkdownLinkWorker.prototype, "prepare")
      .mockImplementationOnce(async function (
        this: MarkdownLinkWorker,
        ...args
      ) {
        const result = await prepare.apply(this, args)
        const runtime = await openEidosLiteFileRuntime(
          path.join(f.root, "data/db-0.eidos")
        )
        try {
          await runtime.source.updateRow(f.seeded.tableId, f.seeded.rowId, {
            [f.seeded.content.id]: "newer Content saved externally",
          })
        } finally {
          await runtime.close()
        }
        await fs.writeFile(
          path.join(f.root, "notes/note-0.md"),
          "newer Markdown saved externally"
        )
        return result
      })
    try {
      const result = await f.session.movePaths(["assets/c.png"], "destination")
      expect(result.failure).toBeUndefined()
      expect(result.markdownLinks?.skippedPaths).toEqual(
        expect.arrayContaining(["data/db-0.eidos", "notes/note-0.md"])
      )
      const row = await readLinkBatchRow(
        f.root,
        "data/db-0.eidos",
        f.seeded.tableId,
        f.seeded.rowId
      )
      expect(row?.[f.seeded.content.tableColumnName]).toBe(
        "newer Content saved externally"
      )
      expect(
        await fs.readFile(path.join(f.root, "notes/note-0.md"), "utf8")
      ).toBe("newer Markdown saved externally")
      const other = await readLinkBatchRow(
        f.root,
        "data/db-1.eidos",
        f.seeded.tableId,
        f.seeded.rowId
      )
      expect(other?.[f.seeded.content.tableColumnName]).toBe(
        LINK_BODY.replace("../assets/c.png", "../destination/c.png")
      )
      expect(other?.[f.seeded.other.tableColumnName]).toBe(LINK_BODY)
      expect(other?.[f.seeded.file.tableColumnName]).toEqual(
        f.seeded.originalFiles
      )
    } finally {
      spy.mockRestore()
      await f.close()
    }
  },
  30000
)

it.skipIf(!existsSync(worker))(
  "handles directory owner/target moves and equivalent adjacent rename without extra UI workers",
  async () => {
    const f = await fixture()
    try {
      const moved = await f.session.movePaths(["data", "assets"], "destination")
      expect(moved.failure).toBeUndefined()
      expect(moved.markdownLinks?.skippedPaths).toEqual([])
      const row = await readLinkBatchRow(
        f.root,
        "destination/data/db-0.eidos",
        f.seeded.tableId,
        f.seeded.rowId
      )
      expect(row?.[f.seeded.content.tableColumnName]).toBe(
        LINK_BODY.replace("../inbox/untouched.txt", "../../inbox/untouched.txt")
      )
      const renamed = await f.session.renamePath(
        "destination/assets/c.png",
        "renamed.png"
      )
      expect(renamed.markdownLinks?.skippedPaths).toEqual([])
      const after = await readLinkBatchRow(
        f.root,
        "destination/data/db-0.eidos",
        f.seeded.tableId,
        f.seeded.rowId
      )
      expect(after?.[f.seeded.content.tableColumnName]).toBe(
        LINK_BODY.replace("../assets/c.png", "../assets/renamed.png").replace(
          "../inbox/untouched.txt",
          "../../inbox/untouched.txt"
        )
      )
      expect(
        await fs.readFile(path.join(f.root, "destination/assets/renamed.png"))
      ).toEqual(LINK_PNG)
      expect(transport.maintenanceForks).toBe(1)
      expect(transport.uiForks).toBe(0)
    } finally {
      await f.close()
    }
  },
  30000
)

it.skipIf(!existsSync(worker))(
  "reports a stopped maintenance worker and closes it before the next operation",
  async () => {
    const f = await fixture()
    const apply = MarkdownLinkWorker.prototype.apply
    const spy = vi
      .spyOn(MarkdownLinkWorker.prototype, "apply")
      .mockImplementationOnce(function (this: MarkdownLinkWorker, ...args) {
        this.abort()
        return apply.apply(this, args)
      })
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const result = await f.session.movePaths(["assets/c.png"], "destination")
      expect(result.moves).toHaveLength(1)
      expect(result.markdownLinks?.skippedPaths).toEqual(
        expect.arrayContaining(["data/db-0.eidos", "notes/note-0.md"])
      )
      const row = await readLinkBatchRow(
        f.root,
        "data/db-0.eidos",
        f.seeded.tableId,
        f.seeded.rowId
      )
      expect(row?.[f.seeded.content.tableColumnName]).toBe(LINK_BODY)
      const restored = await f.session.movePaths(
        ["destination/c.png"],
        "assets"
      )
      expect(restored.failure).toBeUndefined()
      expect(restored.markdownLinks?.skippedPaths).toEqual([])
      expect(transport.maintenanceForks).toBe(2)
      expect(warning).toHaveBeenCalled()
    } finally {
      spy.mockRestore()
      warning.mockRestore()
      await f.close()
    }
  },
  30000
)

it.skipIf(!existsSync(worker))(
  "rejects a protected Space mutation before taking a snapshot or starting workers",
  async () => {
    const f = await fixture()
    const protectedSession = await SpaceSession.create(
      f.root,
      path.join(f.directory, "protected-state"),
      { graft: graft as never, workerPath: worker, readOnly: true }
    )
    try {
      await expect(
        protectedSession.movePaths(["assets/c.png"], "destination")
      ).rejects.toThrow(/read.only/iu)
      expect(transport.maintenanceForks).toBe(0)
      expect(transport.uiForks).toBe(0)
      expect(await fs.readFile(path.join(f.root, "assets/c.png"))).toEqual(
        LINK_PNG
      )
    } finally {
      await protectedSession.close()
      await f.close()
    }
  },
  30000
)

it.skipIf(!existsSync(worker))(
  "preserves an atomically replaced Eidos file even when its revision matches the snapshot",
  async () => {
    const f = await fixture()
    const replacement = path.join(f.directory, "replacement.eidos")
    await fs.copyFile(path.join(f.root, "data/db-0.eidos"), replacement)
    let revision: string | undefined
    for (const [file, branch] of [
      [path.join(f.root, "data/db-0.eidos"), "A"],
      [replacement, "B"],
    ]) {
      const runtime = await openEidosLiteFileRuntime(file!)
      try {
        const changed = await runtime.source.updateRow(
          f.seeded.tableId,
          f.seeded.rowId,
          { [f.seeded.content.id]: `${LINK_BODY}\nbranch ${branch}` }
        )
        if (revision) expect(String(changed.revision)).toBe(revision)
        revision = String(changed.revision)
      } finally {
        await runtime.close()
      }
    }
    const prepare = MarkdownLinkWorker.prototype.prepare
    const spy = vi
      .spyOn(MarkdownLinkWorker.prototype, "prepare")
      .mockImplementationOnce(async function (
        this: MarkdownLinkWorker,
        ...args
      ) {
        const result = await prepare.apply(this, args)
        await fs.rename(replacement, path.join(f.root, "data/db-0.eidos"))
        return result
      })
    try {
      const result = await f.session.movePaths(["assets/c.png"], "destination")
      expect(result.failure).toBeUndefined()
      expect(result.markdownLinks?.skippedPaths).toContain("data/db-0.eidos")
      const row = await readLinkBatchRow(
        f.root,
        "data/db-0.eidos",
        f.seeded.tableId,
        f.seeded.rowId
      )
      expect(row?.[f.seeded.content.tableColumnName]).toBe(
        `${LINK_BODY}\nbranch B`
      )
      expect(row?.[f.seeded.other.tableColumnName]).toBe(LINK_BODY)
      expect(row?.[f.seeded.file.tableColumnName]).toEqual(
        f.seeded.originalFiles
      )
    } finally {
      spy.mockRestore()
      await f.close()
    }
  },
  30000
)

it.skipIf(!existsSync(worker))(
  "drains a mutation during normal Space close before disposing its maintenance worker",
  async () => {
    const f = await fixture()
    let enter!: () => void, release!: () => void
    const entered = new Promise<void>((resolve) => {
      enter = resolve
    })
    const released = new Promise<void>((resolve) => {
      release = resolve
    })
    const apply = MarkdownLinkWorker.prototype.apply
    const spy = vi
      .spyOn(MarkdownLinkWorker.prototype, "apply")
      .mockImplementationOnce(async function (
        this: MarkdownLinkWorker,
        ...args
      ) {
        enter()
        await released
        return apply.apply(this, args)
      })
    try {
      const moving = f.session.movePaths(["assets/c.png"], "destination")
      await entered
      const closing = f.session.close()
      await new Promise<void>((resolve) => setImmediate(resolve))
      release()
      await Promise.allSettled([moving, closing])
      const row = await readLinkBatchRow(
        f.root,
        "data/db-0.eidos",
        f.seeded.tableId,
        f.seeded.rowId
      )
      expect(row?.[f.seeded.content.tableColumnName]).toBe(
        LINK_BODY.replace("../assets/c.png", "../destination/c.png")
      )
      expect(transport.children.size).toBe(0)
    } finally {
      release()
      spy.mockRestore()
      await f.close()
    }
  },
  30000
)
