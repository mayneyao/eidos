/**
 * Types for ext-server middleware
 * These types are designed to be dependency-free for external consumers
 */

/**
 * Binding type for extension variables
 */
export type BindingType = "table" | "secret" | "text"

export interface IBinding {
  type: BindingType
  value: string
}

export type IBindings = Record<string, IBinding>

/**
 * Extension metadata
 */
export interface IExtensionMeta {
  type?: string
  [key: string]: any
}

/**
 * Extension interface - matches the shape expected from DataSpace
 */
export interface IExtension {
  id: string
  name?: string
  slug?: string
  /** Compiled JavaScript code */
  code?: string
  /** Original TypeScript code */
  ts_code?: string
  /** Extension bindings */
  bindings?: IBindings
  /** Extension metadata */
  meta?: IExtensionMeta
}

/**
 * Provider interface for fetching extensions
 * Implement this interface to provide extensions from your data source
 */
export interface ExtensionProvider {
  /**
   * Get extension by ID
   */
  getById(extensionId: string): Promise<IExtension | null>

  /**
   * Get extension by slug (optional fallback)
   */
  getBySlug?(slug: string): Promise<IExtension | null>

  /**
   * Get extension by slug or ID (for local lib resolution)
   */
  getBySlugOrId?(slugOrId: string): Promise<IExtension | null>

  /**
   * Get theme mode from KV storage (optional)
   */
  getThemeMode?(): Promise<string | null>

  /**
   * Get whether sync is enabled for this space (optional)
   */
  getSyncEnabled?(): boolean

  dataSpace: any
}

/**
 * Sandbox handler interface for script execution
 */
export interface SandboxHandler {
  handleSandboxRequest(
    spaceId: string,
    url: URL,
    context: any
  ): Promise<Response>
}

/**
 * Function to create a sandbox handler
 */
export type CreateSandboxHandler = (
  getScriptCode: (spaceId: string, scriptId: string) => Promise<string | null>
) => SandboxHandler

/**
 * SDK injection function type
 */
export type MakeSdkInjectScript = (options: {
  space: string
  bindings?: IBindings
  port?: string
}) => string

/**
 * Import map generation types
 */
export interface LibsResult {
  thirdPartyLibs: string[]
  uiLibs: string[]
  cssLibs: string[]
  localLibs: string[]
}

export type GetAllLibs = (
  code: string,
  uiComponentsDependencies: Record<
    string,
    { thirdPartyLibs: string[]; uiLibs: string[] }
  >,
  getLocalLibCode?: (localLibPath: string) => Promise<string | null>
) => Promise<LibsResult>

export type GenerateImportMap = (
  libs: {
    thirdPartyLibs: string[]
    uiLibs: string[]
    cssLibs: string[]
    localLibs: string[]
  },
  spaceId: string,
  slug?: string
) => Promise<{ importMapScript: string; cssLoaderScript: string }>

export type ExtractFunction = (code: string, funcName: string) => string | null

/**
 * Dependencies that need to be injected
 */
export interface ExtServerDependencies {
  /** Function to create SDK injection script */
  makeSdkInjectScript: MakeSdkInjectScript

  /** Function to extract functions from code */
  extractFunction: ExtractFunction

  /** Function to get all libs from code */
  getAllLibs: GetAllLibs

  /** Function to generate import map */
  generateImportMap: GenerateImportMap

  /** UI components dependencies map */
  uiComponentsDependencies: Record<
    string,
    { thirdPartyLibs: string[]; uiLibs: string[] }
  >

  /** Optional: Sandbox handler creator */
  createSandboxHandler?: CreateSandboxHandler
}

/**
 * Configuration for the extension middleware
 */
export interface ExtServerConfig {
  /**
   * Get extension provider for a given space
   */
  getExtensionProvider: (spaceId: string) => Promise<ExtensionProvider>

  /**
   * Injected dependencies from @eidos.space packages
   */
  dependencies: ExtServerDependencies

  /**
   * Server port (for logging)
   */
  port?: number

  /**
   * Custom themes to add (static list)
   */
  customThemes?: Array<{ name: string; css: string }>

  /**
   * Dynamic custom themes getter (e.g., from ConfigManager)
   */
  getCustomThemes?: () => Array<{ name: string; css: string }>

  /**
   * Get current theme name (e.g., from ConfigManager)
   */
  getCurrentThemeName?: () => string | undefined

  /**
   * Whether sync is enabled (shown in extension context)
   * @deprecated Use provider.getSyncEnabled() instead
   */
  syncEnabled?: boolean

  /**
   * Override theme mode instead of reading from provider
   */
  themeMode?: "light" | "dark"

  /**
   * Custom hostname pattern (default: <extId>.block.<spaceId>.eidos.localhost)
   */
  hostnamePattern?: RegExp

  /**
   * Custom sandbox hostname pattern
   */
  sandboxHostnamePattern?: RegExp

  /**
   * Optional: Serve compiled UI files from a directory (for desktop)
   * If provided, will handle /compiled-ui/* requests
   */
  serveCompiledUI?: (pathname: string) => Buffer | null
}
