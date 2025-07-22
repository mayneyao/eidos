import type { TypeDefinition } from './plugin'

/**
 * Type definition service interface
 */
export interface TypeDefinitionService {
  /**
   * Fetch type definitions for a package URL
   */
  fetchTypes(packageUrl: string): Promise<TypeDefinition | null>
  
  /**
   * Get cached type definitions
   */
  getCachedTypes(packageUrl: string): TypeDefinition | null
  
  /**
   * Cache type definitions
   */
  cacheTypes(packageUrl: string, types: TypeDefinition): void
  
  /**
   * Clear all cached types
   */
  clearCache(): void
  
  /**
   * Clear expired cache entries
   */
  clearExpiredCache(): void
  
  /**
   * Get cache statistics
   */
  getCacheStats(): TypeCacheStats
  
  /**
   * Check if types are available for a package
   */
  hasTypes(packageUrl: string): Promise<boolean>
  
  /**
   * Prefetch types for multiple packages
   */
  prefetchTypes(packageUrls: string[]): Promise<void>
}

/**
 * Type cache statistics
 */
export interface TypeCacheStats {
  /** Total number of cached entries */
  totalEntries: number
  
  /** Cache hit count */
  hits: number
  
  /** Cache miss count */
  misses: number
  
  /** Cache hit rate (0-1) */
  hitRate: number
  
  /** Total cache size in bytes */
  totalSize: number
  
  /** Last cleanup timestamp */
  lastCleanup: number
  
  /** Cache entries by status */
  entriesByStatus: {
    valid: number
    expired: number
    failed: number
  }
}

/**
 * HTTP client interface for fetching types
 */
export interface TypeHttpClient {
  /**
   * Fetch type definitions from URL
   */
  fetch(url: string, options?: TypeFetchOptions): Promise<TypeFetchResponse>
  
  /**
   * Check if types are available at URL
   */
  head(url: string): Promise<boolean>
  
  /**
   * Set default headers for requests
   */
  setDefaultHeaders(headers: Record<string, string>): void
  
  /**
   * Set timeout for requests
   */
  setTimeout(timeout: number): void
}

/**
 * Type fetch options
 */
export interface TypeFetchOptions {
  /** Request timeout in milliseconds */
  timeout?: number
  
  /** Additional headers */
  headers?: Record<string, string>
  
  /** Whether to follow redirects */
  followRedirects?: boolean
  
  /** Maximum number of redirects to follow */
  maxRedirects?: number
  
  /** Whether to disable automatic type detection */
  noDts?: boolean
}

/**
 * Type fetch response
 */
export interface TypeFetchResponse {
  /** Response status code */
  status: number
  
  /** Response headers */
  headers: Record<string, string>
  
  /** Response body */
  body: string
  
  /** Final URL after redirects */
  url: string
  
  /** Whether request was successful */
  ok: boolean
  
  /** Response timestamp */
  timestamp: number
}

/**
 * Type definition metadata
 */
export interface TypeDefinitionMetadata {
  /** Package name */
  packageName: string
  
  /** Package version */
  version?: string
  
  /** Type definition URL */
  typeUrl: string
  
  /** Original package URL */
  packageUrl: string
  
  /** Fetch timestamp */
  fetchedAt: number
  
  /** Last accessed timestamp */
  lastAccessed: number
  
  /** Access count */
  accessCount: number
  
  /** Content size in bytes */
  size: number
  
  /** Content hash for validation */
  hash: string
  
  /** Whether types are from DefinitelyTyped */
  isDefinitelyTyped: boolean
  
  /** Type definition quality score (0-1) */
  qualityScore?: number
}

/**
 * Type resolution strategy
 */
export interface TypeResolutionStrategy {
  /** Strategy name */
  name: string
  
  /** Strategy priority (higher = more preferred) */
  priority: number
  
  /** Check if strategy can handle package */
  canHandle(packageUrl: string): boolean
  
  /** Resolve type definition URL */
  resolveTypeUrl(packageUrl: string): Promise<string | null>
  
  /** Fetch type definition */
  fetchTypes(typeUrl: string): Promise<TypeDefinition | null>
}

/**
 * Built-in type resolution strategies
 */
export enum TypeResolutionStrategyType {
  /** Use X-TypeScript-Types header from esm.sh */
  ESM_HEADER = 'esm-header',
  
  /** Use DefinitelyTyped packages */
  DEFINITELY_TYPED = 'definitely-typed',
  
  /** Use package's own type definitions */
  PACKAGE_TYPES = 'package-types',
  
  /** Fallback to any available types */
  FALLBACK = 'fallback'
}