import { loader } from "@monaco-editor/react"
import * as monaco from "monaco-editor"
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker"
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker"
import { configureTypeScriptLanguage } from "./typescript-config"


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

    // Configure TypeScript language support with default settings
    configureTypeScriptLanguage(monacoInstance, {
      language: "typescript"
    })

    // Note: Plugin initialization is now handled by DynamicPluginManager in SimpleCodeEditor
    // This allows for per-editor-instance plugin configuration
    console.log("✅ Monaco setup complete - plugin initialization deferred to editor instances")

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

// Export TypeScript configuration functions for backward compatibility
export { configureTypeScriptLanguage, getTypeScriptEditorOptions } from "./typescript-config"
export { syncEditorContentToVirtualFileSystem } from "./virtual-file-system"

