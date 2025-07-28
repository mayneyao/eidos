import type * as monaco from "monaco-editor"
import { createModelSafely } from "../monaco-setup"

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

// Note: createModelSafely function is now imported from ../monaco-setup

// Track if TypeScript has been configured to avoid repeated configuration
let isTypeScriptConfigured = false
let lastConfiguredLanguage: "typescript" | null = null

/**
 * Configure TypeScript language support
 */
export function configureTypeScriptLanguage(
  monacoInstance: typeof monaco,
  options: TypeScriptConfigOptions
): monaco.IDisposable[] {
  const {
    currentFile,
    localFiles,
    typeDefinitionFiles,
    globalTypes,
    language
  } = options
  console.warn('options', {
    options
  })
  const disposables: monaco.IDisposable[] = []

  // For Monaco Editor, we always use 'typescript' language for both .ts and .tsx files
  const normalizedLanguage = "typescript"

  // If language changed, we need to reconfigure
  if (lastConfiguredLanguage !== normalizedLanguage) {
    console.log(`TypeScript language changed from ${lastConfiguredLanguage} to ${normalizedLanguage}, reconfiguring`)
    isTypeScriptConfigured = false
  }

  // Only configure TypeScript once to avoid performance issues
  if (isTypeScriptConfigured && lastConfiguredLanguage === normalizedLanguage) {
    console.log(`TypeScript already configured for ${normalizedLanguage}, skipping reconfiguration`)
    return disposables
  }

  console.log(`Configuring TypeScript language support for: ${normalizedLanguage} (requested: ${language})`)
  isTypeScriptConfigured = true
  lastConfiguredLanguage = normalizedLanguage

  // Set diagnostic options once with optimized settings
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

  // Always enable JSX support for both .ts and .tsx files
  const jsxConfig = {
    jsx: monacoInstance.languages.typescript.JsxEmit.React,
    jsxFactory: "React.createElement",
    jsxFragmentFactory: "React.Fragment",
    reactNamespace: "React",
    allowJs: false, // Only support TypeScript
  }

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
    ...jsxConfig,
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

  // Add type definition files
  // if (typeDefinitionFiles && typeDefinitionFiles.length > 0) {
  //   typeDefinitionFiles.forEach((typeFile) => {
  //     const virtualPath = typeFile.virtualPath || `ts:filename/${typeFile.id}.d.ts`
  //     monacoInstance.languages.typescript.typescriptDefaults.addExtraLib(
  //       typeFile.content,
  //       virtualPath
  //     )
  //   })
  // }

  // // Create virtual file models for local files
  // if (localFiles && localFiles.length > 0) {
  //   console.log(`Creating models for ${localFiles.length} local files`);

  //   localFiles.forEach((file) => {
  //     let fileContent = file.content;

  //     // Ensure content is a valid TypeScript module
  //     if (!fileContent.trim()) {
  //       fileContent = "export default {};\nexport {}; // Ensure this is a module";
  //     } else if (!fileContent.includes('export') && !fileContent.includes('module.exports')) {
  //       fileContent += "\nexport {}; // Ensure this is a module";
  //     }

  //     // Create file model using file:/// protocol and /files/ path
  //     const fileUri = monacoInstance.Uri.parse(`file:///files/${file.id}.ts`);

  //     // Always use typescript language
  //     const modelLanguage = "typescript";

  //     // Safely create model
  //     createModelSafely(monacoInstance, fileContent, modelLanguage, fileUri);
  //   });
  // }

  // Create model for current editing file
  // if (currentFile) {
  //   let fileContent = currentFile.content;

  //   // Ensure content is a valid TypeScript module
  //   if (!fileContent.trim()) {
  //     fileContent = "export default {};\nexport {}; // Ensure this is a module";
  //   } else if (!fileContent.includes('export') && !fileContent.includes('module.exports')) {
  //     fileContent += "\nexport {}; // Ensure this is a module";
  //   }

  //   // Create model for current editing file
  //   const currentUri = monacoInstance.Uri.parse(`file:///current/${currentFile.id}.ts`);

  //   // Safely create model for current editing file
  //   createModelSafely(monacoInstance, fileContent, currentFile.language || "typescript", currentUri);
  // }

  // Debug: Check all added extra libraries
  setTimeout(() => {
    const extraLibs = monacoInstance.languages.typescript.typescriptDefaults.getExtraLibs()
    console.log("All extra libs after setup:", Object.keys(extraLibs))
    console.log("Extra libs content preview:", Object.entries(extraLibs).map(([uri, lib]) => ({
      uri,
      contentPreview: lib.content.substring(0, 100) + '...'
    })))

    // Debug: Check all created models
    const models = monacoInstance.editor.getModels()
    console.log("All models after setup:", models.map(model => model.uri.toString()))
  }, 200)

  return disposables
}

// Cache for content to avoid unnecessary updates
const contentCache = new Map<string, string>()
// Track last sync time to avoid too frequent updates
const lastSyncTime = new Map<string, number>()
// Minimum interval between syncs (ms)
const MIN_SYNC_INTERVAL = 100

/**
 * Sync current editor content to virtual file system
 * This is a key step for implementing multi-file type checking
 */
export function syncEditorContentToVirtualFileSystem(
  monacoInstance: typeof monaco,
  filePath: string, // Changed from fileId to filePath
  content: string,
  pathPrefix: string = "current"
): void {
  if (!filePath || content === undefined) return

  const now = Date.now()
  const lastSync = lastSyncTime.get(filePath) || 0

  // Check if content has actually changed
  const cacheKey = filePath
  const cachedContent = contentCache.get(cacheKey)
  if (cachedContent === content) {
    return // No change, skip update
  }

  // Rate limiting: avoid too frequent updates
  if (now - lastSync < MIN_SYNC_INTERVAL) {
    console.log(`⏳ Rate limiting sync for ${filePath}, skipping`)
    return
  }

  let fileContent = content

  // Ensure content is a valid TypeScript module
  if (!fileContent.trim()) {
    fileContent = "export default {};\nexport {}; // Ensure this is a module"
  } else if (!fileContent.includes('export') && !fileContent.includes('module.exports')) {
    fileContent += "\nexport {}; // Ensure this is a module"
  }

  try {
    // Always use typescript language - JSX support is handled by file extension
    const language = 'typescript'

    // Create URI with correct extension
    const currentUri = monacoInstance.Uri.parse(`file:///${filePath}`)
    const existingModel = monacoInstance.editor.getModel(currentUri)

    if (existingModel) {
      // Update existing model content and ensure correct language
      if (existingModel.getValue() !== fileContent) {
        existingModel.setValue(fileContent)
        console.log(`Updated model content for: ${filePath}`)
      }
      // Ensure correct language is set
      if (existingModel.getLanguageId() !== language) {
        monacoInstance.editor.setModelLanguage(existingModel, language)
        console.log(`Updated language to ${language} for: ${filePath}`)
      }
    } else {
      // Create new model with correct language
      createModelSafely(fileContent, language, currentUri)
      console.log(`Created new model for: ${filePath} with language: ${language}`)
    }

    // Update cache and sync time
    contentCache.set(cacheKey, content)
    lastSyncTime.set(filePath, now)

    // Update TypeScript extra lib with correct path
    try {
      const extraLibs = monacoInstance.languages.typescript.typescriptDefaults.getExtraLibs()
      const libPath = `file:///${filePath}`
      const existingLib = extraLibs[libPath]

      if (!existingLib || existingLib.content !== fileContent) {
        monacoInstance.languages.typescript.typescriptDefaults.addExtraLib(
          fileContent,
          libPath
        )
        console.log(`✅ Updated TypeScript extra lib for: ${filePath}`)
      } else {
        console.log(`⏭️ TypeScript extra lib unchanged for: ${filePath}`)
      }
    } catch (libError) {
      console.warn(`❌ Failed to update TypeScript extra lib for ${filePath}:`, libError)
    }
  } catch (error) {
    console.error(`❌ Error syncing content for ${filePath}:`, error)
  }
}

/**
 * Configure TypeScript auto-completion
 */
export function configureTypeScriptAutoCompletion(
  monacoInstance: typeof monaco,
  localFiles?: FileInfo[],
  language: "typescript" = "typescript"
): monaco.IDisposable[] {
  const disposables: monaco.IDisposable[] = []

  if (!localFiles) return disposables

  // TypeScript auto-completion provider
  const tsCompletionProvider = monacoInstance.languages.registerCompletionItemProvider(
    "typescript",
    {
      provideCompletionItems: (model, position) => {
        const textUntilPosition = model.getValueInRange({
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        })

        // Check if in @/files/ import statement
        const importMatch = textUntilPosition.match(
          /import\s+.*from\s+['"]@\/files\/([^'"]*)?$/
        )

        if (importMatch) {
          const suggestions = localFiles.map((file) => ({
            label: file.id,
            kind: monacoInstance.languages.CompletionItemKind.Module,
            detail: file.name || "File",
            documentation: file.description || "No description",
            insertText: file.id,
            range: {
              startLineNumber: position.lineNumber,
              endLineNumber: position.lineNumber,
              startColumn: position.column - (importMatch[1]?.length || 0),
              endColumn: position.column,
            },
          }))

          return { suggestions }
        }

        return { suggestions: [] }
      },
    }
  )
  disposables.push(tsCompletionProvider)

  // Auto-completion provider for both .ts and .tsx files
  const importCompletionProvider = monacoInstance.languages.registerCompletionItemProvider(
    "typescript",
    {
      provideCompletionItems: (model, position) => {
        const textUntilPosition = model.getValueInRange({
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        })

        const importMatch = textUntilPosition.match(
          /import\s+.*from\s+['"]@\/files\/([^'"]*)?$/
        )

        if (importMatch) {
          const suggestions = localFiles.map((file) => ({
            label: file.id,
            kind: monacoInstance.languages.CompletionItemKind.Module,
            detail: file.name || "File",
            documentation: file.description || "No description",
            insertText: file.id,
            range: {
              startLineNumber: position.lineNumber,
              endLineNumber: position.lineNumber,
              startColumn: position.column - (importMatch[1]?.length || 0),
              endColumn: position.column,
            },
          }))

          return { suggestions }
        }

        return { suggestions: [] }
      },
    }
  )
  disposables.push(importCompletionProvider)

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
