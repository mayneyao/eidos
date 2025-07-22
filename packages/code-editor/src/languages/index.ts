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

  /**
   * 配置指定语言（只支持 TypeScript）
   */
  configureLanguage(
    monacoInstance: typeof monaco,
    language: SupportedLanguage,
    context: LanguageConfigContext
  ): void {
    // Only configure once to avoid performance issues
    if (this.isConfigured) {
      console.log("Language already configured, skipping reconfiguration")
      return
    }

    console.log("Configuring language for the first time")
    this.isConfigured = true

    // 只支持 TypeScript 和 TypeScript React
    const tsLanguage = language === "typescriptreact" ? "typescriptreact" : "typescript"
    const tsDisposables = configureTypeScriptLanguage(monacoInstance, {
      ...context,
      language: tsLanguage,
    })
    this.disposables.push(...tsDisposables)

    const completionDisposables = configureTypeScriptAutoCompletion(
      monacoInstance,
      context.allScripts,
      tsLanguage
    )
    this.disposables.push(...completionDisposables)
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
