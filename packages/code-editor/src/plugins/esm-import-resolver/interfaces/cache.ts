import type { TypeDefinition, CacheStats } from './plugin'

/**
 * Cache manager interface
 */
export interface CacheManager {
  /**
   * Get cached item
   */
  get<T>(key: string): Promise<T | null>
  
  /**
   * Set cached item
   */
  set<T>(key: string, value: T, ttl?: number): Promise<void>
  
  /**
   * Check if key exists in cache
   */
  has(key: string): Promise<boolean>
  
  /**
   * Delete cached item
   */
  delete(key: string): Promise<boolean>
  
  /**
   * Clear all cached items
   */
  clear(): Promise<void>
  
  /**
   * Clear expired items
   */
  clearExpired(): Promise<number>
  
  /**
   * Get cache statistics
   */
  getStats(): Promise<CacheStats>
  
  /**
   * Get cache size
   */
  getSize(): Promise<number>
  
  /**
   * Set cache size limit
   */
  setSizeLimit(limit: number): void
  
  /**
   * Get all cache keys
   */
  getKeys(): Promise<string[]>
}

/**
 * Cache entry metadata
 */
export interface CacheEntry<T = any> {
  /** Cache key */
  key: string
  
  /** Cached value */
  value: T
  
  /** Entry timestamp */
  timestamp: number
  
  /** Time to live in milliseconds */
  ttl: number
  
  /** Expiration timestamp */
  expiresAt: number
  
  /** Access count */
  accessCount: number
  
  /** Last accessed timestamp */
  lastAccessed: number
  
  /** Entry size in bytes */
  size: number
  
  /** Entry tags for categorization */
  tags: string[]
}

/**
 * LRU cache implementation interface
 */
export interface LRUCache<T = any> {
  /**
   * Get item from cache
   */
  get(key: string): T | undefined
  
  /**
   * Set item in cache
   */
  set(key: string, value: T): void
  
  /**
   * Check if key exists
   */
  has(key: string): boolean
  
  /**
   * Delete item from cache
   */
  delete(key: string): boolean
  
  /**
   * Clear all items
   */
  clear(): void
  
  /**
   * Get cache size
   */
  size(): number
  
  /**
   * Get cache capacity
   */
  capacity(): number
  
  /**
   * Set cache capacity
   */
  setCapacity(capacity: number): void
  
  /**
   * Get all keys
   */
  keys(): string[]
  
  /**
   * Get all values
   */
  values(): T[]
  
  /**
   * Get all entries
   */
  entries(): [string, T][]
}

/**
 * Persistent cache storage interface
 */
export interface PersistentCacheStorage {
  /**
   * Initialize storage
   */
  init(): Promise<void>
  
  /**
   * Get item from storage
   */
  getItem(key: string): Promise<CacheEntry | null>
  
  /**
   * Set item in storage
   */
  setItem(key: string, entry: CacheEntry): Promise<void>
  
  /**
   * Remove item from storage
   */
  removeItem(key: string): Promise<void>
  
  /**
   * Get all keys
   */
  getAllKeys(): Promise<string[]>
  
  /**
   * Clear all items
   */
  clear(): Promise<void>
  
  /**
   * Get storage size
   */
  getSize(): Promise<number>
  
  /**
   * Compact storage (remove expired/unused entries)
   */
  compact(): Promise<void>
}

/**
 * Cache strategy interface
 */
export interface CacheStrategy {
  /** Strategy name */
  name: string
  
  /** Determine if item should be cached */
  shouldCache(key: string, value: any): boolean
  
  /** Calculate TTL for item */
  calculateTTL(key: string, value: any): number
  
  /** Determine cache priority */
  getPriority(key: string, value: any): number
  
  /** Handle cache eviction */
  onEvict(key: string, value: any): void
}

/**
 * Cache event types
 */
export enum CacheEventType {
  HIT = 'hit',
  MISS = 'miss',
  SET = 'set',
  DELETE = 'delete',
  CLEAR = 'clear',
  EXPIRE = 'expire',
  EVICT = 'evict'
}

/**
 * Cache event data
 */
export interface CacheEvent {
  /** Event type */
  type: CacheEventType
  
  /** Cache key */
  key: string
  
  /** Event timestamp */
  timestamp: number
  
  /** Additional event data */
  data?: any
}

/**
 * Cache event listener
 */
export type CacheEventListener = (event: CacheEvent) => void

/**
 * Cache configuration
 */
export interface CacheConfig {
  /** Maximum cache size in bytes */
  maxSize: number
  
  /** Maximum number of entries */
  maxEntries: number
  
  /** Default TTL in milliseconds */
  defaultTTL: number
  
  /** Cleanup interval in milliseconds */
  cleanupInterval: number
  
  /** Whether to use persistent storage */
  persistent: boolean
  
  /** Storage name for persistent cache */
  storageName: string
  
  /** Cache strategy */
  strategy: CacheStrategy
  
  /** Whether to enable cache events */
  enableEvents: boolean
}

/**
 * Type-specific cache interfaces
 */
export interface TypeDefinitionCache extends CacheManager {
  /**
   * Cache type definition
   */
  cacheTypeDefinition(packageUrl: string, types: TypeDefinition): Promise<void>
  
  /**
   * Get cached type definition
   */
  getCachedTypeDefinition(packageUrl: string): Promise<TypeDefinition | null>
  
  /**
   * Check if types are cached
   */
  hasTypeDefinition(packageUrl: string): Promise<boolean>
  
  /**
   * Clear type definitions cache
   */
  clearTypeDefinitions(): Promise<void>
  
  /**
   * Get type definitions statistics
   */
  getTypeDefinitionStats(): Promise<TypeDefinitionCacheStats>
}

/**
 * Type definition cache statistics
 */
export interface TypeDefinitionCacheStats extends CacheStats {
  /** Number of cached type definitions */
  typeDefinitionCount: number
  
  /** Average type definition size */
  averageSize: number
  
  /** Most accessed type definitions */
  mostAccessed: Array<{
    packageUrl: string
    accessCount: number
  }>
  
  /** Recently cached type definitions */
  recentlyCached: Array<{
    packageUrl: string
    timestamp: number
  }>
}