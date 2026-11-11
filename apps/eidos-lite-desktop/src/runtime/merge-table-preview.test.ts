import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  createEidosFile,
  openEidosFile,
} from "@eidos.space/eidos-file/node-sqlite"
import { readMergeTablePreview } from "./merge-table-preview"

it("reads each version's complete logical columns and real sample rows without changing its bytes", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "eidos-table-preview-")
  )
  try {
    const basePath = path.join(directory, "base.eidos")
    const runtime = createEidosFile(basePath)
    const table = runtime.createTable({
      name: "Projects",
      fields: [
        { name: "Project", type: "text", isRecordLabel: true },
        { name: "Owner", type: "text" },
      ],
    })
    for (let index = 0; index < 8; index++)
      runtime.insertRow(table.id, {
        Project: `Project ${index}`,
        Owner: "Alex",
      })
    runtime.close()
    const results = []
    for (const name of ["Project lead", "Assignee"]) {
      const target = path.join(directory, `${name}.eidos`)
      await fs.copyFile(basePath, target)
      const version = openEidosFile(target)
      version.updateField(table.id, "Owner", { name })
      version.close()
      const bytes = await fs.readFile(target)
      await fs.chmod(target, 0o444)
      const preview = readMergeTablePreview(target, ["Projects"])
      expect(preview).toHaveLength(1)
      expect(preview[0]?.fields.map((field) => field.name)).toEqual([
        "Project",
        name,
      ])
      expect(preview[0]?.rows).toHaveLength(6)
      expect(preview[0]?.rows[0]?.cells).toEqual(["Project 0", "Alex"])
      expect(preview[0]?.hasMoreRows).toBe(true)
      expect(preview[0]?.hasMoreFields).toBe(false)
      expect(
        createHash("sha256")
          .update(await fs.readFile(target))
          .digest("hex")
      ).toBe(createHash("sha256").update(bytes).digest("hex"))
      results.push(preview[0]!)
      await fs.chmod(target, 0o600)
    }
    expect(results[0]?.fields[1]?.id).toBe(results[1]?.fields[1]?.id)
    expect(readMergeTablePreview(basePath, ["absent table"])).toEqual([])
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})
