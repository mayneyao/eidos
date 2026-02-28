import path from "path"
import { existsSync } from "fs"
import { getSpaceRegistry } from "@eidos.space/space-manager"
import { getDataSpace } from "../server/data-space"
import { logger } from "../utils/logger"

/**
 * Remove a mounted directory from the current space
 */
export async function unmountCommand(name: string) {
  try {
    // Validate mount name
    if (!name || name.trim() === "") {
      logger.error("Mount name is required")
      process.exit(1)
    }

    // Get current workspace path
    const currentSpacePath = process.cwd()
    const eidosDir = path.join(currentSpacePath, ".eidos")
    const dbPath = path.join(eidosDir, "db.sqlite3")

    // Check if it's a valid Eidos space
    if (!existsSync(eidosDir)) {
      logger.error(`Not an Eidos space: ${currentSpacePath}`)
      logger.info("Please run this command from a valid Eidos space directory")
      process.exit(1)
    }

    if (!existsSync(dbPath)) {
      logger.error(
        `Invalid Eidos space (missing database): ${currentSpacePath}`
      )
      process.exit(1)
    }

    // Get or register space
    const registry = getSpaceRegistry()
    const allSpaces = registry.getAllSpaces()
    let space = allSpaces.find((s) => s.path === currentSpacePath)

    // If not registered, register it
    if (!space) {
      logger.info("Space not registered, registering now...")
      const folderName = path.basename(currentSpacePath)
      space = registry.registerSpace(currentSpacePath, folderName)
      logger.log(`✓ Registered space: ${space.id}`)
    }

    // Get DataSpace instance
    const dataSpace = await getDataSpace(space.id)

    // Check if mount exists
    const existingMountPath = await dataSpace.kv.get(
      `eidos:space:files:mount:${name}`,
      "text"
    )
    if (!existingMountPath) {
      logger.error(`Mount not found: ${name}`)
      process.exit(1)
    }

    // Delete from KV table
    await dataSpace.kv.delete(`eidos:space:files:mount:${name}`)

    logger.log(`✓ Successfully removed mount '${name}'`)
    logger.log(`  Previous mount was: ${existingMountPath}`)
  } catch (error: any) {
    logger.error(`Failed to remove mount: ${error.message}`)
    if (error.stack) {
      logger.info(`\nDetails:\n${error.stack}`)
    }
    process.exit(1)
  }
}
