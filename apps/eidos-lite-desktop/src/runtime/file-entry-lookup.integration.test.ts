import { mkdtemp, mkdir, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "node:os"
import { DatabaseSync } from "node:sqlite"
import { afterEach, expect, it, vi } from "vitest"
import {
  createEidosFileUuid,
  decodeEidosFileValues,
  encodeEidosFileValues,
  EidosAdapterError,
  quoteIdentifier,
  Runtime,
  type FileEntry,
} from "@eidos.space/eidos-file"
import { NodeSqliteConnectionPort } from "@eidos.space/eidos-file/node-sqlite"
import {
  createEidosLiteFileRuntime,
  openEidosLiteFileRuntime,
} from "./eidos-file-runtime"

const roots: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true })
})

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "eidos-entry-batch-"))
  roots.push(root)
  const file = path.join(root, "entries.eidos")
  const opened = await createEidosLiteFileRuntime(file, "Entries")
  let snapshot = opened.initialSnapshot
  const table = snapshot.tables[0]!
  snapshot = await opened.source.addField(table.table.id, {
    name: "Files",
    type: "file",
  })
  const field = snapshot.tables[0]!.fields.find(
    (value) => value.name === "Files"
  )!
  const entries: FileEntry[] = Array.from({ length: 4 }, (_, i) => ({
    id: createEidosFileUuid(),
    uri: `assets/${i}.png`,
    name: `${i}.png`,
    mediaType: "image/png",
    size: "9",
  }))
  const rows = []
  for (const entry of entries)
    rows.push(
      (
        await opened.source.insertRow(table.table.id, {
          [field.id!]: encodeEidosFileValues([entry]),
        })
      ).row
    )
  return { opened, file, table: snapshot.tables[0]!, field, entries, rows }
}

function scanSpy() {
  const query = vi.spyOn(NodeSqliteConnectionPort.prototype, "query")
  return {
    query,
    scans: () =>
      query.mock.calls.filter(
        ([sql]) => sql.includes("json_each(") && sql.includes("AS value")
      ),
  }
}

function withoutQueuedReadBridge() {
  const open = Runtime.open
  const create = Runtime.create
  vi.spyOn(Runtime, "open").mockImplementation(async (...args) => {
    const binding = await open(...args)
    delete binding.hostBridge.queuedRead
    return binding
  })
  vi.spyOn(Runtime, "create").mockImplementation(async (...args) => {
    const binding = await create(...args)
    delete binding.hostBridge.queuedRead
    return binding
  })
}

/** Writes only this test's private corruption/external-change fixture. */
function replaceFixtureFileValue(
  file: string,
  tableId: string,
  fieldId: string,
  rowId: string,
  value: string
) {
  const writer = new DatabaseSync(file)
  try {
    const table = writer
      .prepare("SELECT physical_name FROM eidos__tables WHERE id=?")
      .get(tableId)!.physical_name as string
    const column = writer
      .prepare("SELECT physical_name FROM eidos__fields WHERE id=?")
      .get(fieldId)!.physical_name as string
    writer.exec("PRAGMA ignore_check_constraints=ON")
    writer
      .prepare(
        `UPDATE ${quoteIdentifier(table)} SET ${quoteIdentifier(column)}=? WHERE _id=?`
      )
      .run(value, rowId)
  } finally {
    writer.close()
  }
}

it("coalesces one event-loop batch while retaining fresh per-ID results", async () => {
  if (process.env.EIDOS_TEST_LEGACY_FILE_LOOKUP === "1") {
    withoutQueuedReadBridge()
  }
  const { opened, file, table, field, entries, rows } = await fixture()
  const spy = scanSpy()
  try {
    expect(
      await Promise.all(entries.map((entry) => opened.findFileEntry(entry.id)))
    ).toEqual(entries)
    expect(spy.scans()).toHaveLength(1)
    spy.query.mockClear()
    const changed = {
      ...entries[0]!,
      name: "changed.png",
      uri: "assets/changed.png",
    }
    replaceFixtureFileValue(
      file,
      table.table.id,
      field.id!,
      String(rows[0]!._id),
      encodeEidosFileValues([changed])
    )
    expect(
      await Promise.all([
        opened.findFileEntry(entries[0]!.id),
        opened.findFileEntry(entries[1]!.id),
        opened.findFileEntry(createEidosFileUuid()),
      ])
    ).toEqual([changed, entries[1], null])
    expect(spy.scans()).toHaveLength(1)
  } finally {
    await opened.close()
  }
})

it("keeps independent original lookups for a binding without the optional bridge", async () => {
  withoutQueuedReadBridge()
  const { opened, entries } = await fixture()
  const spy = scanSpy()
  try {
    expect(
      await Promise.all(entries.map((entry) => opened.findFileEntry(entry.id)))
    ).toEqual(entries)
    expect(spy.scans()).toHaveLength(4)
  } finally {
    await opened.close()
  }
})

it("retains cross-column ID conflicts and isolates a failing lookup from unrelated IDs", async () => {
  const data = await fixture()
  const snapshot = await data.opened.source.addField(data.table.table.id, {
    name: "Other files",
    type: "file",
  })
  const other = snapshot.tables[0]!.fields.find(
    (field) => field.name === "Other files"
  )!
  await data.opened.close()
  replaceFixtureFileValue(
    data.file,
    data.table.table.id,
    other.id!,
    String(data.rows[1]!._id),
    encodeEidosFileValues([{ ...data.entries[0]!, name: "conflict.png" }])
  )
  const opened = await openEidosLiteFileRuntime(data.file, { readOnly: true })
  try {
    const [conflict, valid, missing] = await Promise.allSettled([
      opened.findFileEntry(data.entries[0]!.id),
      opened.findFileEntry(data.entries[2]!.id),
      opened.findFileEntry(createEidosFileUuid()),
    ])
    expect(conflict).toMatchObject({
      status: "rejected",
      reason: { message: "File entry ID resolves to conflicting metadata" },
    })
    expect(valid).toEqual({ status: "fulfilled", value: data.entries[2] })
    expect(missing).toEqual({ status: "fulfilled", value: null })
  } finally {
    await opened.close()
  }
})

it("retains malformed File validation with independent errors per lookup", async () => {
  const data = await fixture()
  await data.opened.close()
  replaceFixtureFileValue(
    data.file,
    data.table.table.id,
    data.field.id!,
    String(data.rows[1]!._id),
    JSON.stringify([{ ...data.entries[1]!, size: 9 }])
  )
  const opened = await openEidosLiteFileRuntime(data.file, { readOnly: true })
  try {
    const results = await Promise.allSettled([
      opened.findFileEntry(data.entries[0]!.id),
      opened.findFileEntry(data.entries[1]!.id),
    ])
    expect(results[0]).toEqual({ status: "fulfilled", value: data.entries[0] })
    expect(results[1]).toMatchObject({ status: "rejected" })
  } finally {
    await opened.close()
  }
})

it("flushes accepted lookups before close and rejects new requests without a scan", async () => {
  const { opened, entries } = await fixture()
  const spy = scanSpy()
  const settles = [0, 0]
  const first = opened.findFileEntry(entries[0]!.id).finally(() => {
    settles[0]! += 1
  })
  const second = opened.findFileEntry(entries[1]!.id).finally(() => {
    settles[1]! += 1
  })
  const close = opened.close()
  await expect(opened.findFileEntry(entries[2]!.id)).rejects.toMatchObject({
    code: "closed",
  })
  expect(await Promise.all([first, second])).toEqual(entries.slice(0, 2))
  await Promise.all([close, opened.close()])
  expect(settles).toEqual([1, 1])
  const count = spy.scans().length
  await expect(opened.findFileEntry(entries[3]!.id)).rejects.toMatchObject({
    code: "closed",
  })
  expect(spy.scans()).toHaveLength(count)
})

it("falls back per ID when a combined result reaches the adapter's resource limit", async () => {
  const { opened, entries } = await fixture()
  const original = NodeSqliteConnectionPort.prototype.query
  vi.spyOn(NodeSqliteConnectionPort.prototype, "query").mockImplementation(
    function (this: NodeSqliteConnectionPort, sql, bindings) {
      const result = original.call(this, sql, bindings)
      if (sql.includes("AS value") && result.rows.length > 1)
        throw new EidosAdapterError(
          "resource-limit",
          "Fixture combined response limit"
        )
      return result
    }
  )
  try {
    expect(
      await Promise.all(entries.map((entry) => opened.findFileEntry(entry.id)))
    ).toEqual(entries)
  } finally {
    await opened.close()
  }
})

it("bounds a batch to 64 IDs and settles every request across turns", async () => {
  const { opened } = await fixture()
  const spy = scanSpy()
  try {
    expect(
      await Promise.all(
        Array.from({ length: 65 }, () =>
          opened.findFileEntry(createEidosFileUuid())
        )
      )
    ).toEqual(Array.from({ length: 65 }, () => null))
    expect(spy.scans()).toHaveLength(2)
  } finally {
    await opened.close()
  }
})

it("keeps lookup queues separate for files with the same entry ID", async () => {
  const first = await fixture(),
    second = await fixture()
  const entry = { ...first.entries[0]!, name: "second-file.png" }
  replaceFixtureFileValue(
    second.file,
    second.table.table.id,
    second.field.id!,
    String(second.rows[0]!._id),
    encodeEidosFileValues([entry])
  )
  try {
    const old = first.opened.findFileEntry(entry.id)
    const close = first.opened.close()
    const other = second.opened.findFileEntry(entry.id)
    expect(await old).toEqual(first.entries[0])
    expect(await other).toEqual(entry)
    await close
  } finally {
    await first.opened.close()
    await second.opened.close()
  }
})

it("reads fresh native File facts after a rename on a physically readonly catalog", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "eidos-native-entry-batch-"))
  roots.push(root)
  await mkdir(path.join(root, ".eidos"))
  await writeFile(path.join(root, "one.png"), "fixture")
  const file = path.join(root, ".eidos/files.eidos")
  const created = await createEidosLiteFileRuntime(file, "Files")
  await created.close()
  const opened = await openEidosLiteFileRuntime(file, { readOnly: true })
  const table = opened.initialSnapshot.tables[0]!,
    field = table.fields.find((value) => value.type === "file")!
  try {
    const before = await opened.source.getPage(
      table.table.id,
      0,
      100,
      {},
      table.rowCount
    )
    const old = decodeEidosFileValues(
      String(before.rows[0]![field.tableColumnName])
    )[0]!
    await rename(path.join(root, "one.png"), path.join(root, "renamed.png"))
    const after = await opened.source.getPage(
      table.table.id,
      0,
      100,
      {},
      table.rowCount
    )
    const current = decodeEidosFileValues(
      String(after.rows[0]![field.tableColumnName])
    )[0]!
    expect(current.name).toBe("renamed.png")
    expect(
      await Promise.all([
        opened.findFileEntry(old.id),
        opened.findFileEntry(current.id),
      ])
    ).toEqual([old.id === current.id ? current : null, current])
  } finally {
    await opened.close()
  }
})
