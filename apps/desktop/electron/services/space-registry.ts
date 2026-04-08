import { app } from "electron"
import fs from "fs"
import path from "path"
import {
  SpaceRegistry as BaseSpaceRegistry,
  getSpaceRegistry as getBaseSpaceRegistry,
  type SpaceInfo,
  type SpacesConfig,
  type GlobalConfig,
} from "@eidos.space/space-manager"

export type { SpaceInfo, SpacesConfig, GlobalConfig }

/**
 * Extended SpaceRegistry with Electron-specific migration logic
 */
export class SpaceRegistry extends BaseSpaceRegistry {
  private static electronInstance: SpaceRegistry

  private constructor() {
    super()
  }

  public static getInstance(): SpaceRegistry {
    if (!SpaceRegistry.electronInstance) {
      SpaceRegistry.electronInstance = new SpaceRegistry()
    }
    return SpaceRegistry.electronInstance
  }

  /**
   * Copy directory recursively
   */
  private copyDirectoryRecursive(src: string, dest: string): void {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true })
    }

    const entries = fs.readdirSync(src, { withFileTypes: true })

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name)
      const destPath = path.join(dest, entry.name)

      if (entry.isDirectory()) {
        this.copyDirectoryRecursive(srcPath, destPath)
      } else {
        fs.copyFileSync(srcPath, destPath)
      }
    }
  }

  /**
   * Migrate from legacy Electron config to new space-manager structure
   * This is Electron-specific and not in the base SpaceRegistry
   */
  public async migrateFromLegacyConfig(): Promise<void> {
    // Check if new config already exists using base class method
    const existingSpaces = this.getAllSpaces()
    if (existingSpaces.length > 0) {
      return
    }

    // Read legacy config
    const legacyConfigPath = path.join(app.getPath("userData"), "config.json")
    if (!fs.existsSync(legacyConfigPath)) {
      // Fresh installation, create default space
      await this.createDefaultSpace()
      return
    }

    try {
      const legacyConfig = JSON.parse(
        fs.readFileSync(legacyConfigPath, "utf-8")
      )
      const dataFolder = legacyConfig.dataFolder

      if (!dataFolder) {
        await this.createDefaultSpace()
        return
      }

      // Scan spaces directory
      const spacesDir = path.join(dataFolder, "spaces")
      if (!fs.existsSync(spacesDir)) {
        await this.createDefaultSpace()
        return
      }

      const migratedSpaces: SpaceInfo[] = []
      const folders = fs.readdirSync(spacesDir)

      for (const folder of folders) {
        const oldSpacePath = path.join(spacesDir, folder)
        const oldDbPath = path.join(oldSpacePath, "db.sqlite3")
        const oldFilesPath = path.join(oldSpacePath, "files")

        // Only migrate spaces that have database files
        if (fs.existsSync(oldDbPath)) {
          // Keep the same space path (in-place migration)
          const spacePath = oldSpacePath
          const eidosDir = path.join(spacePath, ".eidos")
          const newDbPath = path.join(eidosDir, "db.sqlite3")
          const newFilesPath = path.join(eidosDir, "files")

          // Create new directory structure within the existing space
          fs.mkdirSync(eidosDir, { recursive: true })
          fs.mkdirSync(newFilesPath, { recursive: true })

          // Migrate database file
          if (fs.existsSync(oldDbPath)) {
            fs.copyFileSync(oldDbPath, newDbPath)
            console.log(`Migrated database: ${oldDbPath} -> ${newDbPath}`)
          }

          // Migrate files directory
          if (fs.existsSync(oldFilesPath)) {
            this.copyDirectoryRecursive(oldFilesPath, newFilesPath)
            console.log(`Migrated files: ${oldFilesPath} -> ${newFilesPath}`)
          }

          // Register the migrated space using base class method
          const space = this.registerSpace(spacePath, {
            customName: folder.charAt(0).toUpperCase() + folder.slice(1),
          })
          migratedSpaces.push(space)
        }
      }

      if (migratedSpaces.length === 0) {
        await this.createDefaultSpace()
        return
      }

      // Set the first migrated space as the last opened
      this.setLastOpenedSpace(migratedSpaces[0].id)

      console.log(`Migrated ${migratedSpaces.length} spaces from legacy config`)
    } catch (error) {
      console.error("Error migrating from legacy config:", error)
      await this.createDefaultSpace()
    }
  }

  /**
   * Create a default space for fresh installations
   * This is Electron-specific
   */
  private async createDefaultSpace(): Promise<void> {
    const defaultSpacePath = path.join(
      app.getPath("userData"),
      "spaces",
      "default"
    )

    // Ensure directory exists
    fs.mkdirSync(defaultSpacePath, { recursive: true })

    // Register the default space using base class method
    const space = this.registerSpace(defaultSpacePath, {
      customName: "Default",
    })
    this.setLastOpenedSpace(space.id)

    console.log("Created default space")
  }
}

export function getSpaceRegistry(): SpaceRegistry {
  return SpaceRegistry.getInstance()
}

export async function migrateFromLegacyConfig(): Promise<void> {
  const registry = getSpaceRegistry()
  await registry.migrateFromLegacyConfig()
}
