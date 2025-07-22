import type * as monaco from 'monaco-editor'
import type { TypeDefinition } from './plugin'

/**
 * Monaco integration service interface
 */
export interface MonacoIntegrationService {
  /**
   * Register type definitions with Monaco
   */
  registerTypeDefinitions(types: TypeDefinition[]): void
  
  /**
   * Update TypeScript compiler options
   */
  updateCompilerOptions(options: monaco.languages.typescript.CompilerOptions): void
  
  /**
   * Add extra library to Monaco
   */
  addExtraLib(content: string, filePath: string): monaco.IDisposable
  
  /**
   * Create diagnostics provider
   */
  createDiagnosticsProvider(): void
  
  /**
   * Create completion provider
   */
  createCompletionProvider(): monaco.IDisposable
  
  /**
   * Create hover provider
   */
  createHoverProvider(): monaco.IDisposable
  
  /**
   * Create definition provider
   */
  createDefinitionProvider(): monaco.IDisposable
  
  /**
   * Update import suggestions
   */
  updateImportSuggestions(imports: ImportSuggestion[]): void
  
  /**
   * Clear all registered types
   */
  clearRegisteredTypes(): void
  
  /**
   * Get current TypeScript service
   */
  getTypeScriptService(): monaco.languages.typescript.TypeScriptWorker | null
}

/**
 * Import suggestion for auto-completion
 */
export interface ImportSuggestion {
  /** Package name */
  packageName: string
  
  /** Import path */
  importPath: string
  
  /** Resolved URL */
  resolvedUrl: string
  
  /** Available exports */
  exports: ExportInfo[]
  
  /** Package description */
  description?: string
  
  /** Package version */
  version?: string
  
  /** Suggestion priority */
  priority: number
}

/**
 * Export information for packages
 */
export interface ExportInfo {
  /** Export name */
  name: string
  
  /** Export type */
  type: 'default' | 'named' | 'namespace'
  
  /** TypeScript type signature */
  signature?: string
  
  /** Export description */
  description?: string
  
  /** Whether export is deprecated */
  deprecated?: boolean
}

/**
 * Monaco language features configuration
 */
export interface MonacoLanguageFeatures {
  /** Enable/disable completion */
  completion: boolean
  
  /** Enable/disable hover information */
  hover: boolean
  
  /** Enable/disable go-to-definition */
  definition: boolean
  
  /** Enable/disable diagnostics */
  diagnostics: boolean
  
  /** Enable/disable signature help */
  signatureHelp: boolean
  
  /** Enable/disable code actions */
  codeActions: boolean
}

/**
 * TypeScript compiler options for ESM resolution
 */
export interface ESMCompilerOptions extends monaco.languages.typescript.CompilerOptions {
  /** Module resolution strategy */
  moduleResolution?: monaco.languages.typescript.ModuleResolutionKind
  
  /** Allow synthetic default imports */
  allowSyntheticDefaultImports?: boolean
  
  /** Enable ES module interop */
  esModuleInterop?: boolean
  
  /** Module target */
  module?: monaco.languages.typescript.ModuleKind
  
  /** Target ECMAScript version */
  target?: monaco.languages.typescript.ScriptTarget
  
  /** Base URL for module resolution */
  baseUrl?: string
  
  /** Path mapping for modules */
  paths?: Record<string, string[]>
  
  /** Type roots */
  typeRoots?: string[]
  
  /** Types to include */
  types?: string[]
}

/**
 * Monaco editor enhancement interface
 */
export interface MonacoEditorEnhancement {
  /** Editor instance */
  editor: monaco.editor.IStandaloneCodeEditor
  
  /** Add import resolution decorations */
  addImportDecorations(imports: ImportDecoration[]): void
  
  /** Clear import decorations */
  clearImportDecorations(): void
  
  /** Add import quick fixes */
  addImportQuickFixes(fixes: ImportQuickFix[]): void
  
  /** Show import resolution status */
  showImportStatus(status: ImportResolutionStatus): void
}

/**
 * Import decoration for visual feedback
 */
export interface ImportDecoration {
  /** Range in editor */
  range: monaco.IRange
  
  /** Decoration options */
  options: monaco.editor.IModelDecorationOptions
  
  /** Import statement */
  importStatement: string
  
  /** Resolved URL */
  resolvedUrl: string
  
  /** Resolution status */
  status: 'resolved' | 'resolving' | 'failed'
}

/**
 * Import quick fix suggestion
 */
export interface ImportQuickFix {
  /** Fix title */
  title: string
  
  /** Fix description */
  description: string
  
  /** Text edits to apply */
  edits: monaco.editor.IIdentifiedSingleEditOperation[]
  
  /** Fix kind */
  kind: string
  
  /** Whether fix is preferred */
  isPreferred: boolean
}

/**
 * Import resolution status
 */
export interface ImportResolutionStatus {
  /** Total imports found */
  totalImports: number
  
  /** Successfully resolved imports */
  resolvedImports: number
  
  /** Failed imports */
  failedImports: number
  
  /** Currently resolving imports */
  resolvingImports: number
  
  /** Status message */
  message: string
  
  /** Status level */
  level: 'info' | 'warning' | 'error'
}