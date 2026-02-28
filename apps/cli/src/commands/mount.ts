import path from "path"
import { existsSync, statSync } from "fs"
import { getSpaceRegistry } from "@eidos.space/space-manager"
import { getDataSpace } from "../server/data-space"
import { logger } from "../utils/logger"

/**
 * Mount an external directory to the current space
 */
export async function mountCommand(name: string, dirPath: string) {
  try {
    // Validate mount name
    if (!name || name.trim() === "") {
      logger.error("Mount name is required")
      process.exit(1)
    }

    // Validate mount name format (alphanumeric, underscore, hyphen)
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      logger.error(
        "Mount name must contain only alphanumeric characters, underscores, and hyphens"
      )
      process.exit(1)
    }

    // Validate path exists and is a directory
    if (!existsSync(dirPath)) {
      logger.error(`Directory does not exist: ${dirPath}`)
      process.exit(1)
    }

    const stat = statSync(dirPath)
    if (!stat.isDirectory()) {
      logger.error(`Path is not a directory: ${dirPath}`)
      process.exit(1)
    }

    // Normalize path to absolute path
    const normalizedPath = path.resolve(dirPath)

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

    // Check if mount name already exists
    const existingMountPath = await dataSpace.kv.get(
      `eidos:space:files:mount:${name}`,
      "text"
    )
    if (existingMountPath) {
      logger.error(`Mount name already exists: ${name}`)
      logger.info(`  Current mount: ${name} -> ${existingMountPath}`)
      process.exit(1)
    }

    // Create mount metadata
    const mountMeta = {
      type: "directory" as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    // Store to KV table
    await dataSpace.kv.put(`eidos:space:files:mount:${name}`, normalizedPath, {
      meta: mountMeta,
    })

    logger.log(`✓ Successfully mounted '${name}' -> ${normalizedPath}`)
    logger.log(`  Access files via: /@/${name}/filename`)
  } catch (error: any) {
    logger.error(`Failed to create mount: ${error.message}`)
    if (error.stack) {
      logger.info(`\nDetails:\n${error.stack}`)
    }
    process.exit(1)
  }
}
