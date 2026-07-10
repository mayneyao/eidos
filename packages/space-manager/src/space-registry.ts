import fs from "fs"
import os from "os"
import path from "path"

import type {
  GlobalConfig,
  SpaceInfo,
  SpaceMode,
  SpacePathConflict,
  SpacesConfig,
} from "./types"

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
      const config = JSON.parse(data) as Partial<SpacesConfig>
      return {
        spaces: Array.isArray(config.spaces)
          ? config.spaces.map((space) => ({
              ...space,
              mode: space.mode === "file" ? "file" : "legacy",
            }))
          : [],
      }
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

  public getSpaceByPath(spacePath: string): SpaceInfo | null {
    const normalizedPath = this.normalizeSpacePath(spacePath)
    const spaces = this.getAllSpaces()
    return (
      spaces.find(
        (space) => this.normalizeSpacePath(space.path) === normalizedPath
      ) || null
    )
  }

  public getSpacePathConflict(spacePath: string): SpacePathConflict | null {
    const normalizedPath = this.normalizeSpacePath(spacePath)
    const spaces = this.getAllSpaces()

    for (const space of spaces) {
      const registeredPath = this.normalizeSpacePath(space.path)

      if (registeredPath === normalizedPath) {
        return { type: "same", space }
      }

      if (this.isSubPath(registeredPath, normalizedPath)) {
        return { type: "inside", space }
      }

      if (this.isSubPath(normalizedPath, registeredPath)) {
        return { type: "contains", space }
      }
    }

    return null
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

  public setSpaceVersioning(
    spaceId: string,
    versioning: {
      enabled: boolean
    }
  ): void {
    const space = this.getSpace(spaceId)
    if (!space) {
      throw new Error(`Space not found: ${spaceId}`)
    }
    space.versioning = versioning

    const config = this.loadSpacesConfig()
    config.spaces = config.spaces.map((o) => (o.id === spaceId ? space : o))
    this.saveSpacesConfig(config)
  }

  public getFirstSpace(): SpaceInfo | null {
    const spaces = this.getAllSpaces()
    return spaces.length > 0 ? spaces[0] : null
  }

  public getFirstValidSpace(): SpaceInfo | null {
    return (
      this.getAllSpaces().find((space) => this.validateSpace(space.id)) ?? null
    )
  }

  /**
   * Get the last opened space
   */
  public getLastOpenedSpace(): SpaceInfo | null {
    const globalConfig = this.loadGlobalConfig()
    if (!globalConfig.lastOpenedSpace) {
      return this.getFirstValidSpace()
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
      provider?: string
      mode?: SpaceMode
    } = {}
  ): SpaceInfo {
    if (!fs.existsSync(spacePath)) {
      throw new Error(`Path does not exist: ${spacePath}`)
    }
    if (!fs.statSync(spacePath).isDirectory()) {
      throw new Error(`Space path is not a directory: ${spacePath}`)
    }

    const normalizedPath = this.normalizeSpacePath(spacePath)
    const pathConflict = this.getSpacePathConflict(normalizedPath)
    if (pathConflict) {
      const error = new Error(this.getPathConflictMessage(pathConflict))
      ;(
        error as Error & {
          existingSpace?: SpaceInfo
          pathConflictType?: SpacePathConflict["type"]
        }
      ).existingSpace = pathConflict.space
      ;(
        error as Error & {
          existingSpace?: SpaceInfo
          pathConflictType?: SpacePathConflict["type"]
        }
      ).pathConflictType = pathConflict.type
      throw error
    }

    // generate space id based on folder name
    const folderName = path.basename(normalizedPath)
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
        (folderName
          ? folderName.charAt(0).toUpperCase() + folderName.slice(1)
          : "Space"),
      path: normalizedPath,
      mode:
        options.mode ??
        (options.remoteUrl ? "legacy" : this.detectSpaceMode(normalizedPath)),
      sync: options.remoteUrl
        ? {
            enabled: true,
            remote: options.remoteUrl,
            provider: options.provider,
          }
        : undefined,
      versioning:
        options.remoteUrl || this.hasGraftRepository(normalizedPath)
          ? { enabled: true }
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
      globalConfig.lastOpenedSpace = this.getFirstValidSpace()?.id
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
    const sanitized = id
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48)
      .replace(/-+$/g, "")
    return sanitized || "space"
  }

  protected normalizeSpacePath(spacePath: string): string {
    const resolvedPath = path.resolve(spacePath)
    try {
      return fs.realpathSync.native(resolvedPath)
    } catch {
      return resolvedPath
    }
  }

  protected hasGraftRepository(spacePath: string): boolean {
    return fs.existsSync(path.join(spacePath, ".eidos", ".graft"))
  }

  protected detectSpaceMode(spacePath: string): SpaceMode {
    const legacyDatabase = path.join(spacePath, ".eidos", "db.sqlite3")
    return fs.existsSync(legacyDatabase) || this.hasGraftRepository(spacePath)
      ? "legacy"
      : "file"
  }

  protected isSubPath(parentPath: string, childPath: string): boolean {
    const relativePath = path.relative(parentPath, childPath)
    return (
      !!relativePath &&
      relativePath !== ".." &&
      !relativePath.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relativePath)
    )
  }

  protected getPathConflictMessage(conflict: SpacePathConflict): string {
    if (conflict.type === "same") {
      return `Path is already registered as space "${conflict.space.name}"`
    }

    if (conflict.type === "inside") {
      return `Path is inside registered space "${conflict.space.name}"`
    }

    return `Path contains registered space "${conflict.space.name}"`
  }

  public validateSpace(spaceId: string): boolean {
    const space = this.getSpace(spaceId)
    if (!space) {
      return false
    }

    try {
      if (!fs.existsSync(space.path)) {
        return false
      }

      if (space.mode === "file") {
        return fs.statSync(space.path).isDirectory()
      }

      if (space.sync?.enabled || space.versioning?.enabled) {
        // check is .eidos/.graft exists
        const graftPath = path.join(space.path, ".eidos", ".graft")
        return fs.existsSync(graftPath)
      }
      // Check for database in the .eidos subdirectory structure
      const dbPath = path.join(space.path, ".eidos", "db.sqlite3")
      return fs.existsSync(dbPath)
    } catch {
      return false
    }
  }
}

export function getSpaceRegistry(): SpaceRegistry {
  return SpaceRegistry.getInstance()
}
