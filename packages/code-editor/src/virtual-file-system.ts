import type * as monaco from "monaco-editor"
import { createModelSafely } from "./monaco-setup"

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
  filePath: string,
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
  } else if (
    !fileContent.includes("export") &&
    !fileContent.includes("module.exports")
  ) {
    fileContent += "\nexport {}; // Ensure this is a module"
  }

  try {
    // Always use typescript language - JSX support is handled by file extension
    const language = "typescript"

    // Create URI with correct extension
    const currentUri = monacoInstance.Uri.parse(`file:///${filePath}`)
    const existingModel = monacoInstance.editor.getModel(currentUri)

    if (existingModel) {
      // For currently editing file, don't modify its content, only update extra lib
      // Only update content when model is not the current active editor's model
      const activeEditor = monacoInstance.editor
        .getEditors()
        .find((editor) => editor.getModel() === existingModel)

      if (!activeEditor) {
        // This is a dependency file's model, can safely update
        if (existingModel.getValue() !== fileContent) {
          existingModel.setValue(fileContent)
          console.log(`Updated dependency model content for: ${filePath}`)
        }
      } else {
        console.log(
          `⏭️ Skipping content update for active editor model: ${filePath}`
        )
      }

      // Ensure language setting is correct
      if (existingModel.getLanguageId() !== language) {
        monacoInstance.editor.setModelLanguage(existingModel, language)
        console.log(`Updated language to ${language} for: ${filePath}`)
      }
    } else {
      // Create new model with correct language
      createModelSafely(fileContent, language, currentUri)
      console.log(
        `Created new model for: ${filePath} with language: ${language}`
      )
    }

    // Update cache and sync time
    contentCache.set(cacheKey, content)
    lastSyncTime.set(filePath, now)

    // Update TypeScript extra lib with correct path
    try {
      const extraLibs =
        monacoInstance.languages.typescript.typescriptDefaults.getExtraLibs()
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
      console.warn(
        `❌ Failed to update TypeScript extra lib for ${filePath}:`,
        libError
      )
    }
  } catch (error) {
    console.error(`❌ Error syncing content for ${filePath}:`, error)
  }
}

// Note: Import auto-completion is now handled by the ESM Import Resolver Plugin
// This provides a unified approach for all import suggestions (external packages + local files)
