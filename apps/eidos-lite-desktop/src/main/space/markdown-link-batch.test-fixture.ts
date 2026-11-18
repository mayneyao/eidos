import fs from "node:fs/promises"
import path from "node:path"
import {
  createEidosLiteFileRuntime,
  openEidosLiteFileRuntime,
} from "../../runtime/eidos-file-runtime"

export const LINK_BODY =
  "![shared](../assets/c.png)\n[plan](../assets/plan.txt)\n[database](db-0.eidos)\n[untouched](../inbox/untouched.txt)"
export const LINK_MARKDOWN =
  "![shared](../assets/c.png)\n[plan](../assets/plan.txt)\n[database](../data/db-0.eidos)\n[untouched](../inbox/untouched.txt)\n"
export const LINK_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
)

export async function seedLinkBatchSpace(
  root: string,
  options: {
    databases: number
    rows: number
    markdown?: number
    extraMarkdown?: number
    markdownText?: string
  }
) {
  for (const directory of [
    "data/assets",
    "notes",
    "assets",
    "inbox",
    "destination",
  ])
    await fs.mkdir(path.join(root, directory), { recursive: true })
  for (const asset of ["assets/c.png", "data/assets/local.png"])
    await fs.writeFile(path.join(root, asset), LINK_PNG)
  await fs.writeFile(path.join(root, "assets/plan.txt"), "untouched plan")
  await fs.writeFile(
    path.join(root, "inbox/untouched.txt"),
    "untouched attachment"
  )
  for (let index = 0; index < 3; index++)
    await fs.writeFile(
      path.join(root, `inbox/move-${index}.txt`),
      "unreferenced ordinary file"
    )
  for (let index = 0; index < (options.markdown ?? 4); index++)
    await fs.writeFile(
      path.join(root, `notes/note-${index}.md`),
      options.markdownText ?? LINK_MARKDOWN
    )
  for (let index = 0; index < (options.extraMarkdown ?? 1); index++)
    await fs.writeFile(
      path.join(root, `notes/extra-${index}.markdown`),
      options.markdownText ?? LINK_MARKDOWN
    )
  if (!options.databases) return null
  const runtime = await createEidosLiteFileRuntime(
    path.join(root, "data/db-0.eidos"),
    "Synthetic link batch",
    { contentFieldName: "Body" }
  )
  try {
    const tableId = runtime.initialSnapshot.tables[0]!.table.id
    await runtime.source.addField(tableId, { name: "Other", type: "text" })
    const snapshot = await runtime.source.addField(tableId, {
      name: "Files",
      type: "file",
    })
    const fields = snapshot.tables[0]!.fields
    const content = fields.find((field) => field.name === "Body")!
    const other = fields.find((field) => field.name === "Other")!
    const file = fields.find((field) => field.name === "Files")!
    const entry = await runtime.allocateFileEntry({
      name: "local.png",
      uri: "assets/local.png",
      size: String(LINK_PNG.length),
      mediaType: "image/png",
    })
    const first = await runtime.source.insertRow(tableId, {
      [content.id]: LINK_BODY,
      [other.id]: LINK_BODY,
      [file.id]: [entry],
    })
    let revision = String(first.revision)
    for (let offset = 1; offset < options.rows; offset += 100) {
      const result = await runtime.source.runtime.mutateRows(
        {
          tableId,
          expectedRevision: revision,
          changes: Array.from(
            { length: Math.min(100, options.rows - offset) },
            (_, index) => ({
              kind: "create" as const,
              clientKey: `seed-${offset + index}`,
              values: { [content.id]: LINK_BODY, [other.id]: LINK_BODY },
            })
          ),
        },
        { requestId: "link-batch-seed" }
      )
      revision = String(result.revision)
    }
    return {
      tableId,
      rowId: String(first.row._id),
      content,
      other,
      file,
      originalFiles: first.row[file.tableColumnName],
    }
  } finally {
    await runtime.close()
    for (let index = 1; index < options.databases; index++)
      await fs.copyFile(
        path.join(root, "data/db-0.eidos"),
        path.join(root, `data/db-${index}.eidos`)
      )
  }
}

export async function readLinkBatchRow(
  root: string,
  owner: string,
  tableId: string,
  rowId: string
) {
  const runtime = await openEidosLiteFileRuntime(path.join(root, owner))
  try {
    return await runtime.source.getRow(tableId, rowId)
  } finally {
    await runtime.close()
  }
}
