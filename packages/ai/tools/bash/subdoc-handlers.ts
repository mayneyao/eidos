import type { DataSpace } from "@/packages/core/data-space"
import {
  shortenId,
  getRawTableNameById,
  extractIdFromShortId,
} from "@/lib/utils"

export interface ExecResult {
  exitCode: number
  stdout: string
  stderr: string
}

function normalizeTableId(id: string): string {
  if (!id) return id
  return id.startsWith("tb_") ? id.slice(3) : id
}

/** List all sub-documents under a table (expanded records with tree + docs entries). */
export async function subdocList(
  ds: DataSpace,
  tableId: string
): Promise<ExecResult> {
  try {
    const normalized = normalizeTableId(tableId)

    const rows = (await ds.db.selectObjects(
      `SELECT t.id, t.name, t.updated_at,
              SUBSTR(d.markdown, 1, 200) AS snippet
       FROM eidos__tree t
       LEFT JOIN eidos__docs d ON t.id = d.id
       WHERE t.parent_id = ? AND t.type = 'doc' AND t.is_deleted = 0
       ORDER BY t.name`,
      [normalized]
    )) as Array<{
      id: string
      name: string
      updated_at: string
      snippet: string
    }>

    return {
      exitCode: 0,
      stdout: JSON.stringify(
        rows.map((r) => ({
          id: r.id,
          title: r.name,
          hasContent: !!(r.snippet && r.snippet.trim()),
          snippet: r.snippet?.trim() || "",
          updatedAt: r.updated_at,
        })),
        null,
        2
      ),
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

/**
 * Read a sub-document's full markdown content.
 * If not expanded yet, returns hints instead of failing.
 */
export async function subdocRead(
  ds: DataSpace,
  tableId: string,
  recordId: string
): Promise<ExecResult> {
  try {
    const id = recordId.includes("-") ? shortenId(recordId) : recordId

    const rows = (await ds.db.selectObjects(
      `SELECT markdown FROM eidos__docs WHERE id = ?`,
      [id]
    )) as Array<{ markdown: string }>

    if (rows.length > 0) {
      return { exitCode: 0, stdout: rows[0].markdown || "", stderr: "" }
    }

    // Not expanded — show record info and hint
    const title = await getRecordTitle(ds, tableId, id)
    return {
      exitCode: 0,
      stdout: JSON.stringify({
        expanded: false,
        recordTitle: title || id,
        hint: `This record has no sub-document yet. Use "eidos subdoc write ${tableId} ${id}" to create one.`,
      }),
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

/**
 * Write (create or update) a sub-document's markdown.
 * Auto-expands the record into a sub-doc if not yet expanded.
 */
export async function subdocWrite(
  ds: DataSpace,
  tableId: string,
  recordId: string,
  content: string
): Promise<ExecResult> {
  try {
    const id = recordId.includes("-") ? shortenId(recordId) : recordId

    const title = (await getRecordTitle(ds, tableId, id)) || id
    await ds.tree.getOrCreateNode({
      id,
      name: title,
      type: "doc",
      parent_id: tableId,
      hide_properties: true,
    })
    await ds.doc.createOrUpdateWithMarkdown(id, content)

    return { exitCode: 0, stdout: JSON.stringify({ id, title }), stderr: "" }
  } catch (err) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: err instanceof Error ? err.message : String(err),
    }
  }
}

/** Soft-delete a sub-document. No-op if it doesn't exist. */
export async function subdocDelete(
  ds: DataSpace,
  tableId: string,
  recordId: string
): Promise<ExecResult> {
  try {
    const id = recordId.includes("-") ? shortenId(recordId) : recordId

    const node = await ds.tree.getNode(id)
    if (!node) {
      return {
        exitCode: 1,
        stdout: "",
        stderr: `Sub-document not found: ${id}`,
      }
    }
    await ds.tree.deleteNode(id)
    await ds.doc.del(id)
    return { exitCode: 0, stdout: `Sub-document ${id} deleted`, stderr: "" }
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
