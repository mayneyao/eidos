// Core compiler exports
export { compileCode } from "./compiler"
export {
  scriptCodeCompile,
  blockCodeCompile,
  getCompileMethod,
} from "./script-compiler"
export { compileLexicalCode } from "./lexical-compiler"

// Code tools exports
export {
  getImportsFromCode,
  getAllLibs,
  getExtLibs,
  generateImportMap,
} from "./code-tools/get-deps"

export {
  extractFunction,
  extractConstant,
  detectDirective,
} from "./code-tools/code-extractor"

export { extractUDF, validateUDFCode } from "./code-tools/get-udf"

export {
  resolveLocalFileDependencies,
  type ResolvedFile,
} from "./code-tools/get-deps-file"

export { getExports } from "./code-tools/get-exports"

// UI dependencies
export { uiComponentsDependencies } from "./ui-deps"

// Diff utilities
export { applyCodePatch, createCodePatch } from "./diff"

// Cache utilities
export {
  generateCacheKey,
  hasCache,
  getCache,
  setCache,
  clearExpiredCache,
} from "./cache"

// Re-export oxc-parser for convenience
export { parseSync } from "oxc-parser"
