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
      `SELECT id, slug, name, type, ts_code, code, meta, description, version, enabled, updated_at
       FROM eidos__extensions WHERE slug = ?`,
      [slug]
    )) as Array<{
      id: string
      slug: string
      name: string
      type: string
      ts_code: string | null
      code: string | null
      meta: string | null
      description: string | null
      version: string | null
      enabled: number | null
      updated_at: string | null
    }>

    if (rows.length === 0) {
      return { exitCode: 0, stdout: "", stderr: `Extension not found: ${slug}` }
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
          meta: safeJsonParse(ext.meta),
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
      stderr: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Create an extension with full compilation via V3.
 * Compiles TypeScript, extracts metadata, and populates all columns.
 */
export async function extensionCreate(
  ds: DataSpace,
  slug: string,
  opts: { name: string; type: string; description?: string; code: string }
): Promise<ExecResult> {
  try {
    const filename = opts.type === "block" ? "extension.tsx" : "extension.ts"

    // Use installFromCode which compiles, extracts meta, handles conflicts
    try {
      const ext = await ds.extension.installFromCode(opts.code, filename, slug)
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          id: ext.id,
          slug: ext.slug,
          name: ext.name,
          type: ext.type,
          enabled: ext.enabled,
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
  } catch (err) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Update an extension: compile new code, extract meta, update all columns.
 */
export async function extensionWrite(
  ds: DataSpace,
  slug: string,
  code: string
): Promise<ExecResult> {
  try {
    const rows = (await ds.db.selectObjects(
      `SELECT id, name, type FROM eidos__extensions WHERE slug = ?`,
      [slug]
    )) as Array<{ id: string; name: string; type: string }>

    if (rows.length === 0) {
      return {
        exitCode: 1,
        stdout: "",
        stderr: `Extension not found: ${slug}. Use "eidos extension create ${slug} <name>" to create one first.`,
      }
    }

    const ext = rows[0]
    const compileFn = ds.context.compileExtension
    if (!compileFn) {
      return {
        exitCode: 1,
        stdout: "",
        stderr: "Compile extension not available in this runtime.",
      }
    }

    const filename = ext.type === "block" ? "extension.tsx" : "extension.ts"
    let compiledCode: string
    let meta: any

    try {
      const result = await compileFn(code, filename)
      compiledCode = result.compiledCode
      meta = result.meta
    } catch (err) {
      return {
        exitCode: 1,
        stdout: "",
        stderr: `Compile error: ${err instanceof Error ? err.message : String(err)}`,
      }
    }

    await ds.db.exec({
      sql: `UPDATE eidos__extensions SET code = ?, ts_code = ?, meta = ?, updated_at = ? WHERE id = ?`,
      bind: [
        compiledCode,
        code,
        JSON.stringify(meta ?? {}),
        new Date().toISOString(),
        ext.id,
      ],
      returnValue: "resultRows",
      rowMode: "object",
    })

    return {
      exitCode: 0,
      stdout: JSON.stringify({ slug, compiled: true }),
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

function safeJsonParse(s: string | null): unknown {
  if (!s) return null
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}
