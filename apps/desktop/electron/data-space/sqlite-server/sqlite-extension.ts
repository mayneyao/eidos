import fs from "fs"
import path from "path"
import { logger } from "@/lib/env"

export interface CustomSQLiteExtension {
  name: string
  path: string
  platform: "desktop" | "cli" | "web"
}

/**
 * Scans the .eidos/sqlite/ext directory for custom SQLite extensions
 * @param spacePath The path to the space directory
 * @param platform The platform we're running on ('desktop', 'cli', 'web')
 * @returns Array of custom extensions found
 */
export function scanCustomExtensions(
  spacePath: string,
  platform: "desktop" | "cli" | "web"
): CustomSQLiteExtension[] {
  const extensionsDir = path.join(spacePath, ".eidos", "sqlite", "ext")

  if (!fs.existsSync(extensionsDir)) {
    logger.debug(`Custom extensions directory not found: ${extensionsDir}`)
    return []
  }

  try {
    const files = fs.readdirSync(extensionsDir)
    const extensions: CustomSQLiteExtension[] = []

    for (const file of files) {
      const filePath = path.join(extensionsDir, file)

      // Check if it's a file (not a directory)
      const stat = fs.statSync(filePath)
      if (!stat.isFile()) {
        continue
      }

      // Check file extension - SQLite extensions typically have .so, .dylib, .dll extensions
      // but also include .wasm for web platform
      const validExtensions =
        platform === "web" ? [".wasm", ".js"] : [".so", ".dylib", ".dll"]

      if (!validExtensions.some((ext) => file.toLowerCase().endsWith(ext))) {
        logger.debug(`Skipping file ${file} - not a valid extension file`)
        continue
      }

      // Extract name without extension
      const name = path.parse(file).name

      extensions.push({
        name,
        path: filePath,
        platform,
      })

      logger.info(`Found custom SQLite extension: ${name} at ${filePath}`)
    }

    return extensions
  } catch (error) {
    logger.error(`Error scanning custom extensions directory: ${error}`)
    return []
  }
}

/**
 * Validates if a SQLite extension can be loaded
 * @param extension The extension to validate
 * @returns true if valid, false otherwise
 */
export function validateSQLiteExtension(
  extension: CustomSQLiteExtension
): boolean {
  try {
    // Check if file exists and is readable
    if (!fs.existsSync(extension.path)) {
      logger.warn(`Extension file not found: ${extension.path}`)
      return false
    }

    const stat = fs.statSync(extension.path)
    if (!stat.isFile()) {
      logger.warn(`Extension path is not a file: ${extension.path}`)
      return false
    }

    // Check file size (reasonable limit to prevent loading corrupted files)
    const maxSize = 50 * 1024 * 1024 // 50MB
    if (stat.size > maxSize) {
      logger.warn(
        `Extension file too large: ${extension.path} (${stat.size} bytes)`
      )
      return false
    }

    // For web platform, additional validation could be added here
    if (extension.platform === "web") {
      // WebAssembly validation could be added here if needed
    }

    return true
  } catch (error) {
    logger.error(`Error validating extension ${extension.name}: ${error}`)
    return false
  }
}

/**
 * Loads custom SQLite extensions into a database
 * @param db The database instance
 * @param extensions Array of extensions to load
 * @param platform The platform we're running on
 */
export function loadCustomExtensions(
  db: any,
  extensions: CustomSQLiteExtension[],
  platform: "desktop" | "cli" | "web"
): void {
  if (!extensions.length) {
    logger.debug("No custom extensions to load")
    return
  }

  logger.info(
    `Loading ${extensions.length} custom SQLite extensions for ${platform} platform`
  )

  for (const extension of extensions) {
    if (!validateSQLiteExtension(extension)) {
      logger.warn(`Skipping invalid extension: ${extension.name}`)
      continue
    }

    try {
      // Different loading mechanisms for different platforms
      if (platform === "web") {
        // Web platform has limited extension support
        // For now, we'll skip loading custom extensions on web
        logger.warn(
          `Custom extensions not supported on web platform yet: ${extension.name}`
        )
        continue
      } else {
        // Desktop and CLI platforms use loadExtension method
        if (typeof db.loadExtension === "function") {
          db.loadExtension(extension.path)
          logger.info(`✓ Loaded custom extension: ${extension.name}`)
        } else {
          logger.warn(
            `Database does not support loadExtension method for: ${extension.name}`
          )
        }
      }
    } catch (error) {
      logger.error(`Failed to load extension ${extension.name}: ${error}`)
      // Continue loading other extensions even if one fails
    }
  }
}
