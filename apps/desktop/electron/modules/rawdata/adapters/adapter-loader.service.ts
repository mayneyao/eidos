// IMPORTANT: Import env first to set SQLITE_USE_URI before better-sqlite3 is loaded
import "../../data-space/worker/sqlite-server/env"

import {
  RawDataManager,
  type RawDataAdapter,
  builtInAdapters,
} from "@eidos.space/rawdata"
import { app } from "electron"
import * as fsNode from "node:fs/promises"
import * as path from "node:path"
import { transform } from "oxc-transform"

import { Injectable } from "../../../common/di"
import { getSpacePath } from "../../../utils/paths"
import { AdapterFsService } from "./adapter-fs.service"

/**
 * Adapter Loader Service
 * Manages adapter loading, TypeScript compilation, and caching
 */
@Injectable()
export class AdapterLoaderService {
  private managers: Map<string, RawDataManager> = new Map()

  /**
   * Get or create RawDataManager for a space
   */
  async getManager(spaceId: string): Promise<RawDataManager> {
    console.log(
      "[RawData] getManager called for:",
      spaceId,
      "exists:",
      this.managers.has(spaceId)
    )

    // DEBUG: Always recreate manager to ensure latest code is used
    // Remove this in production
    this.managers.delete(spaceId)

    if (!this.managers.has(spaceId)) {
      console.log("[RawData] Creating new manager for space:", spaceId)
      const spacePath = getSpacePath(spaceId)
      console.log("[RawData] Space path:", spacePath)
      const fs = new AdapterFsService(spacePath)

      // Create bound loader function
      const loader = (fsInstance: any, filePath: string) => {
        console.log("[RawData] Custom loader called for:", filePath)
        return this.loadAdapterWithTransform(
          fsInstance as AdapterFsService,
          filePath
        )
      }

      console.log(
        "[RawData] Creating RawDataManager with custom loader:",
        !!loader
      )
      const manager = new RawDataManager(
        fs,
        "~/.eidos/.rawdata",
        loader,
        builtInAdapters
      )
      console.log("[RawData] Calling manager.loadAdapters()...")
      await manager.loadAdapters()
      console.log("[RawData] Loaded adapters:", manager.getAdapters().size)
      this.managers.set(spaceId, manager)
    }
    return this.managers.get(spaceId)!
  }

  /**
   * Clear manager cache for a space
   */
  clearManager(spaceId: string): void {
    this.managers.delete(spaceId)
  }

  /**
   * Clear all managers
   */
  clearAll(): void {
    this.managers.clear()
  }

  /**
   * Reload adapters for a space
   */
  async reloadAdapters(spaceId: string): Promise<void> {
    const manager = await this.getManager(spaceId)
    await manager.loadAdapters()
  }

  /**
   * Load adapter with oxc-transform transpilation for TypeScript files
   */
  async loadAdapterWithTransform(
    fs: AdapterFsService,
    filePath: string
  ): Promise<RawDataAdapter | null> {
    console.log("[RawData] loadAdapterWithTransform:", filePath)
    const exists = await fs.exists(filePath)
    if (!exists) {
      console.log("[RawData] File does not exist:", filePath)
      return null
    }

    if (!/\.(ts|js|mjs)$/.test(filePath)) {
      console.log("[RawData] Invalid file extension:", filePath)
      return null
    }

    try {
      // For .js/.mjs files, try direct import first
      if (!filePath.endsWith(".ts")) {
        console.log("[RawData] Loading JS file directly:", filePath)
        // Add cache-busting query param based on file mtime
        const stat = await fsNode.stat(filePath).catch(() => null)
        const mtime = stat?.mtimeMs || Date.now()
        const module = await import(`${filePath}?t=${mtime}`)
        console.log("[RawData] JS module loaded:", Object.keys(module))
        return module.default || module
      }

      // For .ts files, use oxc-transform to transpile
      console.log("[RawData] Reading TS file:", filePath)
      const content = await fs.readFile(filePath, { encoding: "utf8" })

      console.log("[RawData] Transforming with oxc-transform...")
      const result = transform(filePath, content, {
        target: "node20",
        sourcemap: false,
      })
      console.log("[RawData] Transform result length:", result.code.length)

      // Replace @eidos.space/rawdata imports with inline defineAdapter
      // defineAdapter is just: (options) => options
      const transformedCode = result.code.replace(
        /import\s*{\s*[^}]*}\s*from\s*["']@eidos\.space\/rawdata["'];?\n?/g,
        "const defineAdapter = (opts) => opts; const $ = { id: (...parts) => parts.join('_'), get: (obj, path, def) => path.split('.').reduce((o,p)=>o?.[p], obj) ?? def, string: (obj, path, def) => $.get(obj, path, def), number: (obj, path, def) => Number($.get(obj, path, def)) ?? def, fingerprint: (...pairs) => { const result = {}; for (let i = 0; i < pairs.length; i += 2) { const key = String(pairs[i]); const value = pairs[i + 1]; if (value != null) result[key] = String(value); } return result; }, has: (obj, path) => $.get(obj, path) !== undefined };\n"
      )
      // Create a temporary file with the compiled code in Electron's userData folder
      const tmpDir = path.join(app.getPath("userData"), "rawdata-cache")
      await fsNode.mkdir(tmpDir, { recursive: true })

      const hash = Buffer.from(filePath)
        .toString("base64")
        .replace(/[^a-zA-Z0-9]/g, "_")
      // Add timestamp to filename to avoid ESM cache issues when file is modified
      const stat = await fsNode.stat(filePath).catch(() => null)
      const mtime = stat?.mtimeMs || Date.now()
      const tmpFile = path.join(tmpDir, `adapter_${hash}_${mtime}.mjs`)

      await fsNode.writeFile(tmpFile, transformedCode, "utf8")
      console.log("[RawData] Written temp file:", tmpFile)

      // Clean up old temp files with same hash
      try {
        const files = await fsNode.readdir(tmpDir)
        const oldFiles = files.filter(
          (f) =>
            f.startsWith(`adapter_${hash}_`) && f !== path.basename(tmpFile)
        )
        for (const oldFile of oldFiles) {
          await fsNode.unlink(path.join(tmpDir, oldFile)).catch(() => {})
        }
        if (oldFiles.length > 0) {
          console.log("[RawData] Cleaned up old cache files:", oldFiles.length)
        }
      } catch {}

      // Import the compiled module with cache-busting query param
      const module = await import(`${tmpFile}?t=${mtime}`)
      console.log("[RawData] Imported module keys:", Object.keys(module))
      console.log("[RawData] module.default:", module.default)

      const adapter = module.default || module
      console.log("[RawData] Loaded adapter:", adapter?.meta)
      return adapter
    } catch (error) {
      console.error(`[RawData] Failed to load adapter ${filePath}:`, error)
      return null
    }
  }
}
