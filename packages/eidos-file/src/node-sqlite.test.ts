import { copyFile, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import { describe, expect, it, vi } from "vitest"

import { expectConnectionPortConformance } from "./connection-port.conformance"
import {
  createEidosFile,
  mergeEidosSystemMetadataFiles,
  NodeSqliteConnectionPort,
  openEidosFile,
} from "./node-sqlite"
import { EidosFileRuntime } from "./runtime"
import { Runtime } from "./runtime-service"
import type { EidosRuntimeService } from "./runtime-service"
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
        const sqliteVersion = connection.get("SELECT sqlite_version()").row?.[0]
        expect(sqliteVersion).toMatchObject({ tag: "text" })
        if (sqliteVersion?.tag !== "text") {
          throw new Error("sqlite_version() must return text")
        }
        expect(connection.capabilities()).toMatchObject({
          sqliteVersion: sqliteVersion.value,
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

    it("undoes and redoes a deletion with exact Relation detach state", async () => {
      const directory = await mkdtemp(
        path.join(tmpdir(), "eidos-node-sqlite-row-undo-")
      )
      const filePath = path.join(directory, "row-undo.eidos")
      const runtime = createEidosFile(filePath, {
        defaultTable: {
          name: "Teams",
          fields: [{ name: "Name", type: "text" }],
        },
      })
      try {
        const teams = runtime.schema()[0]!
        const alphaId = String(
          runtime.insertRow(teams.table.id, { Name: "Alpha" })._id
        )
        const betaId = String(
          runtime.insertRow(teams.table.id, { Name: "Beta" })._id
        )
        const projects = runtime.createTable({
          name: "Projects",
          fields: [
            { name: "Name", type: "text", isRecordLabel: true },
            {
              name: "Teams",
              type: "relation",
              property: {
                targetTableId: teams.table.id,
                direction: "forward",
                cardinality: "many",
                onDelete: "detach",
              },
            },
          ],
        })
        const projectId = String(
          runtime.insertRow(projects.id, {
            Name: "Sync",
            Teams: JSON.stringify([alphaId, betaId]),
          })._id
        )

        const deleted = runtime.deleteRowsReversible(teams.table.id, [alphaId])
        expect(deleted.rowCount).toBe(1)
        expect(runtime.getRow(teams.table.id, alphaId)).toBeNull()
        expect(runtime.getRow(projects.id, projectId)?.Teams).toBe(
          JSON.stringify([betaId])
        )

        const restored = runtime.revertRowMutation(deleted.undoToken!)
        expect(restored.rowCount).toBe(2)
        expect(runtime.getRow(teams.table.id, alphaId)?.Name).toBe("Alpha")
        expect(runtime.getRow(projects.id, projectId)?.Teams).toBe(
          JSON.stringify([alphaId, betaId])
        )

        const redone = runtime.revertRowMutation(restored.undoToken!)
        expect(redone.rowCount).toBe(1)
        expect(redone.undoToken).toBeTruthy()
        expect(runtime.getRow(teams.table.id, alphaId)).toBeNull()
        expect(runtime.getRow(projects.id, projectId)?.Teams).toBe(
          JSON.stringify([betaId])
        )
      } finally {
        runtime.close()
        await rm(directory, { recursive: true, force: true })
      }
    })

    it("invalidates deletion undo only after a successful schema mutation", async () => {
      const directory = await mkdtemp(
        path.join(tmpdir(), "eidos-node-sqlite-row-undo-schema-")
      )
      const filePath = path.join(directory, "row-undo-schema.eidos")
      const runtime = createEidosFile(filePath, {
        defaultTable: {
          name: "Tasks",
          fields: [{ name: "Name", type: "text" }],
        },
      })
      try {
        const table = runtime.schema()[0]!.table
        const rowId = String(runtime.insertRow(table.id, { Name: "One" })._id)
        const deleted = runtime.deleteRowsReversible(table.id, [rowId])

        expect(() =>
          runtime.addField(table.id, { name: "Name", type: "text" })
        ).toThrow(/Duplicate Field name/)
        expect(
          runtime.revertRowMutation(deleted.undoToken!).undoToken
        ).toBeTruthy()

        const deletedAgain = runtime.deleteRowsReversible(table.id, [rowId])
        runtime.addField(table.id, { name: "Notes", type: "text" })
        expect(() =>
          runtime.revertRowMutation(deletedAgain.undoToken!)
        ).toThrow(/can no longer be undone/)
      } finally {
        runtime.close()
        await rm(directory, { recursive: true, force: true })
      }
    })

    it("treats deletion ranges as half-open and restores exactly that range", async () => {
      const directory = await mkdtemp(
        path.join(tmpdir(), "eidos-node-sqlite-row-undo-range-")
      )
      const filePath = path.join(directory, "row-undo-range.eidos")
      const runtime = createEidosFile(filePath, {
        defaultTable: {
          name: "Tasks",
          fields: [{ name: "Name", type: "text" }],
        },
      })
      try {
        const table = runtime.schema()[0]!
        for (const name of ["One", "Two", "Three"]) {
          runtime.insertRow(table.table.id, { Name: name })
        }
        const firstId = String(
          runtime.getRowPage(table.table.id, 0, 1).rows[0]!._id
        )

        const deleted = runtime.deleteRowRangesReversible(table.table.id, [
          { startIndex: 0, endIndex: 1 },
        ])
        expect(deleted.deleted).toEqual([firstId])
        expect(runtime.countRows(table.table.id)).toBe(2)

        runtime.revertRowMutation(deleted.undoToken!)
        expect(runtime.countRows(table.table.id)).toBe(3)
      } finally {
        runtime.close()
        await rm(directory, { recursive: true, force: true })
      }
    })

    it("preserves the oldest live undo when stale redo tokens fill retention", async () => {
      const directory = await mkdtemp(
        path.join(tmpdir(), "eidos-node-sqlite-row-undo-retention-")
      )
      const filePath = path.join(directory, "row-undo-retention.eidos")
      const runtime = createEidosFile(filePath, {
        defaultTable: {
          name: "Tasks",
          fields: [{ name: "Name", type: "text" }],
        },
      })
      try {
        const table = runtime.schema()[0]!.table
        const rowIds = Array.from({ length: 51 }, (_, index) =>
          String(runtime.insertRow(table.id, { Name: `Task ${index}` })._id)
        )
        const undoTokens = rowIds
          .slice(0, 50)
          .map(
            (rowId) =>
              runtime.deleteRowsReversible(table.id, [rowId]).undoToken!
          )
        for (let index = 49; index >= 25; index -= 1) {
          runtime.revertRowMutation(undoTokens[index]!)
        }

        runtime.deleteRowsReversible(table.id, [rowIds[50]!])
        expect(runtime.revertRowMutation(undoTokens[0]!).undoToken).toBeTruthy()
        expect(runtime.getRow(table.id, rowIds[0]!)?.Name).toBe("Task 0")
      } finally {
        runtime.close()
        await rm(directory, { recursive: true, force: true })
      }
    })

    it("keeps Runtime 1.0 mutationUndo disabled while exposing the local deletion bridge", async () => {
      const directory = await mkdtemp(
        path.join(tmpdir(), "eidos-node-sqlite-runtime-row-undo-")
      )
      const filePath = path.join(directory, "runtime-row-undo.eidos")
      const created = createEidosFile(filePath, {
        defaultTable: {
          name: "Tasks",
          fields: [{ name: "Name", type: "text" }],
        },
      })
      const table = created.schema()[0]!.table
      const rowId = String(created.insertRow(table.id, { Name: "One" })._id)
      created.close()

      const connection = new NodeSqliteConnectionPort(
        new DatabaseSync(filePath)
      )
      const binding = await Runtime.open(
        connection,
        runtimeEnvironment(),
        "readwrite",
        runtimeFactoryContext
      )
      const runtime = binding.service as EidosRuntimeService
      try {
        const negotiated = await runtime.negotiate(
          { protocol: "eidos-runtime", versions: ["1.0"] },
          runtimeContext("negotiate-row-undo")
        )
        expect(negotiated.capabilities.mutationUndo).toBe(false)
        expect("revertMutation" in runtime).toBe(false)

        const snapshot = await runtime.getSnapshot(
          {},
          runtimeContext("row-undo-snapshot")
        )
        const deleted = await runtime.mutateRowsWithUndo(
          {
            tableId: table.id,
            expectedRevision: snapshot.revision,
            changes: [{ kind: "delete", rowId }],
          },
          runtimeContext("delete-with-row-undo")
        )
        expect(deleted.undoToken).toBeTruthy()

        const restored = await runtime.revertRowDeletion(
          {
            undoToken: deleted.undoToken!,
            expectedRevision: deleted.revision,
          },
          runtimeContext("restore-row-deletion")
        )
        expect(restored.undoToken).toBeTruthy()
        expect(restored.rowCount).toBe("1")
        const rows = await runtime.getRowsById(
          {
            tableId: table.id,
            rowIds: [rowId],
            projection: { fields: [], resolveRelations: [] },
          },
          runtimeContext("verify-restored-row")
        )
        expect(rows.rows.map((row) => row.id)).toEqual([rowId])
      } finally {
        await runtime.close(runtimeContext("close-runtime-row-undo"))
        connection.close()
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
                {
                  clientKey: "status",
                  name: "Status",
                  kind: "select",
                  position: "3",
                  settings: {
                    options: [
                      { color: "gray", name: "Todo" },
                      { color: "green", name: "Done" },
                    ],
                    defaultOption: "Todo",
                  },
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
        const statusId = id("status")

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

        const queryRows = vi.spyOn(EidosFileRuntime.prototype, "queryRows")
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
            returning: {
              fields: [titleId, notesId, tagsId, statusId],
              resolveRelations: [],
            },
          },
          runtimeContext("complete-required-value")
        )
        try {
          expect(queryRows).not.toHaveBeenCalled()
          expect(inserted.returnedRows?.rows[0]?.values).toEqual([
            "First",
            null,
            [],
            "Todo",
          ])
        } finally {
          queryRows.mockRestore()
        }
        const rows = await runtime.getRowsById(
          {
            tableId,
            rowIds: [inserted.created[0]!.rowId],
            projection: {
              fields: [titleId, notesId, tagsId, statusId],
              resolveRelations: [],
            },
          },
          runtimeContext("created-default-values")
        )
        expect(rows.rows[0]!.values).toEqual(["First", null, [], "Todo"])

        const explicitEmpty = await runtime.mutateRows(
          {
            tableId,
            expectedRevision: inserted.revision,
            changes: [
              {
                kind: "create",
                clientKey: "explicit-empty-select",
                values: { [titleId]: "Second", [statusId]: null },
              },
            ],
            returning: {
              fields: [titleId, statusId],
              resolveRelations: [],
            },
          },
          runtimeContext("explicit-empty-select")
        )
        expect(explicitEmpty.returnedRows?.rows[0]?.values).toEqual([
          "Second",
          null,
        ])
      } finally {
        await runtime.close(runtimeContext("close-required-values"))
        connection.close()
      }
    })
  }
)
