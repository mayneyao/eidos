import { fork } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import { pathToFileURL } from "node:url"
import type { RuntimeWorkerResponse } from "../../shared/contracts"
import {
  copyEidosFileSnapshot,
  createEidosLiteFileRuntime,
  openEidosLiteFileRuntime,
} from "../../runtime/eidos-file-runtime"
import { SpaceSession } from "./space-session"

const builtWorker = process.env.EIDOS_LITE_COPY_TEST_BUILT_WORKER
const receiptDirectory = process.env.EIDOS_LITE_COPY_TEST_RECEIPTS_DIR
const digest = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex")
const graft = {
  backend: "sdk",
  expectedVersion: () => "test",
  hasOpenSession: () => false,
  close: async () => undefined,
}

async function copyThroughBuiltWorker(
  wrapper: string,
  worker: string,
  sourcePath: string,
  destinationPath: string
): Promise<void> {
  const child = fork(wrapper, [], {
    execPath: process.execPath,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      EIDOS_LITE_COPY_WORKER_URL: pathToFileURL(worker).href,
    },
    stdio: ["ignore", "ignore", "pipe", "ipc"],
  })
  let stderr = ""
  child.stderr?.on("data", (bytes) => {
    stderr += String(bytes)
  })
  const exited = new Promise<void>((resolve) => {
    child.once("exit", () => resolve())
    child.once("error", () => resolve())
  })
  try {
    const result = await new Promise<RuntimeWorkerResponse>(
      (resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("copySnapshot worker timed out")),
          20000
        )
        child.once("error", (cause) => {
          clearTimeout(timer)
          reject(cause)
        })
        child.once("exit", (code) => {
          clearTimeout(timer)
          reject(new Error(`copySnapshot worker exited ${code}: ${stderr}`))
        })
        child.once("message", (message) => {
          clearTimeout(timer)
          resolve(message as RuntimeWorkerResponse)
        })
        child.send({
          type: "copySnapshot",
          requestId: 1,
          sourcePath,
          destinationPath,
        })
      }
    )
    expect(result.requestId).toBe(1)
    if (!result.ok) throw new Error(result.error.message)
  } finally {
    child.kill()
    await exited
  }
}

function inspectWal(bytes: Buffer) {
  expect(bytes.length).toBeGreaterThan(32)
  const magic = bytes.readUInt32BE(0)
  expect([0x377f0682, 0x377f0683]).toContain(magic)
  const pageSize = bytes.readUInt32BE(8)
  const frameSize = 24 + pageSize
  const frames = (bytes.length - 32) / frameSize
  expect(Number.isInteger(frames)).toBe(true)
  let commitFrames = 0
  for (let index = 0; index < frames; index++)
    if (bytes.readUInt32BE(32 + index * frameSize + 4) !== 0) commitFrames++
  expect(commitFrames).toBeGreaterThan(0)
  return {
    magic: magic.toString(16),
    pageSize,
    frames,
    commitFrames,
    bytes: bytes.length,
    sha256: digest(bytes),
  }
}

async function runWalCopyVector(mode: "source-runtime" | "built-worker") {
  const directory = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "lite-copy-live-wal-"))
  )
  const root = path.join(directory, "Space")
  await fs.mkdir(path.join(root, "source"), { recursive: true })
  await fs.mkdir(path.join(root, "direct"))
  await fs.mkdir(path.join(root, "folders"))
  const sourcePath = path.join(root, "source/active.eidos")
  const initial = await createEidosLiteFileRuntime(sourcePath, "Live WAL", {
    template: "blank",
  })
  const table = initial.initialSnapshot.tables[0]!
  const field = table.fields.find((candidate) => candidate.type === "text")!
  const baseline = await initial.source.insertRow(table.table.id, {
    [field.id]: "baseline in main DB",
  })
  await initial.close()

  // Adapter test setup only. All schema and business data above/below use Runtime.
  // Keep this connection open so no last-connection close can checkpoint the WAL.
  const configuration = new DatabaseSync(sourcePath)
  expect(
    configuration.prepare("PRAGMA journal_mode = WAL").get()
  ).toMatchObject({ journal_mode: "wal" })
  configuration.exec("PRAGMA wal_autocheckpoint = 0")
  const source = await openEidosLiteFileRuntime(sourcePath)
  let session: SpaceSession | undefined
  try {
    const mainBeforeWrites = await fs.readFile(sourcePath)
    await source.source.updateRow(table.table.id, String(baseline.row._id), {
      [field.id]: "baseline updated only in WAL",
    })
    await source.source.insertRow(table.table.id, {
      [field.id]: "new committed WAL row",
    })
    await source.source.insertRow(table.table.id, {
      [field.id]: "已提交 WAL 😀",
    })
    const latest = await source.source.getPage(table.table.id, 0, 100, {})
    expect(latest.rows).toHaveLength(3)
    const expectedRows = latest.rows
      .map((row) => ({ id: String(row._id), name: row[field.id] }))
      .sort((a, b) => a.id.localeCompare(b.id))
    const sourceSnapshot = await source.source.getSnapshot()
    expect(sourceSnapshot.metadata.fileId).toMatch(/^[0-9a-f-]{36}$/i)
    const mainAtCopy = await fs.readFile(sourcePath)
    expect(mainAtCopy).toEqual(mainBeforeWrites)
    const walAtCopy = await fs.readFile(`${sourcePath}-wal`)
    const wal = inspectWal(walAtCopy)
    expect((await fs.stat(`${sourcePath}-shm`)).size).toBeGreaterThan(0)

    // A deliberately main-only fixture is the negative control, not a copy path.
    const mainOnlyPath = path.join(directory, "main-only.eidos")
    await fs.copyFile(sourcePath, mainOnlyPath)
    const mainOnly = await openEidosLiteFileRuntime(mainOnlyPath, {
      readOnly: true,
    })
    let mainOnlyRows: { id: string; name: unknown }[]
    const mainOnlyRevision = String(mainOnly.initialSnapshot.metadata.revision)
    try {
      const page = await mainOnly.source.getPage(table.table.id, 0, 100, {})
      mainOnlyRows = page.rows.map((row) => ({
        id: String(row._id),
        name: row[field.id],
      }))
      expect(mainOnlyRows).toEqual([
        { id: String(baseline.row._id), name: "baseline in main DB" },
      ])
      expect(String(mainOnly.initialSnapshot.metadata.revision)).not.toBe(
        String(sourceSnapshot.metadata.revision)
      )
    } finally {
      await mainOnly.close()
    }

    await fs.writeFile(
      path.join(root, "source/note.txt"),
      "ordinary sibling copied with active WAL database"
    )
    session = await SpaceSession.create(root, path.join(directory, "state"), {
      graft: graft as never,
    })
    await session.snapshot()
    const wrapper = path.join(directory, "worker-wrapper.mjs")
    await fs.writeFile(
      wrapper,
      `process.parentPort = { on: (_name, listener) => process.on("message", data => listener({data})), postMessage: message => process.send(message) }; await import(process.env.EIDOS_LITE_COPY_WORKER_URL);`
    )
    const captures: { sourcePath: string; destinationPath: string }[] = []
    vi.spyOn(session.runtimePool, "copyFileSnapshot").mockImplementation(
      async (from, to) => {
        captures.push({ sourcePath: from, destinationPath: to })
        if (mode === "built-worker") {
          if (!builtWorker || !path.isAbsolute(builtWorker))
            throw new Error("An absolute built Runtime worker path is required")
          await copyThroughBuiltWorker(wrapper, builtWorker, from, to)
        } else await copyEidosFileSnapshot(from, to)
      }
    )
    const clipboard = await session.preparePathClipboard([
      "source/active.eidos",
    ])
    const direct = await session.copyPath(
      "source/active.eidos",
      "direct",
      clipboard
    )
    expect(direct.refreshError).toBeUndefined()
    const folderClipboard = await session.preparePathClipboard(["source"])
    const folder = await session.copyPath("source", "folders", folderClipboard)
    expect(folder.refreshError).toBeUndefined()
    const directoryEntriesBeforeOpen = await fs.readdir(
      path.join(root, "folders/source")
    )
    expect(directoryEntriesBeforeOpen.sort()).toEqual([
      "active.eidos",
      "note.txt",
    ])
    expect(captures.map((capture) => capture.sourcePath)).toEqual([
      sourcePath,
      sourcePath,
    ])
    expect(
      await fs.readFile(path.join(root, "folders/source/note.txt"), "utf8")
    ).toContain("ordinary sibling")

    const destinations = ["direct/active.eidos", "folders/source/active.eidos"]
    const copies = []
    for (const relativePath of destinations) {
      const filePath = path.join(root, relativePath)
      const bytes = await fs.readFile(filePath)
      const copied = await openEidosLiteFileRuntime(filePath, {
        readOnly: true,
      })
      try {
        const page = await copied.source.getPage(table.table.id, 0, 100, {})
        const rows = page.rows
          .map((row) => ({ id: String(row._id), name: row[field.id] }))
          .sort((a, b) => a.id.localeCompare(b.id))
        expect(rows).toEqual(expectedRows)
        expect(copied.initialSnapshot.metadata.fileId).toBe(
          sourceSnapshot.metadata.fileId
        )
        expect(String(copied.initialSnapshot.metadata.revision)).toBe(
          String(sourceSnapshot.metadata.revision)
        )
        copies.push({
          relativePath,
          bytes: bytes.length,
          sha256: digest(bytes),
          rows,
          fileId: copied.initialSnapshot.metadata.fileId,
          revision: String(copied.initialSnapshot.metadata.revision),
        })
      } finally {
        await copied.close()
      }
    }
    const mainAfterCopies = await fs.readFile(sourcePath)
    const walAfterCopies = await fs.readFile(`${sourcePath}-wal`)
    expect(mainAfterCopies).toEqual(mainAtCopy)
    expect(walAfterCopies).toEqual(walAtCopy)
    expect(configuration.isOpen).toBe(true)
    const stillReadable = await source.source.getPage(
      table.table.id,
      0,
      100,
      {}
    )
    expect(stillReadable.rows).toHaveLength(3)

    // A further public mutation proves the source was not closed or frozen by copy.
    await source.source.insertRow(table.table.id, {
      [field.id]: "source writable after both copies",
    })
    expect(
      (await source.source.getPage(table.table.id, 0, 100, {})).rows
    ).toHaveLength(4)

    if (receiptDirectory) {
      if (!path.isAbsolute(receiptDirectory))
        throw new Error("Receipt directory must be absolute")
      const output = path.join(receiptDirectory, mode)
      await fs.mkdir(output, { recursive: true })
      await fs.writeFile(path.join(output, "source-main.eidos"), mainAtCopy)
      await fs.writeFile(path.join(output, "source-main.eidos-wal"), walAtCopy)
      for (const copy of copies)
        await fs.copyFile(
          path.join(root, copy.relativePath),
          path.join(
            output,
            copy.relativePath.startsWith("direct")
              ? "direct-result.eidos"
              : "directory-result.eidos"
          )
        )
      await fs.writeFile(path.join(output, "main-only.eidos"), mainAtCopy)
      await fs.writeFile(
        path.join(output, "vector.json"),
        JSON.stringify(
          {
            mode,
            sourcePath,
            fileId: sourceSnapshot.metadata.fileId,
            revision: String(sourceSnapshot.metadata.revision),
            adapterSetup: [
              "PRAGMA journal_mode = WAL",
              "PRAGMA wal_autocheckpoint = 0",
            ],
            adapterSetupConnection:
              "auxiliary connection kept open; Runtime writer defaults unchanged; uncheckpointed state verified from bytes and negative control",
            businessWrites: "public Eidos Runtime only",
            sourceOpenAcrossBothCopies: true,
            main: {
              bytes: mainAtCopy.length,
              sha256: digest(mainAtCopy),
              unchangedSinceBeforeWalWrites: true,
            },
            wal,
            mainOnlyRevision,
            mainOnlyRows,
            expectedRows,
            captures,
            copies,
            sourceMainAndWalUnchangedAcrossCopies: true,
            sourceReadableAfterCopies: true,
            sourceWritableAfterCopies: true,
            sourceRowsAfterFurtherPublicMutation: 4,
            sourceAfterCopiesBeforeFurtherMutation: {
              mainSha256: digest(mainAfterCopies),
              walSha256: digest(walAfterCopies),
            },
            directoryEntriesBeforeDestinationOpen: directoryEntriesBeforeOpen,
            builtWorker:
              mode === "built-worker"
                ? {
                    path: builtWorker,
                    sha256: digest(await fs.readFile(builtWorker!)),
                  }
                : null,
          },
          null,
          2
        ) + "\n"
      )
    }
  } finally {
    await session?.close()
    await source.close()
    configuration.close()
    await fs.rm(directory, { recursive: true, force: true })
  }
}

it("copies real uncheckpointed WAL through Space copy with the canonical source Runtime", async () => {
  await runWalCopyVector("source-runtime")
})

it.runIf(Boolean(builtWorker))(
  "copies real uncheckpointed WAL through Space copy and the actual built Runtime worker",
  async () => {
    await runWalCopyVector("built-worker")
  }
)
