import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { createEidosFile } from "@eidos.space/eidos-file/better-sqlite3"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { exportEidosFileCsvToFile } from "./eidos-file-csv-export"

describe("exportEidosFileCsvToFile", () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "eidos-file-csv-export-"))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it("streams the filtered and sorted current view across cursor pages", async () => {
    const sourcePath = path.join(root, "tasks.eidos")
    const targetPath = path.join(root, "tasks.csv")
    const base = createEidosFile(sourcePath, {
      defaultTable: {
        id: "tasks",
        name: "Tasks",
        fields: [
          { name: "Score", columnName: "score", type: "number" },
          { name: "Status", columnName: "status", type: "text" },
        ],
      },
    })
    base.insertImportedRows(
      "tasks",
      Array.from({ length: 1_205 }, (_, index) => ({
        _id: `task-${String(index).padStart(4, "0")}`,
        title: `Task ${index}`,
        score: index,
        status: index % 2 === 0 ? "open" : "closed",
      }))
    )
    base.close()
    const progress = vi.fn()

    await expect(
      exportEidosFileCsvToFile({
        sourcePath,
        targetPath,
        tableId: "tasks",
        options: {
          query: {
            filter: {
              type: "group",
              conjunction: "and",
              children: [
                {
                  type: "rule",
                  field: "status",
                  operator: "equals",
                  value: "open",
                },
              ],
            },
            sorts: [{ field: "score", direction: "desc" }],
          },
          columns: [
            { columnName: "title", name: "Task" },
            { columnName: "score", name: "Score" },
          ],
        },
        onProgress: progress,
      })
    ).resolves.toEqual({ exportedRowCount: 603 })

    const csv = await readFile(targetPath, "utf8")
    const lines = csv
      .replace(/^\ufeff/, "")
      .trimEnd()
      .split("\r\n")
    expect(lines).toHaveLength(604)
    expect(lines.slice(0, 3)).toEqual([
      "Task,Score",
      "Task 1204,1204",
      "Task 1202,1202",
    ])
    expect(lines.at(-1)).toBe("Task 0,0")
    expect(progress).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: "exporting",
        processedRows: 500,
        totalRows: 603,
      })
    )
    expect(progress).toHaveBeenLastCalledWith(
      expect.objectContaining({
        phase: "finalizing",
        processedRows: 603,
      })
    )
  })
})
