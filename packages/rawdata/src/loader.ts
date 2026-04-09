/**
 * Adapter Loader
 *
 * Supports loading TypeScript/JavaScript Adapters (defineAdapter)
 */

import type { RawDataAdapter } from "./types.js"

export interface FileSystem {
  readFile(path: string): Promise<Uint8Array>
  readFile(path: string, options: { encoding: string }): Promise<string>
  readdir(path: string, options?: { recursive?: boolean }): Promise<string[]>
  exists(path: string): Promise<boolean>
}

/**
 * Load adapter from file
 * Only supports .ts, .js, .mjs
 */
export async function loadAdapter(
  fs: FileSystem,
  filePath: string
): Promise<RawDataAdapter | null> {
  const exists = await fs.exists(filePath)
  if (!exists) return null

  if (!/\.(ts|js|mjs)$/.test(filePath)) {
    return null
  }

  try {
    // Production: Load pre-compiled .js file
    const jsPath = filePath.replace(/\.ts$/, ".js")
    if (await fs.exists(jsPath)) {
      const module = await import(jsPath)
      return module.default || module
    }

    // Development: Try loading .ts (requires ts-node or esbuild-register)
    throw new Error(
      `TypeScript files must be compiled to JavaScript before loading. ` +
        `Please compile ${filePath} to ${jsPath}`
    )
  } catch (error) {
    console.error(`Failed to load adapter ${filePath}:`, error)
    return null
  }
}

/**
 * Find all adapters in directory
 */
export async function findAdapters(
  fs: FileSystem,
  dir: string
): Promise<Map<string, RawDataAdapter>> {
  const adapters = new Map<string, RawDataAdapter>()

  try {
    const exists = await fs.exists(dir)
    if (!exists) return adapters

    const files = await fs.readdir(dir, { recursive: true })

    for (const file of files) {
      // Only process .ts, .js, .mjs, skip .d.ts
      if (/\.(ts|js|mjs)$/.test(file) && !file.endsWith(".d.ts")) {
        const filePath = `${dir}/${file}`
        const adapter = await loadAdapter(fs, filePath)
        if (adapter) {
          adapters.set(filePath, adapter)
        }
      }
    }
  } catch (error) {
    console.error("Failed to find adapters:", error)
  }

  return adapters
}
