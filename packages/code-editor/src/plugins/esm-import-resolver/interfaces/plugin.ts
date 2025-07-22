import type * as monaco from 'monaco-editor'

/**
 * Main plugin interface for ESM Import Resolver
 */
export interface ESMImportResolverPlugin {
  /**
   * Initialize the plugin with a Monaco editor instance
   */
  initialize(editor: monaco.editor.IStandaloneCodeEditor): Promise<void>
  
  /**
   * Enable the plugin functionality
   */
  enable(): void
  
  /**
   * Disable the plugin functionality
   */
  disable(): void
  
  /**
   * Configure the plugin with new settings
   */
  configure(config: PluginConfig): void
  
  /**
   * Dispose of all plugin resources
   */
  dispose(): void
  
  /**
   * Get current plugin state
   */
  getState(): PluginState
}

/**
 * Plugin configuration interface
 */
export interface PluginConfig {
  /** Whether the plugin is enabled */
  enabled: boolean
  
  /** Whether to automatically fetch type definitions */
  autoTypesFetching: boolean
  
  /** ESM server URL (default: https://esm.sh) */
  esmServerUrl: string
  
  /** Whether caching is enabled */
  cacheEnabled: boolean
  
  /** Cache TTL in milliseconds */
  cacheTTL: number
  
  /** Package whitelist (if specified, only these packages will be resolved) */
  packageWhitelist?: string[]
  
  /** Package blacklist (these packages will not be resolved) */
  packageBlacklist?: string[]
  
  /** Network request timeout in milliseconds */
  timeout: number
  
  /** Maximum retry attempts for failed requests */
  maxRetries: number
  
  /** Retry backoff multiplier */
  backoffMultiplier: number
}

/**
 * Plugin state interface
 */
export interface PluginState {
  /** Whether the plugin is currently enabled */
  enabled: boolean
  
  /** Current plugin configuration */
  config: PluginConfig
  
  /** Parsed imports by file path */
  parsedImports: Map<string, ImportStatement[]>
  
  /** Cached type definitions */
  typeDefinitions: Map<string, TypeDefinition>
  
  /** Monaco disposables for cleanup */
  monacoDisposables: monaco.IDisposable[]
  
  /** Cache statistics */
  cacheStats: CacheStats
  
  /** Current processing status */
  processingStatus: ProcessingStatus
}

/**
 * Import statement representation
 */
export interface ImportStatement {
  /** Original import source */
  source: string
  
  /** Import specifiers */
  specifiers: ImportSpecifier[]
  
  /** Start position in source code */
  start: number
  
  /** End position in source code */
  end: number
  
  /** Resolved URL */
  resolved: string
  
  /** Whether this is a third-party package */
  isThirdParty: boolean
  
  /** Whether this is a Node.js builtin module */
  isNodeBuiltin: boolean
  
  /** Whether this import has type definitions */
  hasTypes: boolean
}

/**
 * Import specifier types
 */
export interface ImportSpecifier {
  /** Type of import specifier */
  type: 'default' | 'named' | 'namespace'
  
  /** Imported name (for named imports) */
  imported?: string
  
  /** Local name in the importing module */
  local: string
}

/**
 * Type definition representation
 */
export interface TypeDefinition {
  /** Package URL */
  url: string
  
  /** Type definition content */
  content: string
  
  /** HTTP headers from the response */
  headers: Record<string, string>
  
  /** Timestamp when fetched */
  timestamp: number
  
  /** Package name */
  packageName: string
  
  /** Package version (if available) */
  version?: string
}

/**
 * Cache statistics
 */
export interface CacheStats {
  /** Total number of cached entries */
  totalEntries: number
  
  /** Cache hit rate (0-1) */
  hitRate: number
  
  /** Last cleanup timestamp */
  lastCleanup: number
  
  /** Total cache size in bytes */
  totalSize: number
}

/**
 * Processing status
 */
export interface ProcessingStatus {
  /** Whether currently parsing imports */
  isParsing: boolean
  
  /** Whether currently fetching types */
  isFetchingTypes: boolean
  
  /** Number of pending type fetch requests */
  pendingRequests: number
  
  /** Last processing timestamp */
  lastProcessed: number
  
  /** Processing errors */
  errors: ProcessingError[]
}

/**
 * Processing error representation
 */
export interface ProcessingError {
  /** Error type */
  type: 'parse' | 'network' | 'type-fetch' | 'monaco-integration'
  
  /** Error message */
  message: string
  
  /** Error context */
  context: string
  
  /** Timestamp when error occurred */
  timestamp: number
  
  /** Whether error was recovered */
  recovered: boolean
}