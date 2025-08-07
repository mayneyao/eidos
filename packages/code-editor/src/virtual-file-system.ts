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
      // 对于当前正在编辑的文件，不要修改其内容，只更新 extra lib
      // 只有当模型不是当前活跃编辑器的模型时才更新内容
      const activeEditor = monacoInstance.editor.getEditors().find(editor => 
        editor.getModel() === existingModel
      )
      
      if (!activeEditor) {
        // 这是一个依赖文件的模型，可以安全更新
        if (existingModel.getValue() !== fileContent) {
          existingModel.setValue(fileContent)
          console.log(`Updated dependency model content for: ${filePath}`)
        }
      } else {
        console.log(`⏭️ Skipping content update for active editor model: ${filePath}`)
      }
      
      // 确保语言设置正确
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

// Note: Import auto-completion is now handled by the ESM Import Resolver Plugin
// This provides a unified approach for all import suggestions (external packages + local files)