import type { DataSpace } from "@/packages/core/data-space"
import { generateIdV7 } from "@/lib/utils"

export interface ExecResult {
  exitCode: number
  stdout: string
  stderr: string
}

export async function docGet(ds: DataSpace, id: string): Promise<ExecResult> {
  try {
    const rows = (await ds.db.selectObjects(
      `SELECT id, markdown FROM eidos__docs WHERE id = ?`,
      [id]
    )) as Array<{ id: string; markdown: string }>

    if (rows.length === 0) {
      return { exitCode: 1, stdout: "", stderr: `Document not found: ${id}` }
    }
    return { exitCode: 0, stdout: rows[0].markdown || "", stderr: "" }
  } catch (err) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: err instanceof Error ? err.message : String(err),
    }
  }
}

/** Create a standalone document (root or under folder). Content via stdin. */
export async function docCreate(
  ds: DataSpace,
  name: string,
  opts: { parentId?: string; content: string }
): Promise<ExecResult> {
  try {
    const id = generateIdV7()
    await ds.tree.addNode({
      id,
      name,
      type: "doc",
      parent_id: opts.parentId || undefined,
    })
    await ds.doc.createOrUpdateWithMarkdown(id, opts.content)
    return {
      exitCode: 0,
      stdout: JSON.stringify({ id, name, parentId: opts.parentId || null }),
      stderr: "",
    }
  } catch (err) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: err instanceof Error ? err.message : String(err),
    }
  }
}

/** Update a standalone document (not a table sub-doc). Content via stdin. */
export async function docUpdateStandalone(
  ds: DataSpace,
  id: string,
  content: string
): Promise<ExecResult> {
  try {
    const rows = (await ds.db.selectObjects(
      `SELECT id FROM eidos__docs WHERE id = ?`,
      [id]
    )) as Array<{ id: string }>

    if (rows.length === 0) {
      return { exitCode: 1, stdout: "", stderr: `Document not found: ${id}` }
    }
    await ds.doc.createOrUpdateWithMarkdown(id, content)
    return { exitCode: 0, stdout: `Document ${id} updated`, stderr: "" }
  } catch (err) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function docDelete(
  ds: DataSpace,
  id: string
): Promise<ExecResult> {
  try {
    const node = await ds.tree.getNode(id)
    if (!node) {
      return { exitCode: 1, stdout: "", stderr: `Document not found: ${id}` }
    }
    if (node.type !== "doc") {
      return {
        exitCode: 1,
        stdout: "",
        stderr: `Not a document: ${id} (type: ${node.type})`,
      }
    }
    await ds.tree.deleteNode(id)
    await ds.doc.del(id)
    return { exitCode: 0, stdout: `Document ${id} deleted`, stderr: "" }
  } catch (err) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: err instanceof Error ? err.message : String(err),
    }
  }
}
