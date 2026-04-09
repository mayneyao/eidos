/**
 * RawData Manager
 *
 * Manages adapters stored in <space>/.eidos/.rawdata/
 * Only supports TypeScript/JavaScript adapters (defineAdapter)
 */

import type { RawDataAdapter, MatchedAdapter } from "./types.js"
import { findMatchingAdapters, loadAdapter } from "./parser.js"

// Re-export FileSystem interface
export interface FileSystem {
  readFile(path: string): Promise<Uint8Array>
  readFile(path: string, options: { encoding: string }): Promise<string>
  writeFile?(
    path: string,
    data: string | Uint8Array,
    encoding?: string
  ): Promise<void>
  readdir(path: string, options?: { recursive?: boolean }): Promise<string[]>
  exists(path: string): Promise<boolean>
}

/**
 * Custom adapter loader function type
 */
export type AdapterLoader = (
  fs: FileSystem,
  filePath: string
) => Promise<RawDataAdapter | null>

/**
 * RawData Manager
 */
export class RawDataManager {
  private adapters: Map<string, RawDataAdapter> = new Map()
  private adaptersDir: string
  private fs: FileSystem
  private customLoader?: AdapterLoader

  constructor(
    fs: FileSystem,
    adaptersDir: string = "~/.eidos/.rawdata",
    loader?: AdapterLoader
  ) {
    this.fs = fs
    this.adaptersDir = adaptersDir
    this.customLoader = loader
    console.log("[RawDataManager] Constructor called, customLoader:", !!loader)
  }

  /**
   * Load all adapters from the adapters directory
   */
  async loadAdapters(): Promise<Map<string, RawDataAdapter>> {
    this.adapters.clear()
    console.log(
      "[RawDataManager] loadAdapters called, customLoader exists:",
      !!this.customLoader
    )

    try {
      const exists = await this.fs.exists(this.adaptersDir)
      if (!exists) {
        console.log(
          "[RawDataManager] adaptersDir does not exist:",
          this.adaptersDir
        )
        return this.adapters
      }

      const files = await this.fs.readdir(this.adaptersDir, {
        recursive: true,
      })
      console.log("[RawDataManager] Found files:", files.length)

      for (const file of files) {
        // Only load .ts, .js, .mjs files
        if (/\.(ts|js|mjs)$/.test(file) && !file.endsWith(".d.ts")) {
          try {
            const fullPath = `${this.adaptersDir}/${file}`
            console.log("[RawDataManager] Loading adapter:", {
              file,
              fullPath,
              hasCustomLoader: !!this.customLoader,
            })

            const loader = this.customLoader || loadAdapter
            console.log(
              "[RawDataManager] Using loader:",
              this.customLoader ? "custom" : "default",
              "loader type:",
              typeof loader
            )
            const adapter = await loader(this.fs, fullPath)
            if (adapter) {
              console.log("[RawDataManager] Loaded:", {
                site: adapter.meta.site,
                name: adapter.meta.name,
                domain: adapter.meta.domain,
              })
              this.adapters.set(fullPath, adapter)
            }
          } catch (error) {
            console.error(`Failed to load adapter ${file}:`, error)
          }
        }
      }
    } catch (error) {
      console.error("Failed to load adapters:", error)
    }

    return this.adapters
  }

  /**
   * Get all loaded adapters
   */
  getAdapters(): Map<string, RawDataAdapter> {
    return this.adapters
  }

  /**
   * Find adapters matching a URL
   */
  findAdaptersForUrl(url: string): MatchedAdapter[] {
    return findMatchingAdapters(url, this.adapters)
  }

  /**
   * Get adapter by file path
   *
   * Backwards compatibility: automatically converts .yaml/.yml paths to .ts
   */
  async getAdapter(filePath: string): Promise<RawDataAdapter | undefined> {
    // Try direct match
    if (this.adapters.has(filePath)) {
      return this.adapters.get(filePath)
    }

    // Try with adaptersDir prefix
    const fullPath = `${this.adaptersDir}/${filePath}`
    if (this.adapters.has(fullPath)) {
      return this.adapters.get(fullPath)
    }

    // Backwards compatibility: convert .yaml/.yml to .ts
    if (filePath.endsWith(".yaml") || filePath.endsWith(".yml")) {
      const tsPath = filePath.replace(/\.ya?ml$/, ".ts")
      if (this.adapters.has(tsPath)) {
        return this.adapters.get(tsPath)
      }
      const fullTsPath = `${this.adaptersDir}/${tsPath}`
      if (this.adapters.has(fullTsPath)) {
        return this.adapters.get(fullTsPath)
      }
    }

    // Try site/name format (e.g., "weread/shelf")
    const [site, name] = filePath.split("/")
    if (site && name) {
      for (const [, adapter] of this.adapters.entries()) {
        if (adapter.meta.site === site && adapter.meta.name === name) {
          return adapter
        }
      }
    }

    return undefined
  }

  /**
   * Add or update an adapter
   */
  async saveAdapter(filePath: string, code: string): Promise<void> {
    const fullPath = `${this.adaptersDir}/${filePath}`
    await this.fs.writeFile?.(fullPath, code, "utf8")

    // Reload adapter
    const loader = this.customLoader || loadAdapter
    const adapter = await loader(this.fs, fullPath)
    if (adapter) {
      this.adapters.set(fullPath, adapter)
    }
  }

  /**
   * Delete an adapter
   */
  async deleteAdapter(filePath: string): Promise<void> {
    const fullPath = `${this.adaptersDir}/${filePath}`
    // Note: FileSystem interface doesn't have unlink, assume caller handles file deletion
    this.adapters.delete(fullPath)
  }

  /**
   * Get all unique domains from loaded adapters
   */
  getDomains(): string[] {
    const domains = new Set<string>()
    for (const adapter of this.adapters.values()) {
      domains.add(adapter.meta.domain)
    }
    return Array.from(domains)
  }

  /**
   * Get all unique sites from loaded adapters
   */
  getSites(): string[] {
    const sites = new Set<string>()
    for (const adapter of this.adapters.values()) {
      sites.add(adapter.meta.site)
    }
    return Array.from(sites)
  }
}
