export interface BurstCacheOptions<Value> {
  ttlMs: number
  maxEntries: number
  now?: () => number
  cacheValue?: (value: Value) => boolean
}

interface BurstCacheEntry<Value> {
  promise: Promise<Value>
  /** `null` while the authoritative load is still in flight. */
  expiresAt: number | null
}

/**
 * Coalesces concurrent and immediately repeated authoritative lookups.
 *
 * The cache is deliberately process-local and disposable. Rejections are never
 * cached, entries expire after a successful load, and the fixed entry cap keeps
 * attacker-controlled keys from growing an isolate without bound.
 */
export function createBurstCachedLoader<Input, Value>(
  load: (input: Input) => Promise<Value>,
  cacheKey: (input: Input) => string | Promise<string>,
  options: BurstCacheOptions<Value>
): (input: Input) => Promise<Value> {
  if (!Number.isSafeInteger(options.ttlMs) || options.ttlMs <= 0) {
    throw new TypeError("Burst cache ttlMs must be a positive integer")
  }
  if (!Number.isSafeInteger(options.maxEntries) || options.maxEntries <= 0) {
    throw new TypeError("Burst cache maxEntries must be a positive integer")
  }
  const now = options.now ?? Date.now
  const cacheValue = options.cacheValue ?? (() => true)
  const entries = new Map<string, BurstCacheEntry<Value>>()

  return async (input) => {
    const key = await cacheKey(input)
    const currentTime = now()
    const existing = entries.get(key)
    if (
      existing !== undefined &&
      (existing.expiresAt === null || existing.expiresAt > currentTime)
    ) {
      entries.delete(key)
      entries.set(key, existing)
      return existing.promise
    }
    if (existing !== undefined) entries.delete(key)
    pruneExpired(entries, currentTime)

    const entry: BurstCacheEntry<Value> = {
      promise: load(input),
      expiresAt: null,
    }
    entries.set(key, entry)
    trimOldest(entries, options.maxEntries)

    try {
      const value = await entry.promise
      if (entries.get(key) === entry) {
        if (cacheValue(value)) {
          entry.expiresAt = now() + options.ttlMs
          // Refresh insertion order so the cap evicts the least recently
          // completed entry instead of an actively reused one.
          entries.delete(key)
          entries.set(key, entry)
          trimOldest(entries, options.maxEntries)
        } else {
          entries.delete(key)
        }
      }
      return value
    } catch (error) {
      if (entries.get(key) === entry) entries.delete(key)
      throw error
    }
  }
}

function pruneExpired<Value>(
  entries: Map<string, BurstCacheEntry<Value>>,
  now: number
): void {
  for (const [key, entry] of entries) {
    if (entry.expiresAt !== null && entry.expiresAt <= now) {
      entries.delete(key)
    }
  }
}

function trimOldest<Value>(
  entries: Map<string, BurstCacheEntry<Value>>,
  maxEntries: number
): void {
  while (entries.size > maxEntries) {
    const oldest = entries.keys().next().value
    if (oldest === undefined) return
    entries.delete(oldest)
  }
}
