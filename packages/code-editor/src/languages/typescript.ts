import type * as monaco from "monaco-editor"

export interface FileInfo {
  id: string
  name?: string
  description?: string
  content: string
  language?: "typescript" | "typescriptreact"
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

  // Language mode
  language: "typescript" | "typescriptreact"
}

/**
 * Helper function to safely create models
 * Checks if model already exists, updates content if exists, otherwise creates new model
 */
export function createModelSafely(
  monacoInstance: typeof monaco,
  content: string,
  language: string,
  uri: monaco.Uri
): monaco.editor.ITextModel {
  // Check if model already exists
  const existingModel = monacoInstance.editor.getModel(uri);
  if (existingModel) {
    // If model exists, only update when content is different
    if (existingModel.getValue() !== content) {
      existingModel.setValue(content);
      console.log(`Updated existing model: ${uri.toString()}`);
    }
    return existingModel;
  }

  // Create new model
  try {
    const model = monacoInstance.editor.createModel(content, language, uri);
    console.log(`Created new model: ${uri.toString()}`);
    return model;
  } catch (error) {
    console.error(`Error creating model for ${uri.toString()}:`, error);
    // If creation fails, try to get model again (might have been created before error)
    const fallbackModel = monacoInstance.editor.getModel(uri);
    if (fallbackModel) {
      return fallbackModel;
    }
    throw error;
  }
}

// Track if TypeScript has been configured to avoid repeated configuration
let isTypeScriptConfigured = false

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
  const disposables: monaco.IDisposable[] = []

  // Only configure TypeScript once to avoid performance issues
  if (isTypeScriptConfigured) {
    console.log("TypeScript already configured, skipping reconfiguration")
    return disposables
  }

  console.log("Configuring TypeScript language support for the first time")
  isTypeScriptConfigured = true

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

  const tsxConfig =
    language === "typescriptreact"
      ? {
        jsx: monacoInstance.languages.typescript.JsxEmit.React,
        jsxFactory: "React.createElement",
        jsxFragmentFactory: "React.Fragment",
        moduleResolution: monacoInstance.languages.typescript.ModuleResolutionKind.NodeJs,
        module: monacoInstance.languages.typescript.ModuleKind.ESNext,
        reactNamespace: "React",
        allowJs: false, // Only support TypeScript
        typeRoots: ["node_modules/@types"],
      }
      : {}

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
    ...tsxConfig,
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
  if (typeDefinitionFiles && typeDefinitionFiles.length > 0) {
    typeDefinitionFiles.forEach((typeFile) => {
      const virtualPath = typeFile.virtualPath || `ts:filename/${typeFile.id}.d.ts`
      monacoInstance.languages.typescript.typescriptDefaults.addExtraLib(
        typeFile.content,
        virtualPath
      )
    })
  }




  // Create virtual file models for local files
  if (localFiles && localFiles.length > 0) {
    console.log(`Creating models for ${localFiles.length} local files`);

    localFiles.forEach((file) => {
      let fileContent = file.content;

      // Ensure content is a valid TypeScript module
      if (!fileContent.trim()) {
        fileContent = "export default {};\nexport {}; // Ensure this is a module";
      } else if (!fileContent.includes('export') && !fileContent.includes('module.exports')) {
        fileContent += "\nexport {}; // Ensure this is a module";
      }

      // Create file model using file:/// protocol and /files/ path
      const fileUri = monacoInstance.Uri.parse(`file:///files/${file.id}.ts`);

      // Safely create model
      createModelSafely(monacoInstance, fileContent, file.language || "typescript", fileUri);
    });
  }

  // Create model for current editing file
  if (currentFile) {
    let fileContent = currentFile.content;

    // Ensure content is a valid TypeScript module
    if (!fileContent.trim()) {
      fileContent = "export default {};\nexport {}; // Ensure this is a module";
    } else if (!fileContent.includes('export') && !fileContent.includes('module.exports')) {
      fileContent += "\nexport {}; // Ensure this is a module";
    }

    // Create model for current editing file
    const currentUri = monacoInstance.Uri.parse(`file:///current/${currentFile.id}.ts`);

    // Safely create model for current editing file
    createModelSafely(monacoInstance, fileContent, currentFile.language || "typescript", currentUri);
  }

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
  fileId: string,
  content: string,
  pathPrefix: string = "current"
): void {
  if (!fileId || content === undefined) return

  const now = Date.now()
  const lastSync = lastSyncTime.get(fileId) || 0

  // Check if content has actually changed
  const cacheKey = fileId
  const cachedContent = contentCache.get(cacheKey)
  if (cachedContent === content) {
    return // No change, skip update
  }

  // Rate limiting: avoid too frequent updates
  if (now - lastSync < MIN_SYNC_INTERVAL) {
    console.log(`⏳ Rate limiting sync for ${fileId}, skipping`)
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
    // Update the model content directly without recreating
    const currentUri = monacoInstance.Uri.parse(`file:///${pathPrefix}/${fileId}.ts`)
    const existingModel = monacoInstance.editor.getModel(currentUri)

    if (existingModel) {
      // Update existing model content
      if (existingModel.getValue() !== fileContent) {
        existingModel.setValue(fileContent)
        console.log(`Updated model content for: ${fileId}`)
      }
    } else {
      // Create new model if it doesn't exist
      createModelSafely(monacoInstance, fileContent, "typescript", currentUri)
      console.log(`Created new model for: ${fileId}`)
    }

    // Update cache and sync time
    contentCache.set(cacheKey, content)
    lastSyncTime.set(fileId, now)

    // Update TypeScript extra lib only if content changed
    try {
      const extraLibs = monacoInstance.languages.typescript.typescriptDefaults.getExtraLibs()
      const libPath = `file:///${pathPrefix}/${fileId}.ts`
      const existingLib = extraLibs[libPath]

      if (!existingLib || existingLib.content !== fileContent) {
        monacoInstance.languages.typescript.typescriptDefaults.addExtraLib(
          fileContent,
          libPath
        )
        console.log(`✅ Updated TypeScript extra lib for: ${fileId}`)
      } else {
        console.log(`⏭️ TypeScript extra lib unchanged for: ${fileId}`)
      }
    } catch (libError) {
      console.warn(`❌ Failed to update TypeScript extra lib for ${fileId}:`, libError)
    }
  } catch (error) {
    console.error(`❌ Error syncing content for ${fileId}:`, error)
  }
}

/**
 * Configure TypeScript auto-completion
 */
export function configureTypeScriptAutoCompletion(
  monacoInstance: typeof monaco,
  localFiles?: FileInfo[],
  language: "typescript" | "typescriptreact" = "typescript"
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

  // TSX auto-completion provider
  if (language === "typescriptreact") {
    const tsxCompletionProvider = monacoInstance.languages.registerCompletionItemProvider(
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
    disposables.push(tsxCompletionProvider)
  }

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
