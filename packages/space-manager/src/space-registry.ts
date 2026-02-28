import fs from "fs"
import os from "os"
import path from "path"

import type { GlobalConfig, SpaceInfo, SpacesConfig } from "./types"

export class SpaceRegistry {
  protected eidosDir: string
  protected spacesConfigPath: string
  protected globalConfigPath: string

  protected constructor() {
    this.eidosDir = path.join(os.homedir(), ".eidos")
    this.spacesConfigPath = path.join(this.eidosDir, "spaces.json")
    this.globalConfigPath = path.join(this.eidosDir, "config.json")
  }

  private static instance: SpaceRegistry

  public static getInstance(): SpaceRegistry {
    if (!SpaceRegistry.instance) {
      SpaceRegistry.instance = new SpaceRegistry()
    }
    return SpaceRegistry.instance
  }

  /**
   * Ensure .eidos directory exists
   */
  protected ensureEidosDir(): void {
    if (!fs.existsSync(this.eidosDir)) {
      fs.mkdirSync(this.eidosDir, { recursive: true })
    }
  }

  protected saveSpacesConfig(config: SpacesConfig): void {
    this.ensureEidosDir()
    fs.writeFileSync(this.spacesConfigPath, JSON.stringify(config, null, 2))
  }

  /**
   * Save global configuration
   * Merges with existing config to preserve other settings (e.g., sync, ai, theme)
   */
  protected saveGlobalConfig(config: GlobalConfig): void {
    this.ensureEidosDir()
    // Load existing config to preserve other settings
    const existingConfig = this.loadGlobalConfig()
    const mergedConfig = { ...existingConfig, ...config }
    fs.writeFileSync(
      this.globalConfigPath,
      JSON.stringify(mergedConfig, null, 2)
    )
  }

  protected loadSpacesConfig(): SpacesConfig {
    if (!fs.existsSync(this.spacesConfigPath)) {
      return { spaces: [] }
    }

    try {
      const data = fs.readFileSync(this.spacesConfigPath, "utf-8")
      return JSON.parse(data)
    } catch (error) {
      console.error("Error loading spaces config:", error)
      return { spaces: [] }
    }
  }

  protected loadGlobalConfig(): GlobalConfig {
    if (!fs.existsSync(this.globalConfigPath)) {
      return {}
    }

    try {
      const data = fs.readFileSync(this.globalConfigPath, "utf-8")
      return JSON.parse(data)
    } catch (error) {
      console.error("Error loading global config:", error)
      return {}
    }
  }

  public getAllSpaces(): SpaceInfo[] {
    const config = this.loadSpacesConfig()
    return config.spaces
  }

  public getSpace(id: string): SpaceInfo | null {
    const spaces = this.getAllSpaces()
    return spaces.find((space) => space.id === id) || null
  }

  public setSpaceSync(
    spaceId: string,
    sync: {
      enabled: boolean
      remote: string
      volumeId?: string
      provider?: string
    }
  ): void {
    const space = this.getSpace(spaceId)
    if (!space) {
      throw new Error(`Space not found: ${spaceId}`)
    }
    space.sync = sync

    console.log("setSpaceSync", spaceId, sync)
    const config = this.loadSpacesConfig()
    config.spaces = config.spaces.map((o) => (o.id === spaceId ? space : o))
    console.log("config", config.spaces)
    this.saveSpacesConfig(config)
  }

  public getFirstSpace(): SpaceInfo | null {
    const spaces = this.getAllSpaces()
    return spaces.length > 0 ? spaces[0] : null
  }

  /**
   * Get the last opened space
   */
  public getLastOpenedSpace(): SpaceInfo | null {
    const globalConfig = this.loadGlobalConfig()
    if (!globalConfig.lastOpenedSpace) {
      return this.getFirstSpace()
    }
    return this.getSpace(globalConfig.lastOpenedSpace)
  }

  public setLastOpenedSpace(spaceId: string): void {
    const space = this.getSpace(spaceId)
    if (!space) {
      throw new Error(`Space not found: ${spaceId}`)
    }

    const globalConfig = this.loadGlobalConfig()
    globalConfig.lastOpenedSpace = spaceId
    this.saveGlobalConfig(globalConfig)
  }

  public registerSpace(
    spacePath: string,
    options: {
      customName?: string
      remoteUrl?: string
    } = {}
  ): SpaceInfo {
    if (!fs.existsSync(spacePath)) {
      throw new Error(`Path does not exist: ${spacePath}`)
    }

    // generate space id based on folder name
    const folderName = path.basename(spacePath)
    let spaceId = this.sanitizeId(folderName)

    // handle id conflict
    let counter = 1
    const originalId = spaceId
    while (this.getSpace(spaceId)) {
      spaceId = `${originalId}-${counter}`
      counter++
    }

    const space: SpaceInfo = {
      id: spaceId,
      name:
        options.customName ||
        folderName.charAt(0).toUpperCase() + folderName.slice(1),
      path: spacePath,
      sync: options.remoteUrl
        ? {
            enabled: true,
            remote: options.remoteUrl,
          }
        : undefined,
    }

    const config = this.loadSpacesConfig()
    config.spaces.push(space)
    this.saveSpacesConfig(config)

    return space
  }

  public removeSpace(spaceId: string): boolean {
    const config = this.loadSpacesConfig()
    const index = config.spaces.findIndex((space) => space.id === spaceId)

    if (index === -1) {
      return false
    }

    config.spaces.splice(index, 1)
    this.saveSpacesConfig(config)

    const globalConfig = this.loadGlobalConfig()
    if (globalConfig.lastOpenedSpace === spaceId) {
      globalConfig.lastOpenedSpace =
        config.spaces.length > 0 ? config.spaces[0].id : undefined
      this.saveGlobalConfig(globalConfig)
    }

    return true
  }

  public updateSpace(
    spaceId: string,
    updates: Partial<Omit<SpaceInfo, "id">>
  ): boolean {
    const config = this.loadSpacesConfig()
    const space = config.spaces.find((s) => s.id === spaceId)

    if (!space) {
      return false
    }

    Object.assign(space, updates)
    this.saveSpacesConfig(config)
    return true
  }

  protected sanitizeId(id: string): string {
    return id
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
  }

  public validateSpace(spaceId: string): boolean {
    const space = this.getSpace(spaceId)
    if (!space) {
      return false
    }

    if (!fs.existsSync(space.path)) {
      return false
    }

    if (space.sync?.enabled) {
      // check is .eidos/.graft exists
      const graftPath = path.join(space.path, ".eidos", ".graft")
      return fs.existsSync(graftPath)
    }
    // Check for database in the .eidos subdirectory structure
    const dbPath = path.join(space.path, ".eidos", "db.sqlite3")
    return fs.existsSync(dbPath)
  }
}

export function getSpaceRegistry(): SpaceRegistry {
  return SpaceRegistry.getInstance()
}
