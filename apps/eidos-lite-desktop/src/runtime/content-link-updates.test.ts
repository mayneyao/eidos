import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createEidosLiteFileRuntime } from "./eidos-file-runtime"
import {
  readContentLinkDocuments,
  writeContentLinkDocuments,
} from "./content-link-updates"
import {
  prepareMarkdownLinkMove,
  applyMarkdownLinkMove,
  type MarkdownContentStore,
} from "../main/space/markdown-link-maintenance"

it("updates only formal Content through Runtime revisions and preserves unrelated Text/File values and newer edits", async () => {
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "eidos-content-move-"))
  )
  const opened = await createEidosLiteFileRuntime(
    path.join(root, "data.eidos"),
    "Content links",
    { contentFieldName: "Body" }
  )
  try {
    const initial = opened.initialSnapshot.tables[0]!
    const tableId = initial.table.id
    await opened.source.addField(tableId, { name: "Other", type: "text" })
    let snapshot = await opened.source.addField(tableId, {
      name: "Files",
      type: "file",
    })
    const field = (name: string) =>
      snapshot.tables[0]!.fields.find((f) => f.name === name)!
    const attachment = await opened.allocateFileEntry({
      name: "c.png",
      size: "14",
      mediaType: "image/png",
      uri: "assets/c.png",
    })
    const row = await opened.source.insertRow(tableId, {
      [field("Body").id]: "---\n[asset](assets/c.png?size=1#view)\n---\n",
      [field("Other").id]: "[asset](assets/c.png)",
      [field("Files").id]: [attachment],
    })
    const originalFiles = row.row[field("Files").tableColumnName]
    await fs.mkdir(path.join(root, "assets"))
    await fs.writeFile(path.join(root, "assets/c.png"), "resource bytes")
    const store: MarkdownContentStore = {
      read: () => readContentLinkDocuments(opened.source),
      write: (_owner, update) =>
        writeContentLinkDocuments(opened.source, update),
    }
    const plan = await prepareMarkdownLinkMove(
      root,
      "assets/c.png",
      "assets/renamed.png",
      {},
      store
    )
    expect(plan.contentEdits).toHaveLength(1)
    await fs.rename(
      path.join(root, "assets/c.png"),
      path.join(root, "assets/renamed.png")
    )
    expect(await applyMarkdownLinkMove(root, plan, store)).toEqual({
      updatedPaths: ["data.eidos"],
      skippedPaths: [],
    })
    const saved = await opened.source.getRow(tableId, String(row.row._id))
    expect(saved?.[field("Body").tableColumnName]).toBe(
      "---\n[asset](assets/renamed.png?size=1#view)\n---\n"
    )
    expect(saved?.[field("Other").tableColumnName]).toBe(
      "[asset](assets/c.png)"
    )
    const stale = await readContentLinkDocuments(opened.source)
    await opened.source.updateRow(tableId, String(row.row._id), {
      [field("Body").id]: "newer draft saved",
    })
    expect(
      await writeContentLinkDocuments(opened.source, {
        ...stale,
        documents: stale.documents.map((d) => ({
          ...d,
          content: "stale rewrite",
        })),
      })
    ).toEqual({ updated: false, skipped: true })
    const latest = await opened.source.getRow(tableId, String(row.row._id))
    expect(latest?.[field("Body").tableColumnName]).toBe("newer draft saved")
    expect(latest?.[field("Files").tableColumnName]).toBe(originalFiles)
  } finally {
    await opened.close()
    await fs.rm(root, { recursive: true, force: true })
  }
})
