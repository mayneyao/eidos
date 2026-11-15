import { expect } from "vitest"
import type { ConnectionPort } from "./adapter-contract"
import { ConnectionPortEidosFileConnection } from "./connection-port"
import { EidosFileRuntime } from "./runtime"
import { Runtime } from "./runtime-service"
import type { RuntimeEnvironment, SchemaChange } from "./runtime-contract"
import { importEidosFileCsv, prepareEidosFileCsvImport } from "./csv"

/** Run independently on WASM, better-sqlite3 and Electron's node:sqlite. */
export async function expectCheckboxBinaryConformance(
  connection: ConnectionPort
) {
  const environment: RuntimeEnvironment = {
    clock: {
      nowInstant: () => "2026-11-15T00:00:00.000Z",
      nowMilliseconds: () => performance.now(),
    },
    entropy: {
      randomBytes: (length) => crypto.getRandomValues(new Uint8Array(length)),
    },
  }
  let sequence = 0
  const context = () => ({ requestId: `binary-${++sequence}` })
  const factory = {
    cancellation: { cancelled: () => false, onCancel: () => () => undefined },
  }
  let { service } = await Runtime.create(
    connection,
    environment,
    { title: "Binary Checkbox" },
    factory
  )
  const sql = new ConnectionPortEidosFileConnection(connection)
  const core = new EidosFileRuntime(sql)
  let revision = "0"
  const schema = async (change: SchemaChange) => {
    const plan = await service.preflightSchema(
      { expectedRevision: revision, change },
      context()
    )
    expect(plan.classification).not.toBe("forbidden")
    const result = await service.mutateSchema(
      {
        expectedRevision: revision,
        planToken: plan.planToken,
        actionsHash: plan.actionsHash,
      },
      context()
    )
    revision = result.revision
    return result
  }
  try {
    const created = await schema({
      kind: "create-table",
      clientKey: "table",
      name: "Binary",
      position: "0",
      labelFieldClientKey: "title",
      fields: [
        { clientKey: "title", name: "Title", kind: "text", position: "0" },
        { clientKey: "flag", name: "Flag", kind: "checkbox", position: "1" },
        {
          clientKey: "nullable",
          name: "Legacy",
          kind: "checkbox",
          nullable: true,
          position: "2",
        },
      ],
    })
    const id = (key: string) =>
      created.createdObjects.find(
        (object) => "clientKey" in object && object.clientKey === key
      )!.id
    const tableId = id("table"),
      flagId = id("flag"),
      titleId = id("title"),
      legacyId = id("nullable")
    expect(
      core.listFields(tableId).find((field) => field.id === flagId)?.nullable
    ).toBe(false)
    expect(sql.query('PRAGMA table_xinfo("Binary")')).toContainEqual(
      expect.objectContaining({ name: "Flag", notnull: 1, dflt_value: "0" })
    )
    const rows = await service.mutateRows(
      {
        tableId,
        expectedRevision: revision,
        changes: [
          {
            kind: "create",
            clientKey: "omitted",
            values: { [titleId]: "omitted", [legacyId]: null },
          },
          {
            kind: "create",
            clientKey: "false",
            values: { [titleId]: "false", [flagId]: false },
          },
          {
            kind: "create",
            clientKey: "true",
            values: { [titleId]: "true", [flagId]: true },
          },
        ],
        returning: { fields: [flagId, legacyId], resolveRelations: [] },
      },
      context()
    )
    revision = rows.revision
    expect(rows.returnedRows!.rows.map((row) => row.values)).toEqual([
      [false, null],
      [false, false],
      [true, false],
    ])
    const added = await schema({
      kind: "create-field",
      tableId,
      field: {
        clientKey: "added",
        name: "Added",
        kind: "checkbox",
        position: "3",
      },
    })
    const addedId = added.createdObjects.find(
      (object) => "clientKey" in object && object.clientKey === "added"
    )!.id
    expect(
      core.listFields(tableId).find((field) => field.id === addedId)?.nullable
    ).toBe(false)
    expect(sql.query('PRAGMA table_xinfo("Binary")')).toContainEqual(
      expect.objectContaining({ name: "Added", notnull: 1, dflt_value: "0" })
    )
    expect(
      core.queryRows(tableId).rows.map((row) => row.fields[addedId])
    ).toEqual([false, false, false])
    const rowId = rows.created.find((row) => row.clientKey === "true")!.rowId
    await expect(
      service.mutateRows(
        {
          tableId,
          expectedRevision: revision,
          changes: [
            { kind: "update", rowId, values: { [flagId]: false } },
            {
              kind: "create",
              clientKey: "invalid",
              values: { [addedId]: null },
            },
          ],
        },
        context()
      )
    ).rejects.toMatchObject({ code: "constraint" })
    expect(String(core.info().revision)).toBe(revision)
    expect(Number(core.getRow(tableId, rowId)!.Flag)).toBe(1)
    expect(core.countRows(tableId)).toBe(3)
    await expect(
      service.importCsv!(
        {
          tableId,
          expectedRevision: revision,
          hasHeader: true,
          columns: [{ csvIndex: 0, fieldId: flagId }],
          csv: new TextEncoder().encode('Flag\ntrue\n""\n'),
        },
        context()
      )
    ).rejects.toMatchObject({ code: "constraint" })
    expect(String(core.info().revision)).toBe(revision)
    expect(core.countRows(tableId)).toBe(3)
    expect(() => core.updateRow(tableId, rowId, { Flag: null })).toThrow()
    expect(() =>
      sql.run('UPDATE "Binary" SET "Flag" = NULL WHERE "_id" = ?', [rowId])
    ).toThrow()
    expect(String(core.info().revision)).toBe(revision)
    // Direct embedding APIs use the same default and physical constraint.
    const direct = core.createTable({
      name: "CoreBinary",
      fields: [{ name: "Flag", type: "checkbox" }],
    })
    expect(
      core.listFields(direct.id).find((field) => field.name === "Flag")
        ?.nullable
    ).toBe(false)
    core.insertRow(direct.id, {})
    const directAdded = core.addField(direct.id, {
      name: "Added",
      type: "checkbox",
    })
    expect(directAdded.nullable).toBe(false)
    expect(() =>
      core.insertImportedRows(direct.id, [{ Flag: false }, { Flag: null }])
    ).toThrow()
    expect(core.countRows(direct.id)).toBe(1)
    const csv = {
      name: "Imported.csv",
      content:
        'Title,Flag,Text\ntrue,true,"comma, quote ""x"""\nblank,,\nfalse,false,"two\nlines"\n',
    }
    const prepared = prepareEidosFileCsvImport(csv)
    expect(prepared.plan.sampleRows.map((row) => row[1])).toEqual([
      "true",
      "false",
      "false",
    ])
    const imported = importEidosFileCsv(core, csv)
    expect(
      core.listFields(imported.table.id).find((field) => field.name === "Flag")
        ?.nullable
    ).toBe(false)
    expect(sql.query('PRAGMA table_xinfo("Imported")')).toContainEqual(
      expect.objectContaining({ name: "Flag", notnull: 1, dflt_value: "0" })
    )
    expect(
      core
        .getRowPage(imported.table.id, 0, 100)
        .rows.map((row) => Number(row.Flag))
    ).toEqual([1, 0, 0])
    expect(csv.content).toContain("blank,,")
    revision = String(core.info().revision)
    await service.close(context())
    ;({ service } = await Runtime.open(
      connection,
      environment,
      "readwrite",
      factory
    ))
    const reopened = await service.getRowsById(
      {
        tableId,
        rowIds: [rowId],
        projection: {
          fields: [flagId, addedId, legacyId],
          resolveRelations: [],
        },
      },
      context()
    )
    expect(reopened.revision).toBe(revision)
    expect(reopened.rows[0]!.values).toEqual([true, false, false])
    const nulls = await service.queryRows(
      {
        tableId,
        query: { filter: { op: "is-null", fieldId: legacyId } },
        projection: { fields: [legacyId], resolveRelations: [] },
        limit: 100,
        direction: "forward",
      },
      context()
    )
    expect(nulls.rows.map((row) => row.values)).toEqual([[null]])
    expect(core.validate({ level: "full" }).valid).toBe(true)
  } finally {
    await service.close(context())
  }
}
