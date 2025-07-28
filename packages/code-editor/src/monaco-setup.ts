import { loader } from "@monaco-editor/react"
import * as monaco from "monaco-editor"
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker"
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker"
import type { FileModel } from "./types";
import { FileType } from "./types"
import { getPluginManager } from "./plugins/plugin-manager"

/**
 * Set up Monaco Environment and Workers
 */
export function setupMonacoEnvironment(): Promise<typeof monaco> {
  console.log("🔧 Setting up Monaco Environment and Workers")

  self.MonacoEnvironment = {
    getWorker(_, label) {
      console.log(`🔧 Creating worker for label: ${label}`)
      if (label === "typescript" || label === "javascript" || label === "javascriptreact") {
        return new tsWorker()
      }
      return new editorWorker()
    },
  }

  loader.config({ monaco })

  return loader.init().then(async (monacoInstance) => {
    console.log("✅ Monaco Editor loader initialized")

    // Log available languages for debugging
    const supportedLanguages = monacoInstance.languages.getLanguages()
    console.log("📋 Available languages:", supportedLanguages.map(lang => lang.id).join(', '))

    // Note: Monaco Editor handles JSX through TypeScript language with .tsx file extensions
    // No need to register a separate 'typescriptreact' language

    // Initialize plugins after Monaco is ready
    try {
      const pluginManager = getPluginManager()
      await pluginManager.initialize()
      console.log("✅ Plugins initialized")
    } catch (error) {
      console.error("❌ Failed to initialize plugins:", error)
    }

    return monacoInstance
  })
}

/**
 * Safe model creation helper function
 */
export function createModelSafely(
  content: string,
  language: string,
  uri: monaco.Uri
): monaco.editor.ITextModel {
  // Check if model already exists
  const existingModel = monaco.editor.getModel(uri)
  if (existingModel) {
    console.log(`Model already exists for ${uri.toString()}, updating content`)
    // Only update if content is different
    if (existingModel.getValue() !== content) {
      existingModel.setValue(content)
    }
    // Ensure language is set correctly
    if (existingModel.getLanguageId() !== language) {
      console.log(`Updating language from ${existingModel.getLanguageId()} to ${language}`)
      monaco.editor.setModelLanguage(existingModel, language)
    }
    return existingModel
  }

  // Always use typescript language - JSX support is handled by file extension
  const path = uri.path
  let detectedLanguage = 'typescript'

  // For non-TypeScript files, keep original language detection
  if (path.endsWith('.js')) {
    detectedLanguage = 'javascript'
  } else if (path.endsWith('.jsx')) {
    detectedLanguage = 'javascriptreact'
  }

  console.log(`🔍 Language detection for ${uri.toString()}:`)
  console.log(`  - Path: ${path}`)
  console.log(`  - Original language: ${language}`)
  console.log(`  - Detected language: ${detectedLanguage}`)
  console.log(`  - Is TSX file: ${path.endsWith('.tsx')}`)

  // Create new model
  try {
    const model = monaco.editor.createModel(content, detectedLanguage, uri)
    console.log(`Created new model: ${uri.toString()} with language: ${model.getLanguageId()}`)

    return model
  } catch (error) {
    console.error(`Failed to create model for ${uri.toString()}:`, error)
    // If creation fails, try to get existing model
    const fallbackModel = monaco.editor.getModel(uri)
    if (fallbackModel) {
      console.log(`Using existing model as fallback: ${uri.toString()}`)
      return fallbackModel
    }
    throw error
  }
}

// Track if Monaco has been set up to avoid repeated setup
let isMonacoSetup = false

/**
 * Set up Monaco models and TypeScript configuration for file list
 */
export function setupMonacoModels(files: FileModel[]): void {
  console.log("=== Setting up Monaco models and TypeScript configuration ===")
  console.log("File count:", files.length)

  console.warn('setupMonacoModels', files)
  // Get all existing model URIs
  const existingModels = monaco.editor.getModels()
  console.log("Existing model count:", existingModels.length)

  // Clean up any unwanted inmemory models
  const inmemoryModels = existingModels.filter(model =>
    model.uri.scheme === 'inmemory'
  )
  if (inmemoryModels.length > 0) {
    console.log(`Disposing ${inmemoryModels.length} unwanted inmemory models`)
    inmemoryModels.forEach(model => model.dispose())
  }

  // Get new file URIs
  const newUris = new Set(
    files
      .filter(file => file.type === FileType.File)
      .map(file => `file:///${file.path}`)
  )
  console.log("New file URIs:", Array.from(newUris))

  // Only clean up models that are no longer needed
  existingModels.forEach((model) => {
    const uriString = model.uri.toString()
    if (!newUris.has(uriString)) {
      model.dispose()
      console.log(`Disposed unused model: ${uriString}`)
    }
  })

  // Only set up TypeScript configuration once to avoid performance issues
  if (!isMonacoSetup) {
    console.log("Setting up TypeScript configuration for the first time")

    // Set up simplified TypeScript compiler options
    const tsCompilerOptions = {
      target: monaco.languages.typescript.ScriptTarget.ES2020,
      lib: ["es2020", "dom"],
      allowNonTsExtensions: true,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      module: monaco.languages.typescript.ModuleKind.ESNext,
      noEmit: true,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      strict: false,
      skipLibCheck: true,
      allowJs: false,
      checkJs: false,
      jsx: monaco.languages.typescript.JsxEmit.React,
      forceConsistentCasingInFileNames: false, // Simplified configuration
      resolveJsonModule: true,
      isolatedModules: false, // Allow cross-file type checking
      baseUrl: "file:///",
      // Simplified path mapping
      paths: {
        "./*": ["file:///./*"],
        "*": ["file:///*"]
      },
    }

    console.log("Setting TypeScript compiler options:", tsCompilerOptions)
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions(tsCompilerOptions)

    // TypeScript configuration handles both .ts and .tsx files
    console.log("TypeScript configuration complete with JSX support")

    //     // Add React types for TSX support
    //     const reactTypes = `
    // declare namespace React {
    //   interface Component<P = {}, S = {}> {}
    //   interface FC<P = {}> {
    //     (props: P): JSX.Element | null;
    //   }
    //   function createElement<P>(
    //     type: string | FC<P>,
    //     props?: P,
    //     ...children: any[]
    //   ): JSX.Element;
    //   function Fragment(props: { children?: any }): JSX.Element;
    // }

    // declare global {
    //   namespace JSX {
    //     interface Element {}
    //     interface IntrinsicElements {
    //       [elemName: string]: any;
    //     }
    //   }
    // }

    // declare const React: typeof React;
    // export = React;
    // export as namespace React;
    // `

    // Add React types to TypeScript language service
    // monaco.languages.typescript.typescriptDefaults.addExtraLib(
    //   reactTypes,
    //   'file:///node_modules/@types/react/index.d.ts'
    // )

    // console.log("✅ TypeScript compiler options and React types set")

    const diagnosticsOptions = {
      noSemanticValidation: false,
      noSyntaxValidation: false,
      noSuggestionDiagnostics: false,
      diagnosticCodesToIgnore: [
        1108, // 'return' statement is not expected here
        1005, // '}' expected
        1002, // Unterminated string literal
        1003, // Identifier expected
        1109, // Expression expected
        1128, // Declaration or statement expected
        2304, // Cannot find name (临时的，用户还在输入时)
      ],
    }

    console.log("Setting TypeScript diagnostic options:", diagnosticsOptions)
    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions(diagnosticsOptions)

    // Don't set JavaScript diagnostics since we only support TypeScript
    console.log("✅ TypeScript diagnostics enabled (applies to both .ts and .tsx files)")

    isMonacoSetup = true
  } else {
    console.log("TypeScript configuration already set up, skipping")
  }

  // Create or update model for each file
  const fileModels: Record<string, monaco.editor.ITextModel> = {}
  const extraLibsToAdd: Array<{ content: string; filePath: string }> = []

  files.forEach((file) => {
    if (file.type === FileType.File && file.content !== undefined) {
      const uri = monaco.Uri.parse(`file:///${file.path}`)

      try {
        const model = createModelSafely(file.content, file.language, uri)
        fileModels[file.id] = model

        // Setup plugin listeners for this model
        try {
          const pluginManager = getPluginManager()
          console.log('Plugin manager initialized:', pluginManager.isInitialized())
          const esmPlugin = pluginManager.getPlugin('esm-import-resolver')
          console.log('ESM plugin found:', esmPlugin ? 'yes' : 'no')
          if (esmPlugin) {
            console.log('ESM plugin enabled:', esmPlugin.isEnabled())
            if (esmPlugin.isEnabled()) {
              ; (esmPlugin as any).setupModelListeners(model)
            }
          }
        } catch (pluginError) {
          console.warn('Failed to setup plugin listeners:', pluginError)
        }

        // Collect files that need to be added to TypeScript language service
        if (file.language === "typescript") {
          extraLibsToAdd.push({
            content: file.content,
            filePath: `file:///${file.path}`
          })
        }
      } catch (error) {
        console.error(`Failed to create model for file ${file.path}:`, error)
      }
    }
  })

  // Reset TypeScript extra libraries (avoid duplicate additions)
  if (extraLibsToAdd.length > 0) {
    // Clear all existing extra libraries
    monaco.languages.typescript.typescriptDefaults.setExtraLibs([])

    // Add new extra libraries
    extraLibsToAdd.forEach(({ content, filePath }) => {
      try {
        monaco.languages.typescript.typescriptDefaults.addExtraLib(content, filePath)
      } catch (error) {
        console.warn(`Failed to add extra lib for ${filePath}:`, error)
      }
    })
  }

  console.log("✅ All file models created successfully")

  // Force trigger TypeScript language service to process all models
  setTimeout(() => {
    console.log("🔄 Triggering TypeScript language service to process models...")

    Object.values(fileModels).forEach((model) => {
      const markers = monaco.editor.getModelMarkers({ resource: model.uri })
      console.log(`Model ${model.uri.toString()} markers:`, markers.length)
    })

    console.log("✅ TypeScript language service has processed all models")
  }, 1000) // Increased delay time

  // Debug information
  setTimeout(() => {
    console.log("=== Monaco Editor Multi-File Setup Complete ===")

    // Check for any remaining inmemory models
    const allModels = monaco.editor.getModels()
    const inmemoryModels = allModels.filter(model => model.uri.scheme === 'inmemory')
    if (inmemoryModels.length > 0) {
      console.warn(`⚠️ Found ${inmemoryModels.length} inmemory models that should be cleaned up:`)
      inmemoryModels.forEach(model => {
        console.warn(`  - ${model.uri.toString()}: ${model.getLanguageId()}`)
      })
    }

    console.log("All models after setup:")
    allModels.forEach((model) => {
      const markers = monaco.editor.getModelMarkers({ resource: model.uri })
      console.log(`- ${model.uri.toString()}: ${model.getLanguageId()} (${markers.length} markers)`)
      if (markers.length > 0) {
        markers.forEach(marker => {
          console.log(`  ${marker.severity === 8 ? 'Error' : 'Warning'}: ${marker.message}`)
        })
      }
    })

    // Check compiler options
    const compilerOptions = monaco.languages.typescript.typescriptDefaults.getCompilerOptions()
    console.log("TypeScript compiler options:", compilerOptions)

    // Check diagnostic options
    const diagnosticsOptions = monaco.languages.typescript.typescriptDefaults.getDiagnosticsOptions()
    console.log("TypeScript diagnostics options:", diagnosticsOptions)

    // Check extra libraries
    const extraLibs = monaco.languages.typescript.typescriptDefaults.getExtraLibs()
    console.log("TypeScript extra libs:", Object.keys(extraLibs))

    // Check if type checking is working
    const allMarkers = monaco.editor.getModelMarkers({})
    console.log("Total markers:", allMarkers.length)

    if (allMarkers.length === 0) {
      console.log("✅ No type errors found - multi-file setup appears to be working!")
    } else {
      console.log("ℹ️ Found markers (errors/warnings):", allMarkers.length)
    }
  }, 3000) // Increased delay to ensure language service is fully initialized
}

/**
 * Get default editor options
 */
export function getDefaultEditorOptions(): monaco.editor.IStandaloneEditorConstructionOptions {
  return {
    minimap: { enabled: false },
    wordWrap: "on",
    scrollBeyondLastLine: false,
    automaticLayout: true,
    fontSize: 14,
    // Ensure all intelligent features are enabled
    quickSuggestions: {
      other: true,
      comments: false,
      strings: false,
    },
    suggestOnTriggerCharacters: true,
    acceptSuggestionOnEnter: "on",
    tabCompletion: "on",
    wordBasedSuggestions: "allDocuments",
    // Enable parameter hints
    parameterHints: {
      enabled: true,
      cycle: true,
    },
    // Enable hover hints
    hover: {
      enabled: true,
      delay: 300,
    },
    // Enable code completion
    suggest: {
      showKeywords: true,
      showSnippets: true,
      showClasses: true,
      showFunctions: true,
      showVariables: true,
      showModules: true,
      showProperties: true,
      showMethods: true,
    },
  }
}
