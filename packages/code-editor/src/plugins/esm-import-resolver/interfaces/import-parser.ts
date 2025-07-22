import type { ImportStatement } from './plugin'

/**
 * Import parser service interface
 */
export interface ImportParserService {
  /**
   * Parse import statements from source code
   */
  parseImports(code: string, filePath: string): Promise<ImportStatement[]>
  
  /**
   * Resolve import path to ESM URL
   */
  resolveImportUrl(importPath: string): string
  
  /**
   * Check if import path is a third-party package
   */
  isThirdPartyPackage(importPath: string): boolean
  
  /**
   * Check if import path is a Node.js builtin module
   */
  isNodeBuiltin(importPath: string): boolean
  
  /**
   * Check if import path is a relative import
   */
  isRelativeImport(importPath: string): boolean
  
  /**
   * Extract package name from import path
   */
  extractPackageName(importPath: string): string
  
  /**
   * Extract version from import path (if specified)
   */
  extractVersion(importPath: string): string | undefined
}

/**
 * AST node types for import parsing
 */
export interface ImportDeclarationNode {
  type: 'ImportDeclaration'
  source: {
    type: 'Literal'
    value: string
  }
  specifiers: ImportSpecifierNode[]
  start: number
  end: number
}

/**
 * Import specifier AST node
 */
export interface ImportSpecifierNode {
  type: 'ImportDefaultSpecifier' | 'ImportNamespaceSpecifier' | 'ImportSpecifier'
  local: {
    type: 'Identifier'
    name: string
  }
  imported?: {
    type: 'Identifier'
    name: string
  }
}

/**
 * Dynamic import node
 */
export interface DynamicImportNode {
  type: 'ImportExpression'
  source: {
    type: 'Literal'
    value: string
  }
  start: number
  end: number
}

/**
 * Parse result containing all import information
 */
export interface ParseResult {
  /** Static import statements */
  imports: ImportStatement[]
  
  /** Dynamic import expressions */
  dynamicImports: DynamicImportNode[]
  
  /** Parse errors encountered */
  errors: ParseError[]
  
  /** Source file path */
  filePath: string
  
  /** Parse timestamp */
  timestamp: number
}

/**
 * Parse error representation
 */
export interface ParseError {
  /** Error message */
  message: string
  
  /** Line number where error occurred */
  line: number
  
  /** Column number where error occurred */
  column: number
  
  /** Error severity */
  severity: 'error' | 'warning'
  
  /** Error code */
  code?: string
}

/**
 * Node.js builtin modules list
 */
export const NODE_BUILTINS = [
  'assert', 'buffer', 'child_process', 'cluster', 'crypto', 'dgram', 'dns',
  'domain', 'events', 'fs', 'http', 'https', 'net', 'os', 'path', 'punycode',
  'querystring', 'readline', 'stream', 'string_decoder', 'timers', 'tls',
  'tty', 'url', 'util', 'v8', 'vm', 'zlib', 'process', 'console', 'module',
  'perf_hooks', 'async_hooks', 'worker_threads', 'inspector'
] as const

/**
 * Package name patterns for validation
 */
export interface PackageNamePatterns {
  /** Scoped package pattern (e.g., @scope/package) */
  scoped: RegExp
  
  /** Regular package pattern */
  regular: RegExp
  
  /** Version specification pattern */
  version: RegExp
  
  /** Relative import pattern */
  relative: RegExp
  
  /** Absolute import pattern */
  absolute: RegExp
}