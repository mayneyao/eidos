// import { parseSync } from 'oxc-parser' // TODO: Re-enable when WASM issues are resolved
import type {
  ImportParserService,
  ImportStatement,
  PackageNamePatterns
} from '../interfaces'
import { URLResolver } from './url-resolver'

/**
 * Import parser service implementation using oxc-parser
 */
export class ImportParser implements ImportParserService {
  private readonly urlResolver = new URLResolver()

  private readonly patterns: PackageNamePatterns = {
    scoped: /^@[a-z0-9-~][a-z0-9-._~]*\/[a-z0-9-~][a-z0-9-._~]*$/,
    regular: /^[a-z0-9-~][a-z0-9-._~]*$/,
    version: /^(.+?)@(.+)$/,
    relative: /^\.{1,2}\//,
    absolute: /^[/\\]/
  }

  private readonly nodeBuiltins = new Set([
    'assert', 'buffer', 'child_process', 'cluster', 'crypto', 'dgram', 'dns',
    'domain', 'events', 'fs', 'http', 'https', 'net', 'os', 'path', 'punycode',
    'querystring', 'readline', 'stream', 'string_decoder', 'timers', 'tls',
    'tty', 'url', 'util', 'v8', 'vm', 'zlib', 'process', 'console', 'module',
    'perf_hooks', 'async_hooks', 'worker_threads', 'inspector'
  ])

  /**
   * Parse import statements from source code using regex fallback
   * TODO: Replace with oxc-parser when WASM issues are resolved
   */
  async parseImports(code: string, _filePath: string): Promise<ImportStatement[]> {
    try {
      // Fallback to regex parsing for demo purposes
      return this.parseImportsWithRegex(code)
    } catch (error) {
      console.error('Failed to parse imports:', error)
      return []
    }
  }

  /**
   * Fallback regex-based import parsing
   */
  private parseImportsWithRegex(code: string): ImportStatement[] {
    const imports: ImportStatement[] = []

    try {
      const lines = code.split('\n')

      for (let i = 0; i < lines.length; i++) {
        try {
          const line = lines[i].trim()

          // Skip empty lines and comments
          if (!line || line.startsWith('//') || line.startsWith('/*')) {
            continue
          }

          // Match various import patterns
          const patterns = [
            /import\s+(.+?)\s+from\s+['"]([^'"]+)['"]/,  // import ... from '...'
            /import\s+['"]([^'"]+)['"]/,                 // import '...'
            /import\s*\(\s*['"]([^'"]+)['"]\s*\)/,       // import('...')
          ]

          for (const pattern of patterns) {
            const match = line.match(pattern)
            if (match) {
              const source = match[2] || match[1]

              if (!source) {
                console.warn(`Empty import source on line ${i + 1}: ${line}`)
                continue
              }

              try {
                const specifiers = this.parseSpecifiersFromLine(line, source)
                const resolved = this.resolveImportUrl(source)
                const isThirdParty = this.isThirdPartyPackage(source)
                const isNodeBuiltin = this.isNodeBuiltin(source)

                imports.push({
                  source,
                  specifiers,
                  start: 0,
                  end: line.length,
                  resolved,
                  isThirdParty,
                  isNodeBuiltin,
                  hasTypes: false
                })
              } catch (importError) {
                console.warn(`Error processing import "${source}" on line ${i + 1}:`, importError)
              }
              break
            }
          }
        } catch (lineError) {
          console.warn(`Error processing line ${i + 1}:`, lineError)
        }
      }
    } catch (error) {
      console.error('Error in regex import parsing:', error)
    }

    return imports
  }

  /**
   * Parse import specifiers from a line
   */
  private parseSpecifiersFromLine(line: string, _source: string): ImportStatement['specifiers'] {
    const specifiers: ImportStatement['specifiers'] = []

    // Extract the import part before 'from'
    const importMatch = line.match(/import\s+(.+?)\s+from/)
    if (!importMatch) {
      return specifiers
    }

    const importPart = importMatch[1].trim()

    // Default import: import React from 'react'
    if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(importPart)) {
      specifiers.push({
        type: 'default',
        local: importPart
      })
    }
    // Namespace import: import * as React from 'react'
    else if (importPart.includes('* as ')) {
      const namespaceMatch = importPart.match(/\*\s+as\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/)
      if (namespaceMatch) {
        specifiers.push({
          type: 'namespace',
          local: namespaceMatch[1]
        })
      }
    }
    // Named imports: import { useState, useEffect } from 'react'
    else if (importPart.includes('{') && importPart.includes('}')) {
      const namedMatch = importPart.match(/\{([^}]+)\}/)
      if (namedMatch) {
        const namedImports = namedMatch[1].split(',').map(s => s.trim())
        namedImports.forEach(namedImport => {
          const parts = namedImport.split(' as ').map(s => s.trim())
          specifiers.push({
            type: 'named',
            imported: parts[0],
            local: parts[1] || parts[0]
          })
        })
      }
    }

    return specifiers
  }

  /**
   * Resolve import path to ESM URL
   */
  resolveImportUrl(importPath: string): string {
    return this.urlResolver.resolvePackageUrl(importPath)
  }

  /**
   * Check if import path is a third-party package
   */
  isThirdPartyPackage(importPath: string): boolean {
    // Skip empty or whitespace-only strings
    if (!importPath || importPath.trim() === '') {
      return false
    }

    // Not relative, not absolute, not Node builtin
    return !this.isRelativeImport(importPath) &&
           !this.patterns.absolute.test(importPath) &&
           !this.isNodeBuiltin(importPath)
  }

  /**
   * Check if import path is a Node.js builtin module
   */
  isNodeBuiltin(importPath: string): boolean {
    // Remove node: prefix if present
    const cleanPath = importPath.replace(/^node:/, '')
    return this.nodeBuiltins.has(cleanPath)
  }

  /**
   * Check if import path is a relative import
   */
  isRelativeImport(importPath: string): boolean {
    return this.patterns.relative.test(importPath)
  }

  /**
   * Extract package name from import path
   */
  extractPackageName(importPath: string): string {
    // Handle version specification (e.g., "lodash@4.17.21")
    const versionMatch = importPath.match(this.patterns.version)
    if (versionMatch) {
      importPath = versionMatch[1]
    }

    // Handle scoped packages (e.g., "@babel/core")
    if (importPath.startsWith('@')) {
      const parts = importPath.split('/')
      if (parts.length >= 2) {
        return `${parts[0]}/${parts[1]}`
      }
    }

    // Handle regular packages with subpaths (e.g., "lodash/debounce")
    const parts = importPath.split('/')
    return parts[0]
  }

  /**
   * Extract version from import path (if specified)
   */
  extractVersion(importPath: string): string | undefined {
    const versionMatch = importPath.match(this.patterns.version)
    return versionMatch ? versionMatch[2] : undefined
  }

  // TODO: Re-enable AST-based parsing when oxc-parser WASM issues are resolved
  // private traverseAST(node: any, visitor: (node: any) => void): void { ... }
  // private createImportStatement(node: any): ImportStatement | null { ... }
  // private extractSpecifiers(specifierNodes: any[]): ImportStatement['specifiers'] { ... }
}