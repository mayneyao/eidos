// Core interfaces for ESM Import Resolver Plugin
export * from './plugin'
export * from './type-definition'
export * from './monaco-integration'
export * from './configuration'
export * from './cache'
export * from './error-handler'

// Re-export from import-parser, excluding ParseError to avoid conflict
export type {
  ImportParserService,
  ImportDeclarationNode,
  ImportSpecifierNode,
  DynamicImportNode,
  ParseResult,
  PackageNamePatterns
} from './import-parser'
export { NODE_BUILTINS } from './import-parser'

// Explicitly use ParseError from error-handler (more comprehensive)
export type { ParseError } from './error-handler'