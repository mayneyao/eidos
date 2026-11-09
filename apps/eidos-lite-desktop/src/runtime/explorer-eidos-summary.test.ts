import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "node:os"
import { createEidosFile } from "@eidos.space/eidos-file/node-sqlite"
import { inspectExplorerEidosSummary } from "./explorer-eidos-summary"

it("reads canonical table names and counts without changing bytes, timestamps or opening an editor", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "explorer-eidos-summary-"))
  const filePath = path.join(root, "project.eidos")
  try {
    const runtime = createEidosFile(filePath)
    const tasks = runtime.createTable({
      name: "任务",
      fields: [{ name: "Name", type: "text" }],
    })
    runtime.createTable({
      name: "Projects",
      fields: [{ name: "Name", type: "text" }],
    })
    runtime.insertRow(tasks.id, { Name: "Write" })
    runtime.insertRow(tasks.id, { Name: "Review" })
    runtime.close()
    const before = await readFile(filePath)
    const modified = (await stat(filePath)).mtimeMs
    expect(inspectExplorerEidosSummary(filePath)).toEqual({
      tableNames: ["任务", "Projects"],
      tableCount: 2,
      recordCount: 2,
    })
    expect(await readFile(filePath)).toEqual(before)
    expect((await stat(filePath)).mtimeMs).toBe(modified)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

it("handles empty files and bounds table names while avoiding counts across many tables", async () => {
  const root = await mkdtemp(
    path.join(tmpdir(), "explorer-eidos-summary-many-")
  )
  const filePath = path.join(root, "project.eidos")
  try {
    const runtime = createEidosFile(filePath)
    expect(inspectExplorerEidosSummary(filePath)).toEqual({
      tableNames: [],
      tableCount: 0,
      recordCount: 0,
    })
    for (let index = 0; index < 33; index++)
      runtime.createTable({
        name: `Table ${index}`,
        fields: [{ name: "Name", type: "text" }],
      })
    runtime.close()
    expect(inspectExplorerEidosSummary(filePath)).toEqual({
      tableNames: ["Table 0", "Table 1", "Table 2"],
      tableCount: 33,
      recordCount: null,
    })
    await writeFile(path.join(root, "invalid.eidos"), "not SQLite")
    expect(() =>
      inspectExplorerEidosSummary(path.join(root, "invalid.eidos"))
    ).toThrow()
    expect(() => inspectExplorerEidosSummary("relative.eidos")).toThrow()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
