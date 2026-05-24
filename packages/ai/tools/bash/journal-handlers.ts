import type { DataSpace } from "@/packages/core/data-space"

export interface ExecResult {
  exitCode: number
  stdout: string
  stderr: string
}

export async function journalList(
  ds: DataSpace,
  limit: number = 30
): Promise<ExecResult> {
  try {
    const rows = (await ds.db.selectObjects(
      `SELECT id, SUBSTR(markdown, 1, 200) as snippet, created_at
       FROM eidos__docs
       WHERE is_day_page = 1
       ORDER BY id DESC
       LIMIT ?`,
      [limit]
    )) as Array<{ id: string; snippet: string; created_at: string }>

    return {
      exitCode: 0,
      stdout: JSON.stringify(
        rows.map((r) => ({
          date: r.id,
          snippet: r.snippet,
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
      stderr: `Error listing journals: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

export async function journalGet(
  ds: DataSpace,
  date: string
): Promise<ExecResult> {
  try {
    const resolved = resolveDate(date)
    const rows = (await ds.db.selectObjects(
      `SELECT id, markdown
       FROM eidos__docs
       WHERE is_day_page = 1 AND id = ?`,
      [resolved]
    )) as Array<{ id: string; markdown: string }>

    if (rows.length === 0) {
      return {
        exitCode: 0,
        stdout: "",
        stderr: `No journal entry for ${resolved}`,
      }
    }

    return {
      exitCode: 0,
      stdout: JSON.stringify(
        { date: rows[0].id, markdown: rows[0].markdown },
        null,
        2
      ),
      stderr: "",
    }
  } catch (err) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: `Error reading journal: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

export async function journalWrite(
  ds: DataSpace,
  date: string,
  content: string
): Promise<ExecResult> {
  try {
    const resolved = resolveDate(date)
    const existing = (await ds.db.selectObjects(
      `SELECT id FROM eidos__docs
       WHERE is_day_page = 1 AND id = ?`,
      [resolved]
    )) as Array<{ id: string }>

    const isNew = existing.length === 0
    await ds.doc.createOrUpdateWithMarkdown(resolved, content)
    return {
      exitCode: 0,
      stdout: isNew
        ? `Journal ${resolved} created`
        : `Journal ${resolved} updated`,
      stderr: "",
    }
  } catch (err) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: `Error writing journal: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

function resolveDate(date: string): string {
  if (date === "today") {
    return new Date().toISOString().slice(0, 10)
  }
  return date
}
