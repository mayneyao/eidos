/**
 * Adapter Definition Helper
 *
 * Usage:
 * ```ts
 * export default defineAdapter({
 *   meta: { site: 'weread', name: 'shelf', domain: 'weread.qq.com' },
 *   protocol: { strategy: 'cookie', browser: true },
 *
 *   async fetch(ctx) {
 *     // Returns RawEntity[]
 *   },
 *
 *   transform(raw) {
 *     // Returns TransformResult
 *   },
 * })
 * ```
 */

import type {
  RawDataAdapter,
  FetchContext,
  RawEntity,
  TransformResult,
} from "./types.js"

/**
 * Transform Helpers
 */
export const $ = {
  /** Get nested value */
  get: <T = any>(obj: any, path: string, defaultValue?: T): T | undefined => {
    const parts = path
      .replace(/^\$\.?/, "")
      .split(/\.|\[(\d+)\]/)
      .filter(Boolean)
    let current = obj

    for (const part of parts) {
      if (current == null) return defaultValue
      const index = parseInt(part, 10)
      current =
        !isNaN(index) && Array.isArray(current) ? current[index] : current[part]
    }

    return current !== undefined ? current : defaultValue
  },

  /** Get string value */
  string: (obj: any, path: string, defaultValue = ""): string => {
    const value = $.get(obj, path)
    return value != null ? String(value) : defaultValue
  },

  /** Get number value */
  number: (obj: any, path: string, defaultValue = 0): number => {
    const value = $.get(obj, path)
    const num = Number(value)
    return isNaN(num) ? defaultValue : num
  },

  /** Parse date to timestamp */
  date: (obj: any, path: string): number | undefined => {
    const value = $.get<string>(obj, path)
    if (!value) return undefined
    const date = new Date(value)
    return isNaN(date.getTime()) ? undefined : Math.floor(date.getTime() / 1000)
  },

  /** Generate ID */
  id: (prefix: string, rawId: string | number): string => {
    return `${prefix}-${rawId}`
  },

  /** Generate fingerprint object */
  fingerprint: (
    ...pairs: (string | number | undefined)[]
  ): Record<string, string> => {
    const result: Record<string, string> = {}
    for (let i = 0; i < pairs.length; i += 2) {
      const key = String(pairs[i])
      const value = pairs[i + 1]
      if (value != null) result[key] = String(value)
    }
    return result
  },

  /** Check if value exists */
  has: (obj: any, path: string): boolean => {
    return $.get(obj, path) !== undefined
  },
}

/** Transform helpers alias */
export const helpers = $

/**
 * Define Adapter
 */
export function defineAdapter<T = Record<string, any>>(options: {
  meta: RawDataAdapter["meta"]
  protocol: RawDataAdapter["protocol"]
  args?: {
    [K in keyof T]: {
      type: "string" | "int" | "float" | "bool"
      required?: boolean
      default?: T[K]
      description?: string
    }
  }
  fetch: (ctx: FetchContext & { args: T }) => Promise<RawEntity[]>
  transform?: (raw: RawEntity) => TransformResult | Promise<TransformResult>
  queries?: Record<string, string>
  sync?: RawDataAdapter["sync"]
}): RawDataAdapter {
  // Runtime validation
  if (!options.meta?.site) throw new Error("meta.site is required")
  if (!options.meta?.name) throw new Error("meta.name is required")
  if (!options.meta?.domain) throw new Error("meta.domain is required")
  if (!options.protocol?.strategy)
    throw new Error("protocol.strategy is required")
  if (!options.fetch) throw new Error("fetch is required")

  return {
    meta: options.meta,
    protocol: options.protocol,
    args: options.args as any,
    fetch: options.fetch as any,
    transform: options.transform,
    queries: options.queries,
    sync: options.sync,
  }
}

/**
 * Get raw data only, no transformation
 */
export function defineRawAdapter(
  options: Omit<Parameters<typeof defineAdapter>[0], "transform">
): RawDataAdapter {
  return defineAdapter(options as any)
}

/**
 * Cookie authentication (browser) preset
 */
export function defineCookieAdapter<T = Record<string, any>>(
  options: Omit<Parameters<typeof defineAdapter<T>>[0], "protocol"> & {
    protocol?: Partial<RawDataAdapter["protocol"]>
  }
): RawDataAdapter {
  return defineAdapter({
    ...options,
    protocol: {
      strategy: "cookie",
      browser: true,
      ...options.protocol,
    },
  } as any)
}

/**
 * Public API preset
 */
export function definePublicAdapter<T = Record<string, any>>(
  options: Omit<Parameters<typeof defineAdapter<T>>[0], "protocol"> & {
    protocol?: Partial<RawDataAdapter["protocol"]>
  }
): RawDataAdapter {
  return defineAdapter({
    ...options,
    protocol: {
      strategy: "public",
      ...options.protocol,
    },
  } as any)
}
