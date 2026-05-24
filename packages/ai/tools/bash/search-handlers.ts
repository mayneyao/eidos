import type { DataSpace } from "@/packages/core/data-space"

export interface ExecResult {
  exitCode: number
  stdout: string
  stderr: string
}

interface DocMatch {
  kind: "doc" | "journal"
  recordId: string
  recordTitle: string
  containerId: string | null
  containerName: string | null
  containerType: string | null
  matches: Array<{ line: number; text: string }>
}

/**
 * Search all documents (tree-based + journals) by keyword.
 * Queries titles in eidos__tree and markdown content in eidos__docs.
 */
export async function searchDocs(
  ds: DataSpace,
  keyword: string
): Promise<ExecResult> {
  const pattern = `%${keyword}%`
  const lowerKeyword = keyword.toLowerCase()

  try {
    const results: DocMatch[] = []

    // Query A: tree-based documents (sub-docs under tables, root docs, folder docs)
    const treeRows = (await ds.db.selectObjects(
      `SELECT t.id, t.name, t.parent_id,
              p.name AS parent_name, p.type AS parent_type,
              d.markdown
       FROM eidos__tree t
       JOIN eidos__docs d ON t.id = d.id
       LEFT JOIN eidos__tree p ON t.parent_id = p.id
       WHERE t.type = 'doc' AND t.is_deleted = 0
         AND (t.name LIKE ? OR d.markdown LIKE ?)
       LIMIT 50`,
      [pattern, pattern]
    )) as Array<{
      id: string
      name: string
      parent_id: string | null
      parent_name: string | null
      parent_type: string | null
      markdown: string | null
    }>

    for (const row of treeRows) {
      const title = row.name || row.id
      const content = row.markdown || ""
      const matches = extractMatches(title, content, lowerKeyword)
      if (matches.length === 0) continue

      results.push({
        kind: "doc",
        recordId: row.id,
        recordTitle: title,
        containerId: row.parent_id,
        containerName: row.parent_name,
        containerType: row.parent_type,
        matches,
      })
    }

    // Query B: journal/day pages (no tree entries)
    const journalRows = (await ds.db.selectObjects(
      `SELECT id, markdown
       FROM eidos__docs
       WHERE is_day_page = 1 AND markdown LIKE ?
       LIMIT 50`,
      [pattern]
    )) as Array<{
      id: string
      markdown: string | null
    }>

    for (const row of journalRows) {
      const content = row.markdown || ""
      const matches = extractMatches(row.id, content, lowerKeyword)
      if (matches.length === 0) continue

      results.push({
        kind: "journal",
        recordId: row.id,
        recordTitle: row.id,
        containerId: null,
        containerName: null,
        containerType: "day",
        matches,
      })
    }

    return {
      exitCode: 0,
      stdout: JSON.stringify(results, null, 2),
      stderr: "",
    }
  } catch (err) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: `Search error: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

function extractMatches(
  title: string,
  content: string,
  lowerKeyword: string
): Array<{ line: number; text: string }> {
  const matches: Array<{ line: number; text: string }> = []

  // Title match (line 0)
  if (title.toLowerCase().includes(lowerKeyword)) {
    matches.push({ line: 0, text: title })
  }

  // Content matches
  const lines = content.split("\n")
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]?.trim() ?? ""
    if (trimmed && trimmed.toLowerCase().includes(lowerKeyword)) {
      matches.push({ line: i + 1, text: trimmed })
    }
  }

  return matches
}
