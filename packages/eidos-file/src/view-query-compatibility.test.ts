import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { createEidosFile } from "./better-sqlite3"
import { canonicalizeEidosFileJson } from "./canonical-json"
import { EIDOS_FILE_VIEWS_TABLE } from "./constants"

describe("saved View query forward compatibility", () => {
  const roots: string[] = []

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("preserves an unsupported query until it is explicitly replaced", () => {
    const root = mkdtempSync(path.join(tmpdir(), "eidos-view-query-"))
    roots.push(root)
    const runtime = createEidosFile(path.join(root, "data.eidos"), {
      defaultTable: {
        name: "Tasks",
        fields: [{ name: "Name", type: "text" }],
      },
    })

    try {
      const table = runtime.schema()[0]!
      const field = table.fields.find((candidate) => candidate.name === "Name")!
      const original = canonicalizeEidosFileJson({
        filter: {
          op: "and",
          args: [
            {
              field: field.id,
              op: "future-smart-match",
              value: "Roadmap",
            },
          ],
        },
      })
      const viewId = runtime.listViews(table.table.id)[0]!.id
      runtime.connection.run(
        `UPDATE ${EIDOS_FILE_VIEWS_TABLE} SET query_json = ? WHERE id = ?`,
        [original, viewId]
      )

      const unsupported = runtime.listViews(table.table.id)[0]!
      expect(unsupported.queryStatus).toBe("unsupported")
      expect(unsupported.query).toBe(original)
      expect(unsupported.filter).toBeNull()
      expect(runtime.validate({ level: "full" })).toMatchObject({
        valid: true,
        warnings: [expect.objectContaining({ code: "view-query-unsupported" })],
      })

      runtime.updateView(viewId, { name: "Renamed" })
      expect(runtime.listViews(table.table.id)[0]!.query).toBe(original)

      runtime.updateView(viewId, { properties: { rowHeight: 40 } })
      expect(runtime.listViews(table.table.id)[0]!.query).toBe(original)
      expect(() => runtime.duplicateView(viewId)).toThrow(
        "saved query from a newer Eidos version"
      )

      const replaced = runtime.updateView(viewId, {
        filter: {
          type: "group",
          conjunction: "and",
          children: [
            {
              type: "rule",
              field: field.id!,
              operator: "equals",
              value: "Roadmap",
            },
          ],
        },
      })
      expect(replaced.queryStatus).toBe("supported")
      expect(replaced.filter?.children).toHaveLength(1)
    } finally {
      runtime.close()
    }
  })

  it("does not execute a known operator with newer parameter semantics", () => {
    const root = mkdtempSync(path.join(tmpdir(), "eidos-view-query-value-"))
    roots.push(root)
    const runtime = createEidosFile(path.join(root, "data.eidos"), {
      defaultTable: {
        name: "Tasks",
        fields: [{ name: "Due", type: "date" }],
      },
    })

    try {
      const table = runtime.schema()[0]!
      const field = table.fields.find((candidate) => candidate.name === "Due")!
      const original = canonicalizeEidosFileJson({
        filter: {
          op: "and",
          args: [
            {
              field: field.id,
              op: "is-relative-to-today",
              value: { direction: "this", unit: "quarter" },
            },
          ],
        },
      })
      const viewId = runtime.listViews(table.table.id)[0]!.id
      runtime.connection.run(
        `UPDATE ${EIDOS_FILE_VIEWS_TABLE} SET query_json = ? WHERE id = ?`,
        [original, viewId]
      )

      const view = runtime.listViews(table.table.id)[0]!
      expect(view.queryStatus).toBe("unsupported")
      expect(view.filter).toBeNull()
      expect(runtime.validate({ level: "full" })).toMatchObject({
        valid: true,
        warnings: [expect.objectContaining({ code: "view-query-unsupported" })],
      })
    } finally {
      runtime.close()
    }
  })
})
