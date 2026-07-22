import { expect } from "vitest"

import type { ConnectionPort, SqlValue } from "./adapter-contract"

const publicationContext = {
  cancellation: {
    cancelled: () => false,
    onCancel: () => () => undefined,
  },
  deadlineMilliseconds: 30_000,
}

/** Shared EA-Connection-1.0 transcript for Browser and Desktop bindings. */
export async function expectConnectionPortConformance(
  connection: ConnectionPort
): Promise<void> {
  expect(connection.capabilities()).toMatchObject({
    adapterVersion: "1.0",
    json1: true,
    returning: true,
    strict: true,
    int64: true,
    scalarFunctions: true,
    snapshot: true,
  })

  const tagged = connection.get(
    "SELECT ?1 AS minimum, ?2 AS maximum, ?3 AS real_value, " +
      "?4 AS text_value, ?5 AS blob_value, NULL AS null_value",
    [
      { tag: "integer", value: "-9223372036854775808" },
      { tag: "integer", value: "9223372036854775807" },
      { tag: "real", value: 1.5 },
      { tag: "text", value: "text" },
      { tag: "blob", value: new Uint8Array([0, 1, 255]) },
    ]
  )
  expect(tagged.row).toEqual([
    { tag: "integer", value: "-9223372036854775808" },
    { tag: "integer", value: "9223372036854775807" },
    { tag: "real", value: 1.5 },
    { tag: "text", value: "text" },
    { tag: "blob", value: new Uint8Array([0, 1, 255]) },
    { tag: "null" },
  ])
  expect(() => connection.get("SELECT ?1", [])).toThrow(/requires 1 bindings/)
  expect(() =>
    connection.get("SELECT ?1, ?1", [{ tag: "integer", value: "1" }])
  ).toThrow(/exactly once/)
  expect(() =>
    connection.get("SELECT :named", [{ tag: "integer", value: "1" }])
  ).toThrow(/named SQL parameters/)

  connection.registerScalar(
    {
      name: "eidos_adapter_conformance_second",
      arity: 2,
      deterministic: true,
      directOnly: true,
    },
    (_first, second) => second ?? ({ tag: "null" } satisfies SqlValue)
  )
  expect(
    connection.get("SELECT eidos_adapter_conformance_second(1, 2)").row
  ).toEqual([{ tag: "integer", value: "2" }])
  expect(() =>
    connection.get("SELECT eidos_adapter_conformance_second(1)")
  ).toThrow()

  connection.transaction("read", () => {
    expect(() =>
      connection.execSchema("CREATE TEMP TABLE forbidden(value TEXT)")
    ).toThrow(/read transaction|read-only/)
    expect(() => connection.transaction("write", () => undefined)).toThrow(
      /read transaction|read-only|escalate/
    )
  })

  connection.transaction("write", () => {
    connection.execSchema(
      "CREATE TEMP TABLE eidos_adapter_conformance(value INTEGER NOT NULL) STRICT"
    )
    connection.runMany(
      "INSERT INTO eidos_adapter_conformance(value) VALUES (?1)",
      [[{ tag: "integer", value: "1" }], [{ tag: "integer", value: "2" }]]
    )
    connection.transaction("read", () => {
      connection.run("INSERT INTO eidos_adapter_conformance(value) VALUES (3)")
    })
    expect(
      connection.get("SELECT sum(value) FROM eidos_adapter_conformance").row
    ).toEqual([{ tag: "integer", value: "6" }])
  })

  const snapshot = await connection.transaction("read", async () => {
    connection.get("SELECT count(*) FROM sqlite_schema")
    return connection.snapshot({
      ...publicationContext,
      maxBytes: "16777216",
    })
  })
  const header = await snapshot.bytes.read("0", 16, publicationContext)
  expect(new TextDecoder().decode(header)).toBe("SQLite format 3\u0000")
  await snapshot.release()
  await snapshot.release()
  await expect(
    snapshot.bytes.read("0", 1, publicationContext)
  ).rejects.toMatchObject({ code: "adapter-closed" })
}
