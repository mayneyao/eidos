import type { DataSpace } from "@/packages/core/data-space"

export interface ExecResult {
  exitCode: number
  stdout: string
  stderr: string
}

export async function extensionList(ds: DataSpace): Promise<ExecResult> {
  try {
    const rows = (await ds.db.selectObjects(
      `SELECT id, slug, name, type, description, enabled, updated_at
       FROM eidos__extensions
       ORDER BY slug`
    )) as Array<{
      id: string
      slug: string
      name: string
      type: string
      description: string | null
      enabled: number | null
      updated_at: string | null
    }>

    return {
      exitCode: 0,
      stdout: JSON.stringify(
        rows.map((r) => ({
          id: r.id,
          slug: r.slug,
          name: r.name,
          type: r.type,
          description: r.description || "",
          enabled: r.enabled !== 0,
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
      stderr: `Error listing extensions: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

export async function extensionGet(
  ds: DataSpace,
  slug: string
): Promise<ExecResult> {
  try {
    const rows = (await ds.db.selectObjects(
      `SELECT id, slug, name, type, ts_code, code, description, version, enabled, updated_at
       FROM eidos__extensions
       WHERE slug = ?`,
      [slug]
    )) as Array<{
      id: string
      slug: string
      name: string
      type: string
      ts_code: string | null
      code: string | null
      description: string | null
      version: string | null
      enabled: number | null
      updated_at: string | null
    }>

    if (rows.length === 0) {
      return {
        exitCode: 0,
        stdout: "",
        stderr: `Extension not found: ${slug}`,
      }
    }

    const ext = rows[0]
    return {
      exitCode: 0,
      stdout: JSON.stringify(
        {
          id: ext.id,
          slug: ext.slug,
          name: ext.name,
          type: ext.type,
          version: ext.version,
          description: ext.description || "",
          code: ext.ts_code || ext.code || "",
          enabled: ext.enabled !== 0,
          updatedAt: ext.updated_at,
        },
        null,
        2
      ),
      stderr: "",
    }
  } catch (err) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: `Error reading extension: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

export async function extensionWrite(
  ds: DataSpace,
  slug: string,
  code: string
): Promise<ExecResult> {
  try {
    const rows = (await ds.db.selectObjects(
      `SELECT id FROM eidos__extensions WHERE slug = ?`,
      [slug]
    )) as Array<{ id: string }>

    if (rows.length > 0) {
      await ds.db.exec({
        sql: `UPDATE eidos__extensions SET ts_code = ?, updated_at = ? WHERE id = ?`,
        bind: [code, new Date().toISOString(), rows[0].id],
        returnValue: "resultRows",
        rowMode: "object",
      })
      return {
        exitCode: 0,
        stdout: `Extension ${slug} updated`,
        stderr: "",
      }
    }

    return {
      exitCode: 1,
      stdout: "",
      stderr: `Extension not found: ${slug}. Use the UI to create extensions first.`,
    }
  } catch (err) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: `Error writing extension: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}
