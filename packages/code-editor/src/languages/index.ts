import type * as monaco from "monaco-editor"
import {
  configureTypeScriptLanguage,
  configureTypeScriptAutoCompletion,
  getTypeScriptEditorOptions,
  syncEditorContentToVirtualFileSystem,
  type TypeScriptConfigOptions
} from "./typescript"
import type { SupportedLanguage } from "../types"

export interface LanguageConfigContext {
  scriptPathMappings?: Record<string, string[]>
  dynamicPrompt?: string
  scriptTypes?: string
  allScripts?: Array<{
    id: string
    name?: string
    description?: string
    code?: string
    ts_code?: string
  }>
  currentScriptId?: string
  currentScriptContent?: string
}

/**
 * 语言配置管理器
 */
export class LanguageConfigManager {
  private disposables: monaco.IDisposable[] = []
  private isConfigured = false
  private lastConfiguredLanguage: SupportedLanguage | null = null

  /**
   * 配置指定语言（只支持 TypeScript）
   */
  configureLanguage(
    monacoInstance: typeof monaco,
    language: SupportedLanguage,
    context: LanguageConfigContext
  ): void {
    // For Monaco Editor, we always use 'typescript' language
    // JSX support is handled through file extensions (.tsx)
    const normalizedLanguage = "typescript"

    // If language changed, we need to reconfigure
    if (this.lastConfiguredLanguage !== normalizedLanguage) {
      console.log(`Language changed from ${this.lastConfiguredLanguage} to ${normalizedLanguage}, reconfiguring`)
      this.isConfigured = false
    }

    // Only configure once per language to avoid performance issues
    if (this.isConfigured && this.lastConfiguredLanguage === normalizedLanguage) {
      console.log(`Language ${normalizedLanguage} already configured, skipping reconfiguration`)
      return
    }

    console.log(`Configuring language: ${normalizedLanguage} (requested: ${language})`)
    this.isConfigured = true
    this.lastConfiguredLanguage = normalizedLanguage

    // Always use typescript language for both .ts and .tsx files
    const tsDisposables = configureTypeScriptLanguage(monacoInstance, {
      ...context,
      language: "typescript",
    })
    this.disposables.push(...tsDisposables)

    // const completionDisposables = configureTypeScriptAutoCompletion(
    //   monacoInstance,
    //   context.allScripts,
    //   "typescript"
    // )
    // this.disposables.push(...completionDisposables)
  }

  /**
   * 获取语言的默认编辑器选项（只支持 TypeScript）
   */
  getEditorOptions(_language: SupportedLanguage): monaco.editor.IStandaloneEditorConstructionOptions {
    // 只支持 TypeScript，直接返回 TypeScript 编辑器选项
    return getTypeScriptEditorOptions()
  }

  /**
   * 清理所有语言配置
   */
  dispose(): void {
    this.disposables.forEach(disposable => disposable.dispose())
    this.disposables = []
  }
}

// 导出 TypeScript 语言配置函数
export {
  configureTypeScriptLanguage,
  configureTypeScriptAutoCompletion,
  getTypeScriptEditorOptions,
  syncEditorContentToVirtualFileSystem,
  type TypeScriptConfigOptions,
}
