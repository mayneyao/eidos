import type * as monaco from "monaco-editor"

export interface FileInfo {
  id: string
  name?: string
  description?: string
  content: string
  language?: "typescript"
}

export interface TypeDefinitionFile {
  id: string
  name?: string
  content: string
  // Virtual path for the type definition file
  virtualPath?: string
}

export interface TypeScriptConfigOptions {
  // Current editing file
  currentFile?: FileInfo

  // Local files that can be imported
  localFiles?: FileInfo[]

  // Type definition files (.d.ts)
  typeDefinitionFiles?: TypeDefinitionFile[]

  // Global type definitions (like Eidos SDK types)
  globalTypes?: string

  // Language mode (always typescript)
  language: "typescript"
}

// Track if TypeScript has been configured to avoid repeated configuration
let isTypeScriptConfigured = false

/**
 * Configure TypeScript language support with optimized settings
 */
export function configureTypeScriptLanguage(
  monacoInstance: typeof monaco,
  options: TypeScriptConfigOptions
): monaco.IDisposable[] {
  const { globalTypes } = options
  const disposables: monaco.IDisposable[] = []

  // Only configure TypeScript once to avoid performance issues
  if (isTypeScriptConfigured) {
    console.log("TypeScript already configured, skipping reconfiguration")
    return disposables
  }

  console.log("Configuring TypeScript language support")
  isTypeScriptConfigured = true

  // Set diagnostic options with optimized settings
  monacoInstance.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
    noSuggestionDiagnostics: false, // Enable suggestion diagnostics for better IntelliSense
    diagnosticCodesToIgnore: [
      1108, // 'return' statement is not expected here
      1005, // '}' expected
      1002, // Unterminated string literal
      1003, // Identifier expected
    ], // Ignore some common temporary errors to reduce editing interference
  })

  // Configure TypeScript compiler options with JSX support
  const compilerOptions = {
    target: monacoInstance.languages.typescript.ScriptTarget.ES2020,
    lib: ["es2020", "dom"],
    allowNonTsExtensions: true,
    strict: false, // Less strict for better development experience
    noImplicitAny: false,
    baseUrl: "file:///",
    moduleResolution: monacoInstance.languages.typescript.ModuleResolutionKind.NodeJs,
    module: monacoInstance.languages.typescript.ModuleKind.ESNext,
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    skipLibCheck: true,
    resolveJsonModule: true,
    typeRoots: [],
    isolatedModules: false, // Allow cross-file type checking
    forceConsistentCasingInFileNames: false,
    // JSX configuration
    jsx: monacoInstance.languages.typescript.JsxEmit.React,
    jsxFactory: "React.createElement",
    jsxFragmentFactory: "React.Fragment",
    reactNamespace: "React",
    allowJs: false, // Only support TypeScript
  }

  console.log("Setting TypeScript compiler options:", compilerOptions)
  monacoInstance.languages.typescript.typescriptDefaults.setCompilerOptions(compilerOptions)

  // Add global type definitions
  if (globalTypes) {
    monacoInstance.languages.typescript.typescriptDefaults.addExtraLib(
      globalTypes,
      "ts:filename/eidos.d.ts"
    )
  }

  // Debug: Check all added extra libraries
  setTimeout(() => {
    const extraLibs = monacoInstance.languages.typescript.typescriptDefaults.getExtraLibs()
    console.log("All extra libs after setup:", Object.keys(extraLibs))
  }, 200)

  return disposables
}

/**
 * Get TypeScript editor default options
 */
export function getTypeScriptEditorOptions(): monaco.editor.IStandaloneEditorConstructionOptions {
  return {
    minimap: { enabled: false },
    wordWrap: "on",
    scrollBeyondLastLine: false,
    automaticLayout: true,
  }
}