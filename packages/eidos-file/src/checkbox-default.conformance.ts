import { expect, vi } from "vitest"
import type { ConnectionPort } from "./adapter-contract"
import { ConnectionPortEidosFileConnection } from "./connection-port"
import { createEidosFileUuid } from "./identifiers"
import { EidosFileRuntime } from "./runtime"
import type {
  FilterNode,
  RuntimeEnvironment,
  SchemaChange,
} from "./runtime-contract"
import { Runtime } from "./runtime-service"

/** The same semantic transcript runs independently against each SQLite adapter. */
export async function expectCheckboxDefaultConformance(
  connection: ConnectionPort,
  legacyColumns = false
): Promise<void> {
  const now = "2026-11-12T12:00:00.000Z"
  let entropy = 0
  let sequence = 0
  const context = () => ({
    requestId: `checkbox-${++sequence}`,
    deadlineMilliseconds: 30_000,
  })
  const environment: RuntimeEnvironment = {
    clock: { nowInstant: () => now, nowMilliseconds: () => performance.now() },
    entropy: {
      randomBytes: (length) =>
        Uint8Array.from({ length }, () => entropy++ & 255),
    },
  }
  const { service } = await Runtime.create(
    connection,
    environment,
    { title: "Checkbox defaults" },
    {
      cancellation: { cancelled: () => false, onCancel: () => () => undefined },
    }
  )
  let revision = "0"
  async function schema(change: SchemaChange) {
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
  const sql = new ConnectionPortEidosFileConnection(connection)
  try {
    // Deliberately construct an older physical schema, without changing its
    // values, to prove that Runtime does not rely solely on new column defaults.
    const executeSchema = connection.execSchema.bind(connection)
    const legacy = legacyColumns
      ? vi
          .spyOn(connection, "execSchema")
          .mockImplementation((statement) =>
            executeSchema(
              statement.includes('CREATE TABLE "Checks"')
                ? statement.replaceAll(" DEFAULT 0", "")
                : statement
            )
          )
      : undefined
    let created: Awaited<ReturnType<typeof schema>>
    try {
      created = await schema({
        kind: "create-table",
        clientKey: "checks",
        name: "Checks",
        position: "0",
        labelFieldClientKey: "title",
        fields: [
          { clientKey: "title", name: "Title", kind: "text", position: "0" },
          {
            clientKey: "flag",
            name: "Flag",
            kind: "checkbox",
            nullable: true,
            position: "1",
          },
          {
            clientKey: "required",
            name: "Required",
            kind: "checkbox",
            nullable: false,
            position: "2",
          },
        ],
      })
    } finally {
      legacy?.mockRestore()
    }
    const id = (key: string) =>
      created.createdObjects.find(
        (object) => "clientKey" in object && object.clientKey === key
      )!.id
    const tableId = id("checks")
    const titleId = id("title")
    const flagId = id("flag")
    const requiredId = id("required")
    const physical = sql.query<{ name: string; dflt_value: string | null }>(
      'PRAGMA table_xinfo("Checks")'
    )
    expect(physical.find((column) => column.name === "Flag")!.dflt_value).toBe(
      legacyColumns ? null : "0"
    )
    expect(
      physical.find((column) => column.name === "Required")!.dflt_value
    ).toBe(legacyColumns ? null : "0")
    const rows = await service.mutateRows(
      {
        tableId,
        expectedRevision: revision,
        changes: [
          {
            kind: "create",
            clientKey: "omitted",
            values: { [titleId]: "omitted" },
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
          {
            kind: "create",
            clientKey: "null",
            values: { [titleId]: "null", [flagId]: null },
          },
        ],
        returning: {
          fields: [titleId, flagId, requiredId],
          resolveRelations: [],
        },
      },
      context()
    )
    revision = rows.revision
    expect(rows.returnedRows!.rows.map((row) => row.values)).toEqual([
      ["omitted", false, false],
      ["false", false, false],
      ["true", true, false],
      ["null", null, false],
    ])
    for (const key of ["true", "null"]) {
      const update = await service.mutateRows(
        {
          tableId,
          expectedRevision: revision,
          changes: [
            {
              kind: "update",
              rowId: rows.created.find((row) => row.clientKey === key)!.rowId,
              values: { [titleId]: `${key}-updated` },
            },
          ],
          returning: { fields: [flagId], resolveRelations: [] },
        },
        context()
      )
      revision = update.revision
      expect(update.returnedRows!.rows[0]!.values).toEqual([
        key === "true" ? true : null,
      ])
    }
    const query = async (filter?: FilterNode) =>
      service.queryRows(
        {
          tableId,
          query: filter ? { filter } : {},
          projection: { fields: [titleId, flagId], resolveRelations: [] },
          limit: 100,
          direction: "forward",
        },
        context()
      )
    expect(
      (await query({ op: "eq", fieldId: flagId, value: false })).rows.map(
        (row) => row.values[0]
      )
    ).toEqual(["omitted", "false"])
    expect(
      (await query({ op: "is-null", fieldId: flagId })).rows.map(
        (row) => row.values[0]
      )
    ).toEqual(["null-updated"])
    expect(
      (await query({ op: "ne", fieldId: flagId, value: true })).rows.map(
        (row) => row.values[0]
      )
    ).toEqual(["omitted", "false", "null-updated"])
    const added = await schema({
      kind: "create-field",
      tableId,
      field: {
        clientKey: "added",
        name: "Added",
        kind: "checkbox",
        nullable: false,
        position: "3",
      },
    })
    const addedId = added.createdObjects.find(
      (object) => "clientKey" in object && object.clientKey === "added"
    )!.id
    const addedRows = await service.queryRows(
      {
        tableId,
        query: {},
        projection: { fields: [flagId, addedId], resolveRelations: [] },
        limit: 100,
        direction: "forward",
      },
      context()
    )
    expect(addedRows.rows.map((row) => row.values)).toEqual([
      [false, false],
      [false, false],
      [true, false],
      [null, false],
    ])
    await expect(
      service.mutateRows(
        {
          tableId,
          expectedRevision: revision,
          changes: [
            {
              kind: "create",
              clientKey: "invalid-null",
              values: { [requiredId]: null },
            },
          ],
        },
        context()
      )
    ).rejects.toMatchObject({ code: "constraint" })
    const imported = await service.importCsv!(
      {
        tableId,
        expectedRevision: revision,
        hasHeader: true,
        columns: [
          { csvIndex: 0, fieldId: titleId },
          { csvIndex: 1, fieldId: flagId },
        ],
        csv: new TextEncoder().encode(
          "Title,Flag\nCSV null,\nCSV false,false\nCSV true,true\n"
        ),
      },
      context()
    )
    revision = imported.revision
    const importedRows = await service.getRowsById(
      {
        tableId,
        rowIds: imported.createdRows.map((row) => row.rowId),
        projection: {
          fields: [flagId, requiredId, addedId],
          resolveRelations: [],
        },
      },
      context()
    )
    expect(importedRows.rows.map((row) => row.values)).toEqual([
      [null, false, false],
      [false, false, false],
      [true, false, false],
    ])

    const savedViews = await service.mutateView(
      {
        expectedRevision: revision,
        changes: [
          {
            kind: "create-view",
            clientKey: "unchecked",
            tableId,
            name: "Unchecked",
            type: "grid",
            position: "1",
            layout: {},
            query: { filter: { op: "eq", fieldId: flagId, value: false } },
          },
          {
            kind: "create-view",
            clientKey: "empty",
            tableId,
            name: "Empty",
            type: "grid",
            position: "2",
            layout: {},
            query: { filter: { op: "is-null", fieldId: flagId } },
          },
        ],
      },
      context()
    )
    revision = savedViews.revision
    const uncheckedViewId = savedViews.createdViews.find(
      (view) => view.clientKey === "unchecked"
    )!.viewId
    const blockedConversion = await service.preflightSchema(
      {
        expectedRevision: revision,
        change: {
          kind: "convert-field",
          fieldId: flagId,
          to: "text",
          toNullable: true,
        },
      },
      context()
    )
    expect(blockedConversion.classification).toBe("forbidden")
    expect(blockedConversion.dependencies).toContainEqual({
      object: "view",
      id: uncheckedViewId,
    })
    expect(blockedConversion.warnings).toContainEqual(
      expect.objectContaining({
        code: "dependency-blocked",
        fieldId: flagId,
        viewId: uncheckedViewId,
        message: expect.stringContaining("Unchecked"),
      })
    )
    await expect(
      service.mutateSchema(
        {
          expectedRevision: revision,
          planToken: blockedConversion.planToken,
          actionsHash: blockedConversion.actionsHash,
        },
        context()
      )
    ).rejects.toMatchObject({ code: "forbidden" })
    expect((await query()).revision).toBe(revision)
    expect((await query()).rows[0]!.values[1]).toBe(false)

    // Removing only the incompatible predicate allows conversion. The other
    // View's null predicate stays valid across both type changes.
    const clearedView = await service.mutateView(
      {
        expectedRevision: revision,
        changes: [
          {
            kind: "update-view",
            viewId: uncheckedViewId,
            patch: { query: {} },
          },
        ],
      },
      context()
    )
    revision = clearedView.revision
    await schema({
      kind: "convert-field",
      fieldId: flagId,
      to: "text",
      toNullable: true,
    })
    expect((await query()).rows[0]!.values[1]).toBe("false")
    const textToNumber = await service.preflightSchema(
      {
        expectedRevision: revision,
        change: {
          kind: "convert-field",
          fieldId: flagId,
          to: "number",
          toNullable: true,
        },
      },
      context()
    )
    expect(textToNumber.classification).toBe("forbidden")
    expect((await query()).revision).toBe(revision)
    await schema({
      kind: "convert-field",
      fieldId: flagId,
      to: "checkbox",
      toNullable: true,
    })

    // These are trusted embedding/import APIs, separate from RuntimeClient.
    const core = new EidosFileRuntime(sql)
    const ordinary = core.insertRow(tableId, { Title: "core omitted" })
    expect(Number(ordinary.Flag)).toBe(0)
    const replayed = core.insertImportedRows(tableId, [
      { Title: "bulk omitted" },
      { Title: "bulk null", Flag: null },
      { Title: "bulk false", Flag: false },
      { Title: "bulk true", Flag: true },
    ])
    expect(
      replayed.map((row) => (row.Flag === null ? null : Number(row.Flag)))
    ).toEqual([0, null, 0, 1])
    core.updateRow(tableId, String(replayed[3]!._id), {
      Title: "bulk true updated",
    })
    expect(Number(core.getRow(tableId, String(replayed[3]!._id))!.Flag)).toBe(1)
    expect(
      core.insertImportedRow(tableId, { Title: "single omitted" }).Flag
    ).not.toBeNull()
    expect(core.validate({ level: "full" }).valid).toBe(true)

    // Physical SQLite fixture probe: omit Flag in SQL itself, after all public
    // API checks. This proves DEFAULT 0 rather than a JavaScript substitute.
    const rawId = createEidosFileUuid()
    connection.transaction("write", () =>
      connection.run(
        'INSERT INTO "Checks" ("_id", "_created_at", "_updated_at", "Title", "Required") VALUES (?1, ?2, ?3, ?4, ?5)',
        [
          { tag: "text", value: rawId },
          { tag: "text", value: now },
          { tag: "text", value: now },
          { tag: "text", value: "physical default" },
          { tag: "integer", value: "0" },
        ]
      )
    )
    const physicalRow = sql.get<{ Flag: number | bigint | null }>(
      'SELECT "Flag" FROM "Checks" WHERE "_id" = ?',
      [rawId]
    )!
    // Conversion back to Checkbox rebuilt even a legacy column with DEFAULT 0.
    expect(physicalRow.Flag === null ? null : Number(physicalRow.Flag)).toBe(0)
    core.setFieldNullable(requiredId, true)
    expect(core.getRow(tableId, String(replayed[1]!._id))!.Flag).toBeNull()
    expect(
      sql
        .query<{ name: string; dflt_value: string | null }>(
          'PRAGMA table_xinfo("Checks")'
        )
        .find((column) => column.name === "Flag")!.dflt_value
    ).toBe("0")

    // Inject an invalid physical default to prove schema validation rejects it
    // and the canonical mutation rolls back the invalid table.
    const invalidDefault = vi
      .spyOn(connection, "execSchema")
      .mockImplementation((statement) =>
        executeSchema(
          statement.includes('CREATE TABLE "InvalidCheckboxDefault"')
            ? statement.replaceAll(" DEFAULT 0", " DEFAULT 1")
            : statement
        )
      )
    try {
      expect(() =>
        core.createTable({
          name: "InvalidCheckboxDefault",
          fields: [{ name: "Flag", type: "checkbox", isRecordLabel: true }],
        })
      ).toThrow(
        "Checkbox Field Flag must omit its legacy default or use DEFAULT 0"
      )
    } finally {
      invalidDefault.mockRestore()
    }
    expect(core.validate({ level: "structural" }).valid).toBe(true)
  } finally {
    await service.close(context())
  }
}
