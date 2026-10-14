import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { beforeEach, afterEach, expect, it, vi } from "vitest"
import { SpaceSession } from "./space-session"
import { filemeta } from "../../runtime/filemeta"
import {
  createEidosLiteFileRuntime,
  openEidosLiteFileRuntime,
} from "../../runtime/eidos-file-runtime"
import {
  SPACE_PROPERTIES_FILE,
  SPACE_PROPERTIES_NAMESPACE,
} from "../../shared/space-properties"
import type { RuntimeCalls, RuntimeMethod } from "../../shared/contracts"

let root: string
const runtimes = new Map<
  string,
  Awaited<ReturnType<typeof openEidosLiteFileRuntime>>
>()
let session: SpaceSession
beforeEach(async () => {
  root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "eidos-space-properties-"))
  )
  await fs.mkdir(path.join(root, "docs"))
  await fs.mkdir(path.join(root, "empty"))
  await fs.writeFile(path.join(root, "docs/note.txt"), "content")
  await fs.writeFile(path.join(root, "other.txt"), "other")
  const open = async (relativePath: string) => {
    const runtime =
      runtimes.get(relativePath) ??
      (await openEidosLiteFileRuntime(path.join(root, relativePath)))
    runtimes.set(relativePath, runtime)
    return {
      sessionId: relativePath,
      relativePath,
      readOnly: false,
      snapshot: await runtime.source.getSnapshot(),
    }
  }
  session = Object.assign(Object.create(SpaceSession.prototype), {
    canonical: { root },
    gate: {
      withMutation: (run: () => Promise<unknown>) => run(),
      withRuntimeRead: (run: () => Promise<unknown>) => run(),
    },
    runtimePool: {
      filemeta: (
        relativePath: string,
        namespace: string,
        patch: Parameters<typeof filemeta>[3],
        allowDirectories: boolean
      ) => filemeta(root, relativePath, namespace, patch, allowDirectories),
      open,
      create: async (relativePath: string) => {
        const runtime = await createEidosLiteFileRuntime(
          path.join(root, relativePath),
          "Files",
          { template: "files-index" }
        )
        runtimes.set(relativePath, runtime)
        return open(relativePath)
      },
      call: async (
        id: string,
        method: RuntimeMethod,
        args: RuntimeCalls[RuntimeMethod]["args"]
      ) => {
        const source = runtimes.get(id)!.source
        return Reflect.apply(Reflect.get(source, method), source, args)
      },
    },
    runtimeSessionByPath: new Map(),
    prioritizeLocalWork() {},
    rememberRuntimeExternalChangeState: vi.fn(),
    noteLocalChange: vi.fn(),
    notifyMarkdownWatchers() {},
    freshSnapshotAndEmit: vi.fn(),
  }) as SpaceSession
})
afterEach(async () => {
  for (const runtime of runtimes.values()) await runtime.close()
  runtimes.clear()
  await fs.rm(root, { recursive: true, force: true })
})

it("edits folders and files directly, preserves foreign values, and reports partial writes", async () => {
  await filemeta(root, "docs/note.txt", SPACE_PROPERTIES_NAMESPACE, {
    set: { external: { retained: true } },
  })
  const update = await session.patchEntryProperties(
    ["docs", "docs/note.txt", "missing.txt"],
    { set: { tags: ["work"], rating: 4 } }
  )
  expect(update.updated).toEqual(["docs", "docs/note.txt"])
  expect(update.errors).toEqual([
    { path: "missing.txt", message: expect.any(String) },
  ])
  const selected = await session.readEntryProperties(["docs", "docs/note.txt"])
  expect(selected.entries[0]?.values).toEqual({ tags: ["work"], rating: 4 })
  expect(selected.entries[1]?.values.external).toEqual({ retained: true })
  expect((await fs.readdir(root)).some((name) => name.endsWith(".eidos"))).toBe(
    false
  )
  await expect(
    session.patchEntryProperties(["docs/note.txt"], { set: { rating: "bad" } })
  ).rejects.toThrow("Invalid value")
  await expect(
    session.patchEntryProperties(["docs/note.txt"], { set: { unknown: true } })
  ).rejects.toThrow("Unknown property")
  expect(await fs.readFile(path.join(root, "docs/note.txt"), "utf8")).toBe(
    "content"
  )
  await expect(
    filemeta(root, "docs", SPACE_PROPERTIES_NAMESPACE)
  ).rejects.toThrow()
  await fs.symlink(path.join(root, "docs"), path.join(root, "link"))
  const unsafe = await session.patchEntryProperties(["link", "link/note.txt"], {
    set: { rating: 1 },
  })
  expect(unsafe.updated).toEqual([])
  expect(unsafe.errors).toHaveLength(2)
})

it("opens a single root catalog from different folders and shares canonical field definitions and values", async () => {
  await session.patchEntryProperties(["docs", "docs/note.txt"], {
    set: { rating: 4 },
  })
  const first = await session.manageFolderProperties("docs")
  expect(await session.manageFolderProperties("empty")).toEqual(first)
  expect(await session.manageFolderProperties(null)).toEqual(first)
  expect(first.relativePath).toBe(SPACE_PROPERTIES_FILE)
  expect(await fs.readdir(path.join(root, "docs"))).toEqual(["note.txt"])
  const schema = await session.defineProperty({ key: "client", type: "text" })
  expect(schema.fields.find((field) => field.key === "client")?.type).toBe(
    "text"
  )
  const runtime = runtimes.get(SPACE_PROPERTIES_FILE)!
  const table = (await runtime.source.getSnapshot()).tables[0]!
  const client = table.fields.find((field) => field.name === "client")!
  const status = table.fields.find((field) => field.name === "status")!
  await runtime.source.updateField(table.table.id, status.id, {
    property: {
      options: [
        { name: "Todo", color: "blue" },
        { name: "In progress", color: "orange" },
        { name: "Done", color: "green" },
      ],
    },
  })
  const sharedStatus = (await session.getPropertySchema()).fields.find(
    (field) => field.key === "status"
  )!
  expect(sharedStatus.field).toEqual(
    (await runtime.source.getSnapshot()).tables[0]!.fields.find(
      (field) => field.id === status.id
    )
  )
  expect(sharedStatus.options).toEqual(["Todo", "In progress", "Done"])
  await runtime.source.updateRow(table.table.id, "docs/note.txt", {
    [client.id]: "Acme",
  })
  expect(
    (await session.readEntryProperties(["docs/note.txt"])).entries[0]?.values
      .client
  ).toBe("Acme")
  await runtime.source.addField(table.table.id, {
    name: "reviewed",
    type: "checkbox",
  })
  expect(
    (await session.getPropertySchema()).fields.find(
      (field) => field.key === "reviewed"
    )?.type
  ).toBe("checkbox")
  await session.patchEntryProperties(["docs"], { set: { reviewed: true } })
  expect(
    (await filemeta(root, "docs", SPACE_PROPERTIES_NAMESPACE, undefined, true))
      .reviewed
  ).toBe(true)
  await expect(
    session.defineProperty({ key: "client", type: "number" })
  ).rejects.toThrow("cannot change type")
  expect(
    (await runtime.source.getSnapshot()).tables[0]!.views.every(
      (view) => !view.filter
    )
  ).toBe(true)
  const pathField = table.fields.find((field) => field.name === "path")!
  await fs.mkdir(path.join(root, "docs-other"))
  await fs.writeFile(path.join(root, "docs-other/outside.txt"), "outside")
  const query = {
    filter: {
      type: "group" as const,
      conjunction: "and" as const,
      children: [
        {
          type: "rule" as const,
          field: pathField.id,
          operator: "starts-with" as const,
          value: "docs/",
        },
      ],
    },
  }
  const scoped = await runtime.source.getPage(table.table.id, 0, 100, query)
  expect(scoped.total).toBe(1)
  expect(scoped.rows.map((row) => row._id)).toEqual(["docs/note.txt"])
  expect(
    await runtime.source.getRecordNeighbors(
      table.table.id,
      "docs/note.txt",
      query
    )
  ).toEqual({ found: true, previousId: null, nextId: null })
  expect(
    await runtime.source.getRowIndex(table.table.id, "other.txt", query)
  ).toBeNull()
})

it("never overwrites an unrelated or linked root files.eidos and rejects escaped folder scope", async () => {
  await fs.writeFile(path.join(root, SPACE_PROPERTIES_FILE), "ordinary content")
  await expect(session.manageFolderProperties("docs")).rejects.toThrow()
  expect(
    await fs.readFile(path.join(root, SPACE_PROPERTIES_FILE), "utf8")
  ).toBe("ordinary content")
  await fs.unlink(path.join(root, SPACE_PROPERTIES_FILE))
  await fs.symlink(
    path.join(root, "other.txt"),
    path.join(root, SPACE_PROPERTIES_FILE)
  )
  await expect(session.manageFolderProperties(null)).rejects.toThrow()
  await expect(session.manageFolderProperties("../outside")).rejects.toThrow()
  expect(await fs.readFile(path.join(root, "other.txt"), "utf8")).toBe("other")
})
