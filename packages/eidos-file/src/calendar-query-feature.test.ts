import { readFileSync } from "node:fs"
import Database from "better-sqlite3"
import { expect, it } from "vitest"
import fixture from "../test-fixtures/date-queries-v1.json"
import { BetterSqlite3ConnectionPort } from "./better-sqlite3"
import { Runtime } from "./runtime-service"

let sequence = 0
const context = () => ({ requestId: `feature-${sequence++}` })
const environment = {
  clock: {
    nowInstant: () => "2026-11-12T12:30:00.000Z",
    nowMilliseconds: () => sequence++,
  },
  entropy: {
    randomBytes: (length: number) =>
      Uint8Array.from({ length }, () => sequence++ & 255),
  },
}
const cancellation = { cancelled: () => false, onCancel: () => () => {} }
async function markedBytes(restore = false) {
  const db = new Database(
    readFileSync(
      new URL("../test-fixtures/date-queries-v1.eidos", import.meta.url)
    )
  )
  const port = new BetterSqlite3ConnectionPort(db)
  const runtime = (
    await Runtime.open(port, environment, "readwrite", { cancellation })
  ).service
  const upgraded = await runtime.mutateView(
    {
      expectedRevision: fixture.revision,
      changes: [
        { kind: "upgrade-date-query", viewId: fixture.views[0]!.viewId },
      ],
    },
    context()
  )
  if (restore)
    await runtime.mutateView(
      {
        expectedRevision: upgraded.revision,
        changes: [
          { kind: "restore-date-query", viewId: fixture.views[0]!.viewId },
        ],
      },
      context()
    )
  await runtime.close(context())
  const bytes = db.serialize()
  port.close()
  return bytes
}

it("explicit restoration installs the feature even when the original query is already present", async () => {
  const db = new Database(await markedBytes(true))
  // Construct a legacy recovery fixture; ordinary writers never remove this row.
  db.exec("DELETE FROM eidos__features")
  const port = new BetterSqlite3ConnectionPort(db)
  const runtime = (
    await Runtime.open(port, environment, "readwrite", { cancellation })
  ).service
  try {
    const before = await runtime.getSnapshot({}, context())
    const result = await runtime.mutateView(
      {
        expectedRevision: before.revision,
        changes: [
          { kind: "restore-date-query", viewId: fixture.views[0]!.viewId },
        ],
      },
      context()
    )
    expect(result.changed).toBe(true)
    expect(BigInt(result.revision)).toBe(BigInt(before.revision) + 1n)
    expect(
      (await runtime.getSnapshot({}, context())).schemaCounts.features
    ).toBe("1")
    const retry = await runtime.mutateView(
      {
        expectedRevision: result.revision,
        changes: [
          { kind: "restore-date-query", viewId: fixture.views[0]!.viewId },
        ],
      },
      context()
    )
    expect(retry.changed).toBe(false)
    expect(retry.revision).toBe(result.revision)
  } finally {
    await runtime.close(context())
    port.close()
  }
})

it("reopens the marked file and keeps ordinary tables usable", async () => {
  const db = new Database(await markedBytes())
  const port = new BetterSqlite3ConnectionPort(db)
  const runtime = (
    await Runtime.open(port, environment, "readwrite", { cancellation })
  ).service
  try {
    expect(
      (await runtime.getSnapshot({}, context())).schemaCounts.features
    ).toBe("1")
    expect(
      (
        await runtime.queryRows(
          {
            tableId: fixture.tableId,
            query: {},
            projection: { fields: [fixture.label], resolveRelations: [] },
            limit: 10,
          },
          context()
        )
      ).rows
    ).toHaveLength(4)
  } finally {
    await runtime.close(context())
    port.close()
  }
})

it.each([
  ["missing", "DELETE FROM eidos__features"],
  ["unknown version", "UPDATE eidos__features SET version='3'"],
  [
    "unsupported config",
    "UPDATE eidos__features SET config_json='{\"extra\":true}'",
  ],
  ["optional flag", "UPDATE eidos__features SET required=0"],
])(
  "rejects a constructed file with %s calendar declaration on read and readwrite open",
  async (_, sql) => {
    for (const access of ["read", "readwrite"] as const) {
      const db = new Database(await markedBytes())
      // Corruption fixtures only: production writers use Runtime transactions.
      db.exec(sql)
      const port = new BetterSqlite3ConnectionPort(db)
      try {
        await expect(
          Runtime.open(port, environment, access, { cancellation })
        ).rejects.toMatchObject({ code: "corrupt-file" })
      } finally {
        port.close()
      }
    }
  }
)

async function windowBytes() {
  const db = new Database(
    readFileSync(
      new URL("../test-fixtures/date-queries-v1.eidos", import.meta.url)
    )
  )
  const port = new BetterSqlite3ConnectionPort(db)
  const runtime = (
    await Runtime.open(port, environment, "readwrite", { cancellation })
  ).service
  await runtime.mutateView(
    {
      expectedRevision: fixture.revision,
      calendarQueryVersion: 2,
      calendarWindowVersion: 1,
      changes: [
        {
          kind: "create-view",
          clientKey: "window",
          tableId: fixture.tableId,
          name: "Past month",
          type: "grid",
          position: "99",
          layout: {},
          query: {
            filter: {
              op: "calendar-window",
              fieldId: fixture.date,
              direction: "past",
              count: 1,
              unit: "month",
            },
          },
        },
      ],
    },
    context()
  )
  await runtime.close(context())
  const bytes = db.serialize()
  port.close()
  return bytes
}

it.each([
  "DELETE FROM eidos__features WHERE name='eidos:calendar-window'",
  "DELETE FROM eidos__features WHERE name='eidos:calendar-query'",
  "UPDATE eidos__features SET version='2' WHERE name='eidos:calendar-window'",
  "UPDATE eidos__features SET required=0 WHERE name='eidos:calendar-window'",
  "UPDATE eidos__features SET config_json='{\"extra\":true}' WHERE name='eidos:calendar-window'",
])(
  "rejects an invalid window feature declaration in both access modes: %s",
  async (sql) => {
    for (const access of ["read", "readwrite"] as const) {
      const db = new Database(await windowBytes())
      // Deliberately corrupt a synthetic fixture; product writes only use Runtime.
      db.exec(sql)
      const port = new BetterSqlite3ConnectionPort(db)
      try {
        await expect(
          Runtime.open(port, environment, access, { cancellation })
        ).rejects.toMatchObject({ code: "corrupt-file" })
      } finally {
        port.close()
      }
    }
  }
)
