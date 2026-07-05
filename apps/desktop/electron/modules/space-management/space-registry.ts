/**
 * Space Registry - Extended with Electron-specific migration logic
 * DI-compatible version with @Injectable
 */

import { app } from "electron"
import fs from "fs"
import path from "path"
import { Injectable } from "../../common/di"
import {
  SpaceRegistry as BaseSpaceRegistry,
  type SpaceInfo,
  type SpacesConfig,
  type GlobalConfig,
} from "@eidos.space/space-manager"
import { getConfigManager } from "../config/config-manager"

export type { SpaceInfo, SpacesConfig, GlobalConfig }

@Injectable()
export class SpaceRegistry extends BaseSpaceRegistry {
  constructor() {
    super()
  }

  public override getAllSpaces(): SpaceInfo[] {
    return super
      .getAllSpaces()
      .map((space) => this.withLegacyGraftSync(space))
  }

  public override getSpace(id: string): SpaceInfo | null {
    const space = super.getSpace(id)
    return this.withLegacyGraftSync(space)
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
   */
  async migrateFromLegacyConfig(): Promise<void> {
    const existingSpaces = this.getAllSpaces()
    if (existingSpaces.length > 0) {
      return
    }

    const legacyConfigPath = path.join(app.getPath("userData"), "config.json")
    if (!fs.existsSync(legacyConfigPath)) {
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
        const eidosDir = path.join(oldSpacePath, ".eidos")
        const newDbPath = path.join(eidosDir, "db.sqlite3")
        const oldFilesPath = path.join(oldSpacePath, "files")
        const newFilesPath = path.join(eidosDir, "files")
        const hasLegacyGraftState = this.hasLegacyGraftState(oldSpacePath)
        const hasMigratableDatabase =
          fs.existsSync(oldDbPath) || fs.existsSync(newDbPath)

        if (hasMigratableDatabase || hasLegacyGraftState) {
          const spacePath = oldSpacePath

          fs.mkdirSync(eidosDir, { recursive: true })
          fs.mkdirSync(newFilesPath, { recursive: true })

          if (fs.existsSync(oldDbPath) && !fs.existsSync(newDbPath)) {
            fs.copyFileSync(oldDbPath, newDbPath)
            console.log(`Migrated database: ${oldDbPath} -> ${newDbPath}`)
          }

          if (fs.existsSync(oldFilesPath)) {
            this.copyDirectoryRecursive(oldFilesPath, newFilesPath)
            console.log(`Migrated files: ${oldFilesPath} -> ${newFilesPath}`)
          }

          const space = this.registerSpace(spacePath, {
            customName: folder.charAt(0).toUpperCase() + folder.slice(1),
          })
          if (hasLegacyGraftState) {
            this.setSpaceSync(space.id, {
              enabled: true,
              remote: "",
              provider: legacyConfig.sync?.defaultProvider,
            })
          }
          migratedSpaces.push(space)
        }
      }

      if (migratedSpaces.length === 0) {
        await this.createDefaultSpace()
        return
      }

      this.setLastOpenedSpace(migratedSpaces[0].id)
      console.log(`Migrated ${migratedSpaces.length} spaces from legacy config`)
    } catch (error) {
      console.error("Error migrating from legacy config:", error)
      await this.createDefaultSpace()
    }
  }

  /**
   * Create a default space for fresh installations
   */
  private async createDefaultSpace(): Promise<void> {
    const defaultSpacePath = path.join(
      app.getPath("userData"),
      "spaces",
      "default"
    )

    fs.mkdirSync(defaultSpacePath, { recursive: true })

    const space = this.registerSpace(defaultSpacePath, {
      customName: "Default",
    })
    this.setLastOpenedSpace(space.id)

    console.log("Created default space")
  }

  private hasLegacyGraftState(spacePath: string) {
    const eidosDirPath = path.join(spacePath, ".eidos")
    const legacyGraftDirPath = path.join(eidosDirPath, ".graft")
    const legacyGraftConfigPath = path.join(eidosDirPath, "graft.toml")

    return (
      fs.existsSync(legacyGraftDirPath) ||
      fs.existsSync(legacyGraftConfigPath)
    )
  }

  private withLegacyGraftSync<T extends SpaceInfo | null>(space: T): T {
    if (!space || space.sync?.enabled || !this.hasLegacyGraftState(space.path)) {
      return space
    }

    return {
      ...space,
      sync: {
        ...space.sync,
        enabled: true,
        remote: space.sync?.remote || "",
      },
    } as T
  }
}

/**
 * Resolve which space to open on app startup
 */
export function resolveStartupSpace(
  protocolSpaceId: string | null,
  registry: SpaceRegistry
): string | undefined {
  const configManager = getConfigManager()

  let spaceId: string | undefined

  if (protocolSpaceId) {
    if (registry.validateSpace(protocolSpaceId)) {
      spaceId = protocolSpaceId
      console.log("Opening space from protocol URL:", spaceId)
      configManager.setLastOpenedSpace(spaceId)
    } else {
      console.warn(`Space from protocol URL not found: ${protocolSpaceId}`)
      spaceId = configManager.getLastOpenedSpace()
    }
  } else {
    spaceId = configManager.getLastOpenedSpace()
  }

  if (!spaceId) {
    const firstSpace = registry.getFirstSpace()
    spaceId = firstSpace?.id

    if (spaceId) {
      configManager.setLastOpenedSpace(spaceId)
    }
  }

  if (spaceId && !registry.validateSpace(spaceId)) {
    console.warn(
      `Space ${spaceId} is invalid, falling back to first available space`
    )
    const firstSpace = registry.getFirstSpace()
    spaceId = firstSpace?.id
    if (spaceId) {
      configManager.setLastOpenedSpace(spaceId)
    }
  }

  return spaceId
}
