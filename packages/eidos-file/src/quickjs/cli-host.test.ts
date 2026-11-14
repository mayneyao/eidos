import { DatabaseSync } from "node:sqlite"
import { expect, it } from "vitest"
import { createNodeSqliteHostBridge } from "./node-host"

it("initializes the private CLI Table composition atomically at revision one", async () => {
  const database = new DatabaseSync(":memory:", {
    readBigInts: true,
    enableForeignKeyConstraints: true,
  })
  globalThis.__eidos_host = createNodeSqliteHostBridge(database)
  await import("../quickjs-entry")
  const wire = globalThis.__eidos_runtime
  const change = {
    kind: "create-table",
    clientKey: "initial-table",
    name: "Checks",
    position: "0",
    labelFieldClientKey: "title",
    fields: [
      { clientKey: "title", name: "Title", kind: "text", position: "0" },
      { clientKey: "flag", name: "Flag", kind: "checkbox", position: "1" },
    ],
  }
  try {
    expect(
      JSON.parse(await wire.open(JSON.stringify({ mode: "create" })))
    ).toMatchObject({ ok: true })
    // A failure after the SQL table was created must roll back the whole composition.
    const invalid = { ...change, labelFieldClientKey: "missing" }
    expect(
      JSON.parse(await wire.initializeCliTable(JSON.stringify(invalid)))
    ).toMatchObject({ ok: false })
    expect(
      database
        .prepare("SELECT revision, default_table_id FROM eidos__meta")
        .get()
    ).toMatchObject({ revision: 0n, default_table_id: null })
    expect(
      database.prepare("SELECT count(*) AS n FROM eidos__tables").get()
    ).toMatchObject({ n: 0n })
    expect(
      database
        .prepare("SELECT name FROM sqlite_schema WHERE name='Checks'")
        .get()
    ).toBeUndefined()
    const initialized = JSON.parse(
      await wire.initializeCliTable(JSON.stringify(change))
    )
    expect(initialized).toMatchObject({
      ok: true,
      value: { schema: { revision: "1", changed: true } },
    })
    expect(
      database
        .prepare("SELECT revision, default_table_id FROM eidos__meta")
        .get()
    ).toMatchObject({
      revision: 1n,
      default_table_id: initialized.value.tableId,
    })
    const view = database
      .prepare(
        "SELECT id, table_id, name, type, created_at, updated_at FROM eidos__views"
      )
      .get()
    expect(view).toMatchObject({
      id: initialized.value.viewId,
      table_id: initialized.value.tableId,
      name: "Grid",
      type: "grid",
    })
    expect(
      database.prepare("SELECT created_at, updated_at FROM eidos__tables").get()
    ).toMatchObject({
      created_at: view!.created_at,
      updated_at: view!.updated_at,
    })
    expect(
      database.prepare("SELECT updated_at FROM eidos__meta").get()
    ).toMatchObject({ updated_at: view!.updated_at })
    expect(
      database
        .prepare("PRAGMA table_info('Checks')")
        .all()
        .find((column) => column.name === "Flag")
    ).toMatchObject({ type: "INTEGER", notnull: 1n, dflt_value: "0" })
    expect(
      JSON.parse(await wire.initializeCliTable(JSON.stringify(change)))
    ).toMatchObject({ ok: false })
    expect(
      database.prepare("SELECT revision FROM eidos__meta").get()
    ).toMatchObject({ revision: 1n })
    expect(
      JSON.parse(
        await wire.cliConversionDefaults(
          JSON.stringify({ from: "text", to: "checkbox", sourceNullable: true })
        )
      )
    ).toMatchObject({
      ok: true,
      value: { toNullable: false, policies: ["null-to-false"] },
    })
    expect(
      JSON.parse(
        await wire.cliConversionDefaults(
          JSON.stringify({
            from: "text",
            to: "checkbox",
            sourceNullable: true,
            policies: [],
          })
        )
      )
    ).toMatchObject({ ok: true, value: { toNullable: false, policies: [] } })
  } finally {
    await wire.close()
    database.close()
  }
})
