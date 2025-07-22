/**
 * ESM URL Resolver Service
 * Handles conversion of package names to esm.sh URLs with advanced features
 */

export interface URLResolverService {
  /**
   * Resolve package import to ESM URL
   */
  resolvePackageUrl(importPath: string, options?: ResolveOptions): string

  /**
   * Check if package should be resolved
   */
  shouldResolve(importPath: string): boolean

  /**
   * Get package metadata from import path
   */
  getPackageMetadata(importPath: string): PackageMetadata

  /**
   * Configure ESM server URL
   */
  setEsmServerUrl(url: string): void

  /**
   * Add package to whitelist
   */
  addToWhitelist(packageName: string): void

  /**
   * Add package to blacklist
   */
  addToBlacklist(packageName: string): void
}

export interface ResolveOptions {
  /** Target environment (browser, node, deno) */
  target?: 'browser' | 'node' | 'deno'

  /** Specific version to use */
  version?: string

  /** Whether to include type definitions */
  includeTypes?: boolean

  /** Whether to disable automatic type definitions */
  noDts?: boolean

  /** Additional query parameters */
  queryParams?: Record<string, string>

  /** Bundle format preference */
  format?: 'esm' | 'cjs' | 'umd'

  /** Development mode */
  dev?: boolean
}

export interface PackageMetadata {
  /** Original import path */
  originalPath: string

  /** Package name */
  name: string

  /** Package version (if specified) */
  version?: string

  /** Subpath within package */
  subpath?: string

  /** Whether it's a scoped package */
  isScoped: boolean

  /** Whether it's a Node.js builtin */
  isNodeBuiltin: boolean

  /** Whether it's a relative import */
  isRelative: boolean

  /** Package scope (for scoped packages) */
  scope?: string
}

/**
 * ESM URL Resolver implementation
 */
export class URLResolver implements URLResolverService {
  private esmServerUrl = 'https://esm.sh'
  private packageWhitelist = new Set<string>()
  private packageBlacklist = new Set<string>()

  private readonly nodeBuiltins = new Set([
    'assert', 'buffer', 'child_process', 'cluster', 'crypto', 'dgram', 'dns',
    'domain', 'events', 'fs', 'http', 'https', 'net', 'os', 'path', 'punycode',
    'querystring', 'readline', 'stream', 'string_decoder', 'timers', 'tls',
    'tty', 'url', 'util', 'v8', 'vm', 'zlib', 'process', 'console', 'module',
    'perf_hooks', 'async_hooks', 'worker_threads', 'inspector'
  ])

  private readonly patterns = {
    scoped: /^@([a-z0-9-~][a-z0-9-._~]*)\/([a-z0-9-~][a-z0-9-._~]*)(\/.*)?$/,
    regular: /^([a-z0-9-~][a-z0-9-._~]*)(\/.*)?$/,
    version: /^(.+?)@(.+)$/,
    relative: /^\.{1,2}\//,
    absolute: /^[/\\]/,
    nodePrefix: /^node:/
  }

  /**
   * Resolve package import to ESM URL
   */
  resolvePackageUrl(importPath: string, options: ResolveOptions = {}): string {
    const metadata = this.getPackageMetadata(importPath)

    // Don't resolve relative or absolute imports
    if (metadata.isRelative || this.patterns.absolute.test(importPath)) {
      return importPath
    }

    // Check if package should be resolved
    if (!this.shouldResolve(importPath)) {
      return importPath
    }

    // Build ESM URL
    let url = this.esmServerUrl

    // Add package name and version
    if (metadata.version || options.version) {
      url += `/${metadata.name}@${options.version || metadata.version}`
    } else {
      url += `/${metadata.name}`
    }

    // Add subpath if present
    if (metadata.subpath) {
      url += metadata.subpath
    }

    // Add query parameters
    const queryParams = new URLSearchParams()

    // Target environment
    if (options.target) {
      queryParams.set('target', options.target)
    }

    // Bundle format
    if (options.format) {
      queryParams.set('bundle', options.format)
    }

    // Development mode
    if (options.dev) {
      queryParams.set('dev', 'true')
    }

    // Disable types if requested
    if (options.noDts) {
      queryParams.set('no-dts', 'true')
    }

    // Add custom query parameters
    if (options.queryParams) {
      Object.entries(options.queryParams).forEach(([key, value]) => {
        queryParams.set(key, value)
      })
    }

    // Append query string if any parameters
    const queryString = queryParams.toString()
    if (queryString) {
      url += `?${queryString}`
    }

    return url
  }

  /**
   * Check if package should be resolved
   */
  shouldResolve(importPath: string): boolean {
    const metadata = this.getPackageMetadata(importPath)

    // Don't resolve relative imports
    if (metadata.isRelative) {
      return false
    }

    // Check blacklist first
    if (this.packageBlacklist.has(metadata.name)) {
      return false
    }

    // If whitelist is not empty, only resolve whitelisted packages
    if (this.packageWhitelist.size > 0) {
      return this.packageWhitelist.has(metadata.name)
    }

    // Resolve all third-party packages and Node builtins by default
    return true
  }

  /**
   * Get package metadata from import path
   */
  getPackageMetadata(importPath: string): PackageMetadata {
    const metadata: PackageMetadata = {
      originalPath: importPath,
      name: '',
      isScoped: false,
      isNodeBuiltin: false,
      isRelative: this.patterns.relative.test(importPath)
    }

    // Handle relative imports
    if (metadata.isRelative) {
      metadata.name = importPath
      return metadata
    }

    // Remove version specification for parsing
    let cleanPath = importPath
    const versionMatch = importPath.match(this.patterns.version)
    if (versionMatch) {
      cleanPath = versionMatch[1]
      metadata.version = versionMatch[2]
    }

    // Remove node: prefix
    cleanPath = cleanPath.replace(this.patterns.nodePrefix, '')

    // Check if it's a Node builtin
    const basePackage = cleanPath.split('/')[0]
    metadata.isNodeBuiltin = this.nodeBuiltins.has(basePackage)

    // Parse scoped packages
    const scopedMatch = cleanPath.match(this.patterns.scoped)
    if (scopedMatch) {
      metadata.isScoped = true
      metadata.scope = scopedMatch[1]
      metadata.name = `@${scopedMatch[1]}/${scopedMatch[2]}`
      metadata.subpath = scopedMatch[3] || undefined
      return metadata
    }

    // Parse regular packages
    const regularMatch = cleanPath.match(this.patterns.regular)
    if (regularMatch) {
      metadata.name = regularMatch[1]
      metadata.subpath = regularMatch[2] || undefined
      return metadata
    }

    // Fallback
    metadata.name = cleanPath
    return metadata
  }

  /**
   * Configure ESM server URL
   */
  setEsmServerUrl(url: string): void {
    this.esmServerUrl = url.replace(/\/$/, '') // Remove trailing slash
  }

  /**
   * Add package to whitelist
   */
  addToWhitelist(packageName: string): void {
    this.packageWhitelist.add(packageName)
  }

  /**
   * Add package to blacklist
   */
  addToBlacklist(packageName: string): void {
    this.packageBlacklist.add(packageName)
  }

  /**
   * Clear whitelist
   */
  clearWhitelist(): void {
    this.packageWhitelist.clear()
  }

  /**
   * Clear blacklist
   */
  clearBlacklist(): void {
    this.packageBlacklist.clear()
  }

  /**
   * Get current whitelist
   */
  getWhitelist(): string[] {
    return Array.from(this.packageWhitelist)
  }

  /**
   * Get current blacklist
   */
  getBlacklist(): string[] {
    return Array.from(this.packageBlacklist)
  }
}
