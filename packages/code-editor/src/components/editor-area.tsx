import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Editor from "@monaco-editor/react"
import * as monaco from "monaco-editor"

import { LanguageConfigManager } from "../languages"
import { syncEditorContentToVirtualFileSystem } from "../languages/typescript"
import {
  createModelSafely,
  getDefaultEditorOptions,
  setupMonacoModels,
} from "../monaco-setup"
import { getPluginManager } from "../plugins/plugin-manager"
import { FileType, type EditorRef, type FileModel } from "../types"
import { createEditorDebounce } from "../utils/debounce"

/**
 * 依赖文件管理 - 仅用于类型推断
 */
// 跟踪已添加到 TypeScript 语言服务的库
const addedExtraLibs = new Set<string>()

/**
 * 为依赖文件创建模型，不会影响当前编辑的文件
 */
function createModelSafelyForDependency(
  content: string,
  language: string,
  uri: monaco.Uri,
  currentFileUri?: string
): monaco.editor.ITextModel {
  const uriString = uri.toString()

  // 如果是当前文件，绝对不要修改其内容
  if (currentFileUri && uriString === currentFileUri) {
    const existingModel = monaco.editor.getModel(uri)
    if (existingModel) {
      console.log(`🔒 Skipping content update for current file: ${uriString}`)
      return existingModel
    }
  }

  // 对于依赖文件，可以正常创建或更新
  return createModelSafely(content, language, uri)
}

function setupDependencyModels(
  dependencies: readonly FileModel[],
  currentFileUri?: string
): void {
  console.log(
    `🔧 Setting up ${dependencies.length} dependency models for type context`
  )

  // 获取现有的依赖 models
  const existingModels = monaco.editor.getModels()
  const dependencyUris = new Set(
    dependencies.map((file) => `file:///${file.path}`)
  )

  // 清理不再需要的依赖 models（保留当前编辑的文件）
  existingModels.forEach((model) => {
    const uriString = model.uri.toString()
    if (uriString.startsWith("file:///") && !dependencyUris.has(uriString)) {
      // 如果提供了当前文件URI，确保不清理当前文件的模型
      if (currentFileUri && uriString === currentFileUri) {
        console.log(
          `🔒 Protecting current file model from cleanup: ${uriString}`
        )
        return
      }

      console.log(`🧹 Cleaning up unused dependency model: ${uriString}`)
      model.dispose()
    }
  })

  // 为每个依赖文件创建或更新 model
  const extraLibsToAdd: Array<{ content: string; filePath: string }> = []
  let hasModelUpdates = false

  dependencies.forEach((file) => {
    if (file.type === FileType.File && file.content !== undefined) {
      const uri = monaco.Uri.parse(`file:///${file.path}`)
      const uriString = uri.toString()

      // 跳过与当前文件相同 URI 的依赖文件，避免覆盖用户输入
      if (currentFileUri && uriString === currentFileUri) {
        console.log(
          `⏭️ Skipping dependency file with same URI as current file: ${uriString}`
        )
        return
      }

      try {
        // Check if this is an update to an existing model
        const existingModel = monaco.editor.getModel(uri)
        const isUpdate =
          existingModel && existingModel.getValue() !== file.content

        const model = createModelSafelyForDependency(
          file.content,
          file.language,
          uri,
          currentFileUri
        )

        if (isUpdate) {
          hasModelUpdates = true
          console.log(`🔄 Updated dependency model: ${file.path}`)
        }

        // Setup plugin listeners for this dependency model
        try {
          const pluginManager = getPluginManager()
          console.log(
            "Plugin manager initialized:",
            pluginManager.isInitialized()
          )
          const esmPlugin = pluginManager.getPlugin("esm-import-resolver")
          console.log("ESM plugin found:", esmPlugin ? "yes" : "no")
          if (esmPlugin) {
            console.log("ESM plugin enabled:", esmPlugin.isEnabled())
            if (esmPlugin.isEnabled()) {
              ;(esmPlugin as any).setupModelListeners(model)
            }
          }
        } catch (pluginError) {
          console.warn(
            "Failed to setup plugin listeners for dependency:",
            pluginError
          )
        }

        // 添加到 TypeScript 语言服务
        extraLibsToAdd.push({
          content: file.content,
          filePath: `file:///${file.path}`,
        })

        console.log(`✅ Setup dependency model: ${file.path}`)
      } catch (error) {
        console.error(
          `❌ Failed to setup dependency model for ${file.path}:`,
          error
        )
      }
    }
  })

  // 更新 TypeScript extra libraries
  if (extraLibsToAdd.length > 0) {
    // 只添加尚未添加的依赖文件到语言服务
    extraLibsToAdd.forEach(({ content, filePath }) => {
      if (!addedExtraLibs.has(filePath)) {
        try {
          monaco.languages.typescript.typescriptDefaults.addExtraLib(
            content,
            filePath
          )
          addedExtraLibs.add(filePath)
        } catch (error) {
          console.warn(`Failed to add extra lib for ${filePath}:`, error)
        }
      }
    })

    console.log(
      `✅ Added ${extraLibsToAdd.length} files to TypeScript language service`
    )
  }

  // 如果有模型更新，强制刷新 TypeScript 语言服务
  if (hasModelUpdates) {
    console.log(
      `🔄 Forcing TypeScript language service refresh due to dependency updates`
    )
    try {
      // 更温和的方式：重新添加 extra libraries 来触发 TypeScript 语言服务更新
      extraLibsToAdd.forEach(({ content, filePath }) => {
        try {
          monaco.languages.typescript.typescriptDefaults.addExtraLib(
            content,
            filePath
          )
          console.log(`🔄 Refreshed TypeScript lib: ${filePath}`)
        } catch (error) {
          console.warn(`Failed to refresh extra lib for ${filePath}:`, error)
        }
      })
    } catch (error) {
      console.warn("Failed to refresh TypeScript language service:", error)
    }
  }
}

/**
 * 重构后的 EditorArea Props - 职责分离
 */
interface EditorAreaProps {
  /** 当前正在编辑的文件 */
  currentFile: FileModel | null

  /** 依赖的文件列表，用于类型推断（内容相对稳定）*/
  dependencies: readonly FileModel[]

  /** 编辑器主题 */
  theme: string

  /** 保存回调 */
  onSave: (fileId: string, code: string) => void

  /** 内容变化回调 */
  onChange?: (fileId: string, code: string) => void

  /** 文件跳转回调 */
  onFileJump?: (fileId: string) => void
}

/**
 * 纯粹的编辑器组件 - 当前文件 + 依赖管理分离
 * 职责：只管理当前文件的编辑，依赖文件仅用于类型推断
 */
export const EditorArea = ({
  currentFile,
  dependencies,
  theme,
  onSave,
  onChange,
  onFileJump,
}: EditorAreaProps) => {
  const editorRef = useRef<EditorRef>({
    editor: null,
    save: () => {},
    layout: () => {},
  })
  const containerRef = useRef<HTMLDivElement>(null)
  const [isEditorReady, setIsEditorReady] = useState(false)
  const languageConfigManagerRef = useRef<LanguageConfigManager>(
    new LanguageConfigManager()
  )

  // 追踪当前文件的 model，避免重复创建
  const currentModelRef = useRef<monaco.editor.ITextModel | null>(null)

  // 存储光标位置（当前文件）
  const cursorPositionRef = useRef<monaco.Position | null>(null)

  // 标记是否正在进行程序性内容更新，避免触发 onChange
  const isProgrammaticUpdateRef = useRef(false)

  // Debug state for model information
  const [debugInfo, setDebugInfo] = useState<{
    models: Array<{
      uri: string
      language: string
      contentLength: number
      isActive: boolean
    }>
    activeModel: string | null
  }>({
    models: [],
    activeModel: null,
  })

  // Update debug info periodically
  useEffect(() => {
    const updateDebugInfo = () => {
      const editor = editorRef.current.editor
      const activeModel = editor?.getModel()
      const allModels = monaco.editor.getModels()

      setDebugInfo({
        models: allModels.map((model) => ({
          uri: model.uri.toString(),
          language: model.getLanguageId(),
          contentLength: model.getValue().length,
          isActive: model === activeModel,
        })),
        activeModel: activeModel?.uri.toString() || null,
      })
    }

    const interval = setInterval(updateDebugInfo, 1000) // Update every second
    return () => clearInterval(interval)
  }, [])

  // 1. 设置依赖文件的类型上下文（dependencies 变化时）
  useEffect(() => {
    if (dependencies.length > 0) {
      console.log(
        `🔧 Setting up ${dependencies.length} dependency files for type context`
      )

      try {
        // 获取当前活跃编辑器的模型URI作为保护（如果存在）
        const editor = editorRef.current.editor
        const currentModel = editor?.getModel()
        const currentFileUri = currentModel
          ? currentModel.uri.toString()
          : undefined

        // 为依赖文件创建 models（仅用于类型推断），避免与当前文件冲突
        setupDependencyModels(dependencies, currentFileUri)

        // 配置语言支持
        const context = {
          scriptPathMappings: {
            "@/scripts/*": ["file:///scripts/*"],
            "@/utils/*": ["file:///utils/*"],
          },
          allScripts: dependencies
            .filter((f) => f.type === FileType.File)
            .map((f) => ({
              id: f.id,
              name: f.name,
              code: f.content,
              ts_code: f.content,
            })),
        }

        languageConfigManagerRef.current.configureLanguage(
          monaco,
          "typescript",
          context
        )

        console.log(`✅ Dependency context setup complete`)
      } catch (error) {
        console.error("❌ Failed to setup dependency context:", error)
      }
    }
  }, [dependencies]) // 只依赖 dependencies，不依赖 currentFile

  // 2. 处理当前文件变化（currentFile 变化时 + 编辑器准备好后）
  useEffect(() => {
    const editor = editorRef.current.editor
    if (!editor || !isEditorReady) {
      console.log(`⏳ Editor not ready yet, skipping file setup`, {
        hasEditor: !!editor,
        isEditorReady,
      })
      return
    }

    if (!currentFile) {
      // 如果没有当前文件，清空编辑器
      console.log(`📄 No current file, clearing editor`)
      editor.setModel(null)
      currentModelRef.current = null
      cursorPositionRef.current = null
      return
    }

    console.log(`🎯 Switching to current file: ${currentFile.path}`, {
      contentLength: currentFile.content?.length || 0,
      contentPreview: currentFile.content?.substring(0, 100) || "NO CONTENT",
    })

    try {
      const uri = monaco.Uri.parse(`file:///${currentFile.path}`)

      // 获取或创建当前文件的 model
      let model = monaco.editor.getModel(uri)

      if (!model) {
        console.log(
          `📝 Creating new model for current file: ${currentFile.path}`
        )
        model = createModelSafely(currentFile.content || "", "typescript", uri)

        // Setup plugin listeners for the current file model
        try {
          const pluginManager = getPluginManager()
          const esmPlugin = pluginManager.getPlugin("esm-import-resolver")
          if (esmPlugin && esmPlugin.isEnabled()) {
            ;(esmPlugin as any).setupModelListeners(model)
            console.log(
              `🔌 Setup plugin listeners for current file: ${currentFile.path}`
            )
          }
        } catch (pluginError) {
          console.warn(
            "Failed to setup plugin listeners for current file:",
            pluginError
          )
        }
      } else {
        // Model already exists, update content if it differs from current file content
        const currentContent = model.getValue()
        if (currentContent !== (currentFile.content || "")) {
          console.log(
            `📝 Updating existing model content for: ${currentFile.path}`
          )
          isProgrammaticUpdateRef.current = true
          model.setValue(currentFile.content || "")
          // Reset flag after a brief delay to allow change event to process
          setTimeout(() => {
            isProgrammaticUpdateRef.current = false
          }, 10)
        } else {
          console.log(
            `📝 Using existing model for current file: ${currentFile.path} (content already matches)`
          )
        }
      }

      // 切换到当前文件的 model
      const currentModel = editor.getModel()
      if (
        !currentModel ||
        currentModel.uri.toString() !== model.uri.toString()
      ) {
        // 保存之前的光标位置
        if (currentModel) {
          const position = editor.getPosition()
          if (position) {
            cursorPositionRef.current = position
          }
        }

        console.log(`🔄 Setting editor model to: ${currentFile.path}`)
        editor.setModel(model)
        currentModelRef.current = model

        // 恢复光标位置
        if (cursorPositionRef.current) {
          setTimeout(() => {
            editor.setPosition(cursorPositionRef.current!)
            console.log(`🎯 Restored cursor position for ${currentFile.path}`)
          }, 10)
        }

        // 同步到虚拟文件系统
        syncEditorContentToVirtualFileSystem(
          monaco,
          currentFile.path,
          currentFile.content
        )
      }
    } catch (error) {
      console.error(
        `❌ Error setting up current file ${currentFile.path}:`,
        error
      )
    }
  }, [currentFile, isEditorReady]) // 添加 isEditorReady 依赖

  // Clean up language configuration
  useEffect(() => {
    return () => {
      languageConfigManagerRef.current.dispose()
    }
  }, [])

  // Debounced content sync to virtual file system
  const debouncedSyncContent = useCallback(
    createEditorDebounce((path: string, content: string) => {
      syncEditorContentToVirtualFileSystem(monaco, path, content)
      console.log(`🔄 Synced to virtual file system: ${path}`)
    }, "CONTENT_SYNC"),
    []
  )

  // Handle editor content changes
  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      if (!currentFile || value === undefined) return

      // Skip onChange callback during programmatic updates
      if (isProgrammaticUpdateRef.current) {
        console.log(
          `⏭️ Skipping onChange during programmatic update for: ${currentFile.path}`
        )
        return
      }

      // Get current content from the model (source of truth)
      const editor = editorRef.current.editor
      if (!editor) return

      const model = editor.getModel()
      if (!model) return

      const currentContent = model.getValue()

      // Sync to virtual file system (fixed to not reset active editor content)
      debouncedSyncContent(currentFile.path, currentContent)

      // Notify external handler of content change
      onChange?.(currentFile.id, currentContent)

      // Save current cursor position
      const currentPosition = editor.getPosition()
      if (currentPosition) {
        cursorPositionRef.current = currentPosition
      }
    },
    [currentFile, onChange, debouncedSyncContent]
  )

  // Handle editor mount
  const handleEditorMount = (
    editor: monaco.editor.IStandaloneCodeEditor,
    monacoInstance: typeof monaco
  ) => {
    console.log("🎯 Editor mounted")
    editorRef.current.editor = editor
    editorRef.current.layout = () => editor.layout()

    // Setup keyboard shortcuts
    editor.addAction({
      id: "format-document",
      label: "Format Document",
      keybindings: [
        monacoInstance.KeyMod.Alt |
          monacoInstance.KeyMod.Shift |
          monacoInstance.KeyCode.KeyF,
      ],
      run: () => {
        editor.getAction("editor.action.formatDocument")?.run()
      },
    })

    editor.addAction({
      id: "toggle-comment",
      label: "Toggle Comment",
      keybindings: [
        monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.Slash,
      ],
      run: () => {
        editor.getAction("editor.action.commentLine")?.run()
      },
    })

    setIsEditorReady(true)
  }

  // Setup save functionality and dynamic actions
  useEffect(() => {
    const editor = editorRef.current.editor
    if (!editor || !isEditorReady) return

    const disposables: monaco.IDisposable[] = []

    // Setup save function
    editorRef.current.save = () => {
      if (!currentFile) return

      const code = editor.getValue()
      console.log(`Saving file: ${currentFile.id}`, code.length, "characters")
      onSave(currentFile.id, code)
    }

    // Register save action
    const saveAction = editor.addAction({
      id: "save",
      label: "Save",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: () => editorRef.current.save(),
    })
    disposables.push(saveAction)

    // Go-to-definition handler
    const handleGoToDefinition = async (position: monaco.Position) => {
      const model = editor.getModel()
      if (!model) return

      try {
        const definitions = await monaco.languages.typescript
          .getTypeScriptWorker()
          .then((worker) => worker(model.uri))
          .then((client) =>
            client.getDefinitionAtPosition(
              model.uri.toString(),
              model.getOffsetAt(position)
            )
          )

        if (definitions && definitions.length > 0) {
          const definition = definitions[0]
          const targetPath = definition.fileName.replace(/^file:\/\/\//, "")

          const targetFile = dependencies.find(
            (f) => f.path === targetPath && f.path !== "eidos.ts"
          )
          console.warn("define", definition, targetFile)

          if (targetFile) {
            onFileJump?.(targetFile.id)
          }
        }
      } catch (error) {
        console.error("Go to definition failed:", error)
      }
    }

    // Register go-to-definition action
    const gotoDefinitionAction = editor.addAction({
      id: "go-to-definition",
      label: "Go to Definition",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.F12],
      run: async () => {
        const position = editor.getPosition()
        if (position) {
          await handleGoToDefinition(position)
        }
      },
    })
    disposables.push(gotoDefinitionAction)

    // Mouse down event for Ctrl+Click navigation
    const mouseDownDisposable = editor.onMouseDown((e) => {
      if ((e.event.ctrlKey || e.event.metaKey) && e.target.position) {
        handleGoToDefinition(e.target.position)
      }
    })
    disposables.push(mouseDownDisposable)

    return () => {
      disposables.forEach((d) => d.dispose())
    }
  }, [isEditorReady, currentFile, onSave, onFileJump, dependencies])

  // No current file state
  if (!currentFile) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center text-gray-500 dark:text-gray-400">
          <p className="text-lg font-medium">No file selected</p>
          <p className="text-sm mt-2">Select a file to start editing</p>
          <div className="mt-4 text-xs">
            <p>Dependencies: {dependencies.length}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="h-full w-full relative">
      <Editor
        height="100%"
        width="100%"
        theme={theme}
        options={{
          ...getDefaultEditorOptions(),
          ...languageConfigManagerRef.current.getEditorOptions("typescript"),
        }}
        onChange={handleEditorChange}
        onMount={handleEditorMount}
        loading={<div className="p-4">Loading editor...</div>}
      />

      {/* Debug Panel */}
      <div className="absolute top-2 right-2 bg-black/80 text-white text-xs p-2 rounded max-w-sm max-h-40 overflow-auto font-mono hidden">
        <div className="font-bold mb-1">Monaco Models Debug</div>
        <div className="mb-1">
          Active:{" "}
          {debugInfo.activeModel
            ? debugInfo.activeModel.split("/").pop()
            : "None"}
        </div>
        <div className="space-y-1">
          {debugInfo.models.map((model) => (
            <div
              key={model.uri}
              className={`text-xs ${model.isActive ? "text-green-400 font-bold" : "text-gray-300"}`}
            >
              <div className="flex justify-between gap-2">
                <span className="truncate flex-1" title={model.uri}>
                  {model.uri.split("/").pop() || model.uri}
                </span>
                <span>{model.contentLength}ch</span>
                <span className="text-blue-300">{model.language}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-1 pt-1 border-t border-gray-600 text-gray-400">
          Total: {debugInfo.models.length} models
        </div>
      </div>
    </div>
  )
}

export default EditorArea
