import { type EidosDatabase } from "@/packages/core/data-space"
import { ExtensionTableName } from "@/packages/core/sqlite/const"
import { extractUDF, validateUDFCode } from "@eidos.space/v3"
import console from "electron-log"
import fs from "node:fs"
import path from "node:path"

export async function initUDF(
  db: EidosDatabase,
  projectRoot: string,
  mountMap?: Record<string, string>
) {
  // Internal helper for directory walking
  function* walkSync(
    absPath: string,
    virtPath: string,
    recursive: boolean = false
  ): Generator<{
    name: string
    path: string
    kind: string
    pathname: string
    size: number
    mtime: number
  }> {
    try {
      const stats = fs.statSync(absPath)
      if (!stats.isDirectory()) return

      const entries = fs.readdirSync(absPath, {
        withFileTypes: true,
      })

      for (const entry of entries) {
        const baseVirtualPath = virtPath.endsWith("/")
          ? virtPath
          : virtPath + "/"
        const virtualEntryPath = baseVirtualPath + entry.name
        const itemAbsolutePath = path.join(absPath, entry.name)

        // For files, we add size and mtime
        let size = 0
        let mtime = 0
        try {
          const itemStats = fs.statSync(itemAbsolutePath)
          size = itemStats.size
          mtime = Math.floor(itemStats.mtimeMs)
        } catch (e) {
          // Ignore stats error for individual items
        }

        const item = {
          name: entry.name,
          path: virtualEntryPath,
          pathname: "/" + virtualEntryPath,
          kind: entry.isDirectory() ? "directory" : "file",
          size,
          mtime,
        }
        yield item

        if (recursive && entry.isDirectory()) {
          yield* walkSync(itemAbsolutePath, virtualEntryPath, true)
        }
      }
    } catch (error) {
      console.error(`Error walking path ${absPath}:`, error)
    }
  }

  try {
    db.table("lsdir", {
      columns: ["name", "path", "kind", "pathname", "size", "mtime"],
      parameters: ["target_path", "recursive"],
      rows: function* (fsPath: any, recursive: any) {
        if (typeof fsPath !== "string") return

        // Default recursive to false if not provided (null/undefined)
        const shouldRecursive =
          recursive === null || recursive === undefined ? false : !!recursive

        let absolutePath: string | null = null
        if (fsPath === "~" || fsPath.startsWith("~/")) {
          const relativePath = fsPath === "~" ? "" : fsPath.substring(2)
          absolutePath = path.join(projectRoot, relativePath)
        } else if (fsPath.startsWith("@/")) {
          const parts = fsPath.substring(2).split("/")
          const mountName = parts[0]
          if (mountName && mountMap && mountMap[mountName]) {
            const mountPath = mountMap[mountName]
            const relativePath = parts.slice(1).join("/")
            absolutePath = relativePath
              ? path.join(mountPath, relativePath)
              : mountPath
          }
        }

        if (absolutePath && fs.existsSync(absolutePath)) {
          yield* walkSync(absolutePath, fsPath, shouldRecursive)
        }
      },
    })
  } catch (error) {
    console.error(`Error in initUDF:`, error)
  }

  try {
    // Check if ExtensionTableName table exists before querying it
    const tableExists = await db.selectObjects(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
      [ExtensionTableName]
    )

    if (tableExists.length === 0) {
      console.warn(
        `Extension table ${ExtensionTableName} does not exist. Skipping UDF initialization.`
      )
      return
    }

    // Query UDF extensions directly from database using the same SQL as getUDFExtensions
    const sql = `
            SELECT * FROM ${ExtensionTableName}
            WHERE type = ?
            AND meta IS NOT NULL
            AND meta != ''
            AND JSON_VALID(meta) = 1
            AND JSON_EXTRACT(meta, '$.type') = ?
            AND enabled = ?
        `
    const params = ["script", "udf", 1]

    const udfExtensions = await db.selectObjects(sql, params)

    for (const extension of udfExtensions) {
      const { code, name, id } = extension

      try {
        // Validate UDF code format
        const validation = validateUDFCode(code)
        if (!validation.valid) {
          console.error(
            `UDF validation failed for ${name} (${id}):`,
            validation.errors
          )
          continue
        }

        // Extract UDF using oxc-transform
        const udfResult = extractUDF(code)
        if (!udfResult) {
          console.error(`Failed to extract UDF for ${name} (${id})`)
          continue
        }

        const { name: funcName, xFunc } = udfResult.createFunctionConfig

        // Create function using the extracted configuration
        db.createFunction({
          name: funcName,
          xFunc: xFunc as any,
        })
        console.log(
          `Successfully loaded UDF: ${udfResult.createFunctionConfig.name} from extension ${name}`
        )
      } catch (error) {
        console.error(`Error loading UDF ${name} (${id}):`, error)
      }
    }
  } catch (error) {
    console.error("Error initializing UDFs:", error)
  }
}
