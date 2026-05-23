import type { DataSpace } from "@/packages/core/data-space"
import {
  generateIdV7,
  shortenId,
  getRawTableNameById,
  extractIdFromShortId,
} from "@/lib/utils"

export interface ExecResult {
  exitCode: number
  stdout: string
  stderr: string
}

export async function docGet(ds: DataSpace, id: string): Promise<ExecResult> {
  try {
    const rows = (await ds.db.selectObjects(
      `SELECT id, markdown, is_day_page, created_at, updated_at
       FROM eidos__docs
       WHERE id = ?`,
      [id]
    )) as Array<{
      id: string
      markdown: string
      is_day_page: number
      created_at: string
      updated_at: string
    }>

    if (rows.length === 0) {
      return { exitCode: 0, stdout: "", stderr: `Document not found: ${id}` }
    }

    return { exitCode: 0, stdout: rows[0].markdown, stderr: "" }
  } catch (err) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Create a document.
 *
 * Standalone:  eidos doc create <name> --content "..."
 *              eidos doc create <name> --parent <folder_id> --content "..."
 *
 * Table sub-doc (new record):
 *              eidos doc create <name> --table <table_id> --content "..."
 *
 * Table sub-doc (link to existing record by _id, accepts dashed or undashed):
 *              eidos doc create <name> --table <table_id> --id <record_id> --content "..."
 */
export async function docCreate(
  ds: DataSpace,
  name: string,
  opts: {
    parentId?: string
    tableId?: string
    recordId?: string
    content: string
  }
): Promise<ExecResult> {
  try {
    const { parentId, tableId, recordId, content } = opts

    if (tableId) {
      const id = recordId ? shortenId(recordId) : generateIdV7()

      await ds.tree.getOrCreateNode({
        id,
        name,
        type: "doc",
        parent_id: tableId,
        hide_properties: true,
      })

      await ds.doc.createOrUpdateWithMarkdown(id, content)
      return {
        exitCode: 0,
        stdout: JSON.stringify({ id, name, parentId: tableId }),
        stderr: "",
      }
    }

    // Standalone doc
    const id = generateIdV7()
    await ds.tree.addNode({
      id,
      name,
      type: "doc",
      parent_id: parentId || undefined,
    })
    await ds.doc.createOrUpdateWithMarkdown(id, content)
    return {
      exitCode: 0,
      stdout: JSON.stringify({ id, name, parentId: parentId || null }),
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

export async function docUpdate(
  ds: DataSpace,
  id: string,
  tableId: string,
  content: string
): Promise<ExecResult> {
  try {
    let existing = (await ds.db.selectObjects(
      `SELECT id FROM eidos__docs WHERE id = ?`,
      [id]
    )) as Array<{ id: string }>

    if (existing.length === 0) {
      const title = (await getRecordTitle(ds, tableId, id)) || id
      await ds.tree.getOrCreateNode({
        id,
        name: title,
        type: "doc",
        parent_id: tableId,
        hide_properties: true,
      })
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

async function getRecordTitle(
  ds: DataSpace,
  tableId: string,
  recordId: string
): Promise<string | null> {
  try {
    const rawName = getRawTableNameById(tableId)
    const id = recordId.includes("-")
      ? recordId
      : extractIdFromShortId(recordId)

    const rows = (await ds.db.selectObjects(
      `SELECT title FROM ${rawName} WHERE _id = ?`,
      [id]
    )) as Array<{ title: string }>
    return rows[0]?.title || null
  } catch {
    return null
  }
}
