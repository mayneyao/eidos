/**
 * Adapter Parser
 *
 * Only supports TypeScript/JavaScript Adapters (defineAdapter)
 * YAML support has been removed
 */

import type { OpenDataAdapter, MatchedAdapter } from "./types.js"

export interface FileSystem {
  readFile(path: string): Promise<Uint8Array>
  readFile(path: string, options: { encoding: string }): Promise<string>
  readdir(path: string, options?: { recursive?: boolean }): Promise<string[]>
  exists(path: string): Promise<boolean>
}

/**
 * Check if a URL matches an adapter domain
 */
export function isDomainMatch(url: string, domain: string): boolean {
  try {
    const urlObj = new URL(url)
    const hostname = urlObj.hostname

    if (hostname === domain) return true

    if (domain.startsWith("*.")) {
      const suffix = domain.slice(2)
      return hostname.endsWith(suffix)
    }

    if (hostname.endsWith(`.${domain}`)) return true

    return false
  } catch {
    return false
  }
}

/**
 * Find matching adapters for a given URL
 */
export function findMatchingAdapters(
  url: string,
  adapters: Map<string, OpenDataAdapter>
): MatchedAdapter[] {
  const matches: MatchedAdapter[] = []

  for (const [filePath, adapter] of adapters.entries()) {
    if (isDomainMatch(url, adapter.meta.domain)) {
      matches.push({
        site: adapter.meta.site,
        name: adapter.meta.name,
        description: adapter.meta.description,
        domain: adapter.meta.domain,
        adapter,
        filePath,
      })
    }
  }

  return matches
}

/**
 * Load adapter from file
 * Only supports .ts, .js, .mjs
 */
export async function loadAdapter(
  fs: FileSystem,
  filePath: string
): Promise<OpenDataAdapter | null> {
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
    // const content = await fs.readFile(filePath, { encoding: "utf8" })
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
): Promise<Map<string, OpenDataAdapter>> {
  const adapters = new Map<string, OpenDataAdapter>()

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

/**
 * Group adapters by site
 */
export function groupAdaptersBySite(
  adapters: MatchedAdapter[]
): Map<string, MatchedAdapter[]> {
  const grouped = new Map<string, MatchedAdapter[]>()

  for (const adapter of adapters) {
    const site = adapter.site
    if (!grouped.has(site)) {
      grouped.set(site, [])
    }
    grouped.get(site)!.push(adapter)
  }

  return grouped
}
