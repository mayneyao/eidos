import { type EidosDatabase } from "@/packages/core/data-space"
import { ExtensionTableName } from "@/packages/core/sqlite/const"
import { extractUDF, validateUDFCode } from "@eidos.space/v3"
import console from "electron-log"
import { registerDesktopUDFs } from "./udf"

export async function initUDF(
  db: EidosDatabase,
  projectRoot: string,
  mountMap?: Record<string, string>
) {
  registerDesktopUDFs(db, projectRoot, mountMap)

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

        const {
          name: funcName,
          xFunc,
          deterministic,
        } = udfResult.createFunctionConfig

        // Create function using the extracted configuration
        db.createFunction({
          name: funcName,
          xFunc: xFunc as any,
          deterministic: Boolean(deterministic),
          nArg: udfResult.createFunctionConfig.nArg,
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
