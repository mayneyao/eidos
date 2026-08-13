import { copyFile, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import { describe, expect, it } from "vitest"

import { expectConnectionPortConformance } from "./connection-port.conformance"
import {
  createEidosFile,
  mergeEidosSystemMetadataFiles,
  NodeSqliteConnectionPort,
  openEidosFile,
} from "./node-sqlite"
import { Runtime } from "./runtime-service"
import type { RuntimeEnvironment } from "./runtime-contract"

const sqliteFeatureProbe = new DatabaseSync(":memory:") as DatabaseSync & {
  serialize?: () => Uint8Array
  limits?: object
}
const supportsElectron43NodeSqlite =
  typeof sqliteFeatureProbe.serialize === "function" &&
  typeof sqliteFeatureProbe.limits === "object" &&
  typeof sqliteFeatureProbe.setAuthorizer === "function"
sqliteFeatureProbe.close()

const runtimeEnvironment = (): RuntimeEnvironment => ({
  clock: {
    nowInstant: () => "2026-07-31T00:00:00.000Z",
    nowMilliseconds: () => performance.now(),
  },
  entropy: {
    randomBytes: (length) => crypto.getRandomValues(new Uint8Array(length)),
  },
})

const runtimeFactoryContext = {
  cancellation: {
    cancelled: () => false,
    onCancel: () => () => undefined,
  },
}

const runtimeContext = (requestId: string) => ({
  requestId,
  deadlineMilliseconds: 30_000,
})

describe.runIf(supportsElectron43NodeSqlite)(
  "NodeSqliteConnectionPort EA-Connection-1.0",
  () => {
    it("passes the shared Browser/Desktop connection transcript", async () => {
      const connection = new NodeSqliteConnectionPort(
        new DatabaseSync(":memory:")
      )
      try {
        await expectConnectionPortConformance(connection)
        expect(connection.capabilities()).toMatchObject({
          sqliteVersion: "3.53.1",
          interrupt: false,
          defensiveMode: true,
        })
        expect(() => connection.interrupt()).toThrow(/terminate cancellation/)
      } finally {
        connection.close()
      }
    })

    it("maps SQLite failures and enforces result limits", () => {
      const database = new DatabaseSync(":memory:")
      const connection = new NodeSqliteConnectionPort(database, {
        maxResultRows: 1,
        maxResultBytes: 256,
      })
      try {
        connection.execSchema("CREATE TABLE records(value TEXT UNIQUE) STRICT")
        connection.run("INSERT INTO records(value) VALUES (?1)", [
          { tag: "text", value: "one" },
        ])
        expect(() =>
          connection.run("INSERT INTO records(value) VALUES (?1)", [
            { tag: "text", value: "one" },
          ])
        ).toThrowError(
          expect.objectContaining({
            code: "constraint",
            sqlitePrimaryCode: 19,
          })
        )
        connection.run("INSERT INTO records(value) VALUES (?1)", [
          { tag: "text", value: "two" },
        ])
        expect(() => connection.get("SELECT zeroblob(512)")).toThrowError(
          expect.objectContaining({ code: "resource-limit" })
        )
        expect(() =>
          connection.query("SELECT value FROM records")
        ).toThrowError(expect.objectContaining({ code: "resource-limit" }))
      } finally {
        connection.close()
      }
      expect(() => connection.capabilities()).toThrowError(
        expect.objectContaining({ code: "adapter-closed" })
      )

      const logicalReadonly = new NodeSqliteConnectionPort(
        new DatabaseSync(":memory:"),
        { readOnly: true }
      )
      try {
        expect(() =>
          logicalReadonly.run("PRAGMA query_only = OFF")
        ).toThrowError(expect.objectContaining({ code: "read-only" }))
        expect(() =>
          logicalReadonly.run("CREATE TABLE forbidden(value TEXT)")
        ).toThrowError(expect.objectContaining({ code: "read-only" }))
        expect(logicalReadonly.get("SELECT 1").row).toEqual([
          { tag: "integer", value: "1" },
        ])
      } finally {
        logicalReadonly.close()
      }
    })

    it("keeps the synchronous EidosFileRuntime compatibility surface native-free", async () => {
      const directory = await mkdtemp(path.join(tmpdir(), "eidos-node-sqlite-"))
      const filePath = path.join(directory, "compatibility.eidos")
      try {
        const created = createEidosFile(filePath, {
          title: "node:sqlite",
          defaultTable: {
            name: "Records",
            fields: [{ name: "Name", type: "text", isRecordLabel: true }],
          },
        })
        created.close()
        const opened = openEidosFile(filePath, { readonly: true })
        try {
          expect(opened.inspect()).toMatchObject({ valid: true })
          expect(opened.listTables()).toHaveLength(1)
        } finally {
          opened.close()
        }
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    })

    it("merges Graft snapshot files through the node:sqlite adapter", async () => {
      const directory = await mkdtemp(
        path.join(tmpdir(), "eidos-node-sqlite-system-merge-")
      )
      const basePath = path.join(directory, "base.sqlite")
      const oursPath = path.join(directory, "ours.sqlite")
      const theirsPath = path.join(directory, "theirs.sqlite")
      const resultPath = path.join(directory, "result.sqlite")
      const sourcePath = path.join(directory, "source.eidos")
      try {
        const created = createEidosFile(sourcePath, {
          title: "Base",
          createdAt: "2026-08-13T00:00:00.000Z",
        })
        created.close()
        await Promise.all([
          copyFile(sourcePath, basePath),
          copyFile(sourcePath, oursPath),
          copyFile(sourcePath, theirsPath),
        ])

        const ours = new DatabaseSync(oursPath)
        ours.exec(
          "UPDATE eidos__meta SET title='From Ours',revision=2,updated_at='2026-08-13T00:01:00.000Z' WHERE singleton=1"
        )
        ours.close()
        const theirs = new DatabaseSync(theirsPath)
        theirs.exec(
          "UPDATE eidos__meta SET title='From Theirs',revision=5,updated_at='2026-08-13T00:02:00.000Z' WHERE singleton=1"
        )
        theirs.close()
        await copyFile(oursPath, resultPath)

        const outcome = mergeEidosSystemMetadataFiles({
          basePath,
          oursPath,
          theirsPath,
          resultPath,
          oursKey: "commit-a",
          theirsKey: "commit-b",
          operationInstant: "2026-08-13T23:59:00.000Z",
        })
        expect(outcome.outcome).toBe("merged")

        const result = new DatabaseSync(resultPath)
        try {
          expect(
            result
              .prepare(
                "SELECT title,revision,updated_at FROM eidos__meta WHERE singleton=1"
              )
              .get()
          ).toEqual({
            title: "From Theirs",
            revision: 6,
            updated_at: "2026-08-13T23:59:00.000Z",
          })
        } finally {
          result.close()
        }
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    })

    it("opens a Runtime 1.0 binding over a read-only database", async () => {
      const directory = await mkdtemp(
        path.join(tmpdir(), "eidos-node-sqlite-readonly-")
      )
      const filePath = path.join(directory, "readonly.eidos")
      try {
        const writable = new NodeSqliteConnectionPort(
          new DatabaseSync(filePath)
        )
        const created = await Runtime.create(
          writable,
          runtimeEnvironment(),
          { title: "Read-only" },
          runtimeFactoryContext
        )
        await created.service.close(runtimeContext("close-created"))
        writable.close()

        const readonly = new NodeSqliteConnectionPort(
          new DatabaseSync(filePath, { readOnly: true }),
          { readOnly: true }
        )
        try {
          const opened = await Runtime.open(
            readonly,
            runtimeEnvironment(),
            "read",
            runtimeFactoryContext
          )
          await expect(
            opened.service.negotiate(
              { protocol: "eidos-runtime", versions: ["1.0"] },
              runtimeContext("negotiate-readonly")
            )
          ).resolves.toMatchObject({
            version: "1.0",
            capabilities: {
              readRows: true,
              mutateRows: false,
              csvImport: false,
            },
          })
          expect(opened.service.importCsv).toBeUndefined()
          expect(() => readonly.transaction("write", () => undefined)).toThrow(
            /read-only/
          )
          await opened.service.close(runtimeContext("close-readonly"))
        } finally {
          readonly.close()
        }
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    })

    it("rejects a create missing a required Field before SQLite write", async () => {
      const connection = new NodeSqliteConnectionPort(
        new DatabaseSync(":memory:")
      )
      const binding = await Runtime.create(
        connection,
        runtimeEnvironment(),
        { title: "Required values" },
        runtimeFactoryContext
      )
      const runtime = binding.service
      try {
        const plan = await runtime.preflightSchema(
          {
            expectedRevision: "0",
            change: {
              kind: "create-table",
              clientKey: "tasks",
              name: "Tasks",
              position: "0",
              fields: [
                {
                  clientKey: "title",
                  name: "Title",
                  kind: "text",
                  nullable: false,
                  position: "0",
                },
                {
                  clientKey: "notes",
                  name: "Notes",
                  kind: "text",
                  position: "1",
                },
                {
                  clientKey: "tags",
                  name: "Tags",
                  kind: "multi-select",
                  position: "2",
                },
              ],
              labelFieldClientKey: "title",
            },
          },
          runtimeContext("required-schema-plan")
        )
        const schema = await runtime.mutateSchema(
          {
            expectedRevision: "0",
            planToken: plan.planToken,
            actionsHash: plan.actionsHash,
          },
          runtimeContext("required-schema-apply")
        )
        const id = (clientKey: string) =>
          schema.createdObjects.find(
            (entry) => "clientKey" in entry && entry.clientKey === clientKey
          )!.id
        const tableId = id("tasks")
        const titleId = id("title")
        const notesId = id("notes")
        const tagsId = id("tags")

        await expect(
          runtime.mutateRows(
            {
              tableId,
              expectedRevision: schema.revision,
              changes: [{ kind: "create", clientKey: "missing", values: {} }],
            },
            runtimeContext("missing-required-value")
          )
        ).rejects.toMatchObject({
          code: "invalid-value",
          fieldId: titleId,
        })
        expect(
          (await runtime.getSnapshot({}, runtimeContext("after-rejection")))
            .revision
        ).toBe(schema.revision)

        const inserted = await runtime.mutateRows(
          {
            tableId,
            expectedRevision: schema.revision,
            changes: [
              {
                kind: "create",
                clientKey: "complete",
                values: { [titleId]: "First" },
              },
            ],
          },
          runtimeContext("complete-required-value")
        )
        const rows = await runtime.getRowsById(
          {
            tableId,
            rowIds: [inserted.created[0]!.rowId],
            projection: {
              fields: [titleId, notesId, tagsId],
              resolveRelations: [],
            },
          },
          runtimeContext("created-default-values")
        )
        expect(rows.rows[0]!.values).toEqual(["First", null, []])
      } finally {
        await runtime.close(runtimeContext("close-required-values"))
        connection.close()
      }
    })
  }
)
