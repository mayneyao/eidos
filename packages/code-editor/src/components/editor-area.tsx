import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Editor, { DiffEditor } from "@monaco-editor/react"
import * as monaco from "monaco-editor"

import {
  createModelSafely,
  getDefaultEditorOptions,
  getTypeScriptEditorOptions,
  syncEditorContentToVirtualFileSystem,
} from "../monaco-setup"
import type { DynamicPluginManager } from "../plugins/dynamic-plugin-manager"
import { FileType, type EditorRef, type FileModel } from "../types"
import { createEditorDebounce } from "../utils/debounce"

/**
 * Dependency file management - only for type inference
 */
// Track libraries added to TypeScript language service
const addedExtraLibs = new Set<string>()

/**
 * Create models for dependency files, won't affect currently editing file
 */
function createModelSafelyForDependency(
  content: string,
  language: string,
  uri: monaco.Uri,
  currentFileUri?: string
): monaco.editor.ITextModel {
  const uriString = uri.toString()

  // If it's the current file, never modify its content
  if (currentFileUri && uriString === currentFileUri) {
    const existingModel = monaco.editor.getModel(uri)
    if (existingModel) {
      console.log(`🔒 Skipping content update for current file: ${uriString}`)
      return existingModel
    }
  }

  // For dependency files, can create or update normally
  return createModelSafely(content, language, uri)
}

function setupDependencyModels(
  dependencies: readonly FileModel[],
  currentFileUri?: string,
  pluginManager?: DynamicPluginManager | null
): void {
  console.log(
    `🔧 Setting up ${dependencies.length} dependency models for type context`
  )

  // Get existing dependency models
  const existingModels = monaco.editor.getModels()
  const dependencyUris = new Set(
    dependencies.map((file) => `file:///${file.path}`)
  )

  // Clean up no longer needed dependency models (keep currently editing file)
  existingModels.forEach((model) => {
    const uriString = model.uri.toString()
    if (uriString.startsWith("file:///") && !dependencyUris.has(uriString)) {
      // If current file URI is provided, ensure not to clean up current file's model
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

  // Create or update model for each dependency file
  const extraLibsToAdd: Array<{ content: string; filePath: string }> = []
  let hasModelUpdates = false

  dependencies.forEach((file) => {
    if (file.type === FileType.File && file.content !== undefined) {
      const uri = monaco.Uri.parse(`file:///${file.path}`)
      const uriString = uri.toString()

      // Skip dependency files with same URI as current file to avoid overwriting user input
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
          if (pluginManager) {
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
          }
        } catch (pluginError) {
          console.warn(
            "Failed to setup plugin listeners for dependency:",
            pluginError
          )
        }

        // Add to TypeScript language service
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

  // Update TypeScript extra libraries
  if (extraLibsToAdd.length > 0) {
    // Only add dependency files not yet added to language service
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

  // If there are model updates, force refresh TypeScript language service
  if (hasModelUpdates) {
    console.log(
      `🔄 Forcing TypeScript language service refresh due to dependency updates`
    )
    try {
      // Gentler approach: re-add extra libraries to trigger TypeScript language service update
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
 * Refactored EditorArea Props - separation of concerns
 */
interface EditorAreaProps {
  /** Currently editing file */
  currentFile: FileModel | null

  /** List of dependency files for type inference (content relatively stable) */
  dependencies: readonly FileModel[]

  /** Optional original code for diff mode */
  diffCode?: string

  /** Editor theme */
  theme: string

  /** Save callback */
  onSave: (fileId: string, code: string) => void

  /** Content change callback */
  onChange?: (fileId: string, code: string) => void

  /** File navigation callback */
  onFileJump?: (fileId: string) => void

  /** Optional dynamic plugin manager instance */
  pluginManager?: DynamicPluginManager | null
}

export const EditorArea = ({
  currentFile,
  dependencies,
  diffCode,
  theme,
  onSave,
  onChange,
  onFileJump,
  pluginManager,
}: EditorAreaProps) => {
  const editorRef = useRef<EditorRef>({
    editor: null,
    save: () => {},
    layout: () => {},
  })

  // Helper function to get plugin manager (only use provided one, no fallback)
  const getActivePluginManager = useCallback(() => {
    if (!pluginManager) {
      console.warn(
        "No plugin manager provided to EditorArea, plugin features will be disabled"
      )
      return null
    }
    return pluginManager
  }, [pluginManager])
  const containerRef = useRef<HTMLDivElement>(null)
  const [isEditorReady, setIsEditorReady] = useState(false)

  // Track current file's model to avoid duplicate creation
  const currentModelRef = useRef<monaco.editor.ITextModel | null>(null)

  // Store cursor position (current file)
  const cursorPositionRef = useRef<monaco.Position | null>(null)

  // Mark if programmatic content update is in progress to avoid triggering onChange
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

  // 1. Set up dependency files type context (when dependencies change)
  useEffect(() => {
    if (dependencies.length > 0) {
      console.log(
        `🔧 Setting up ${dependencies.length} dependency files for type context`
      )

      try {
        // Get current active editor's model URI as protection (if exists)
        const editor = editorRef.current.editor
        const currentModel = editor?.getModel()
        const currentFileUri = currentModel
          ? currentModel.uri.toString()
          : undefined

        // Create models for dependency files (only for type inference), avoid conflicts with current file
        setupDependencyModels(dependencies, currentFileUri, pluginManager)

        // Configure language support
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

        // TypeScript language configuration is now handled automatically in monaco-setup.ts

        console.log(`✅ Dependency context setup complete`)
      } catch (error) {
        console.error("❌ Failed to setup dependency context:", error)
      }
    }
  }, [dependencies]) // Only depend on dependencies, not currentFile

  // 2. Handle current file changes (when currentFile changes + after editor is ready)
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
      // If no current file, clear editor
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

      // Get or create current file's model
      let model = monaco.editor.getModel(uri)

      if (!model) {
        console.log(
          `📝 Creating new model for current file: ${currentFile.path}`
        )
        model = createModelSafely(currentFile.content || "", "typescript", uri)

        // Setup plugin listeners for the current file model
        try {
          const activePluginManager = getActivePluginManager()
          if (activePluginManager) {
            const esmPlugin = activePluginManager.getPlugin(
              "esm-import-resolver"
            )
            if (esmPlugin && esmPlugin.isEnabled()) {
              ;(esmPlugin as any).setupModelListeners(model)
              console.log(
                `🔌 Setup plugin listeners for current file: ${currentFile.path}`
              )
            }
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

      // Switch to current file's model
      const currentModel = editor.getModel()
      if (
        !currentModel ||
        currentModel.uri.toString() !== model.uri.toString()
      ) {
        // Save previous cursor position
        if (currentModel) {
          const position = editor.getPosition()
          if (position) {
            cursorPositionRef.current = position
          }
        }

        console.log(`🔄 Setting editor model to: ${currentFile.path}`)
        editor.setModel(model)
        currentModelRef.current = model

        // Restore cursor position
        if (cursorPositionRef.current) {
          setTimeout(() => {
            editor.setPosition(cursorPositionRef.current!)
            console.log(`🎯 Restored cursor position for ${currentFile.path}`)
          }, 10)
        }

        // Sync to virtual file system
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
  }, [currentFile, isEditorReady])

  // Language configuration cleanup is no longer needed as it's handled globally

  // Common editor setup functions
  const setupKeyboardShortcuts = useCallback(
    (
      editor: monaco.editor.IStandaloneCodeEditor,
      monacoInstance: typeof monaco
    ) => {
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
    },
    []
  )

  const setupDependencyContext = useCallback(
    (currentFileUri?: string) => {
      if (dependencies.length > 0) {
        console.log(
          `🔧 Setting up ${dependencies.length} dependency models for editor type context`
        )

        try {
          // Setup dependency models (reuse existing logic)
          setupDependencyModels(dependencies, currentFileUri, pluginManager)

          // Configure language support
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

          // TypeScript language configuration is now handled automatically in monaco-setup.ts

          console.log(`✅ Editor dependency context setup complete`)
        } catch (error) {
          console.error("❌ Failed to setup editor dependency context:", error)
        }
      }
    },
    [dependencies]
  )

  const setupPluginListeners = useCallback(
    (model: monaco.editor.ITextModel, modelPath?: string) => {
      try {
        const activePluginManager = getActivePluginManager()
        if (activePluginManager) {
          const esmPlugin = activePluginManager.getPlugin("esm-import-resolver")
          if (esmPlugin && esmPlugin.isEnabled()) {
            ;(esmPlugin as any).setupModelListeners(model)
            console.log(
              `🔌 Setup ESM plugin listeners for model: ${modelPath || model.uri.toString()}`
            )
          }
        }
      } catch (pluginError) {
        console.warn("Failed to setup plugin listeners for model:", pluginError)
      }
    },
    [getActivePluginManager]
  )

  // Handle editor content change monitoring
  const setupChangeMonitoring = useCallback(
    (editor: monaco.editor.IStandaloneCodeEditor) => {
      if (currentFile) {
        editor.onDidChangeModelContent(() => {
          const value = editor.getValue()
          onChange?.(currentFile.id, value)
        })
      }
    },
    [currentFile, onChange]
  )
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
    setupKeyboardShortcuts(editor, monacoInstance)

    if (currentFile && currentFile.content) {
      const uri = monaco.Uri.parse(`file:///${currentFile.path}`)
      let model = monaco.editor.getModel(uri)

      if (!model) {
        console.log(`📝 Creating model for editor mount: ${currentFile.path}`)
        model = createModelSafely(currentFile.content, "typescript", uri)
      } else if (model.getValue() !== currentFile.content) {
        console.log(
          `📝 Updating model content on editor mount: ${currentFile.path}`
        )
        isProgrammaticUpdateRef.current = true
        model.setValue(currentFile.content)
        setTimeout(() => {
          isProgrammaticUpdateRef.current = false
        }, 10)
      }

      editor.setModel(model)
      currentModelRef.current = model

      // Setup plugin listeners for the initial file model
      setupPluginListeners(model, currentFile.path)
    }

    setIsEditorReady(true)
  }

  // Handle diff editor mount
  const handleDiffEditorMount = useCallback(
    (
      editor: monaco.editor.IStandaloneDiffEditor,
      monacoInstance: typeof monaco
    ) => {
      console.log("🎯 Diff editor mounted")
      editorRef.current.editor = editor.getModifiedEditor()
      editorRef.current.layout = () => editor.layout()

      const modifiedEditor = editor.getModifiedEditor()
      const originalEditor = editor.getOriginalEditor()

      // Setup keyboard shortcuts for the modified editor
      setupKeyboardShortcuts(modifiedEditor, monacoInstance)

      // Monitor changes on the modified editor for diff mode
      setupChangeMonitoring(modifiedEditor)

      // Setup dependency models and context for diff editor
      if (dependencies.length > 0) {
        // Get current models for protection
        const originalModel = originalEditor.getModel()
        const modifiedModel = modifiedEditor.getModel()
        const currentFileUris = [
          originalModel?.uri.toString(),
          modifiedModel?.uri.toString(),
        ].filter(Boolean)

        // Setup dependency context
        setupDependencyContext(currentFileUris[0])

        // Setup plugin listeners for both models
        if (currentFile) {
          if (modifiedModel) {
            setupPluginListeners(modifiedModel, currentFile.path)
          }
          if (originalModel) {
            setupPluginListeners(originalModel, currentFile.path)
          }
        }
      }

      setIsEditorReady(true)
    },
    [
      currentFile,
      setupKeyboardShortcuts,
      setupChangeMonitoring,
      setupDependencyContext,
      setupPluginListeners,
      dependencies,
    ]
  )

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
      {diffCode ? (
        <DiffEditor
          height="100%"
          width="100%"
          theme={theme}
          original={currentFile.content || ""}
          modified={diffCode}
          language="typescript"
          options={{
            ...getDefaultEditorOptions(),
            ...getTypeScriptEditorOptions(),
            readOnly: false,
            renderSideBySide: true,
            ignoreTrimWhitespace: false,
            renderOverviewRuler: true,
            diffWordWrap: "on",
          }}
          onMount={handleDiffEditorMount}
          loading={<div className="p-4">Loading diff editor...</div>}
        />
      ) : (
        <Editor
          height="100%"
          width="100%"
          theme={theme}
          options={{
            ...getDefaultEditorOptions(),
            ...getTypeScriptEditorOptions(),
          }}
          onChange={handleEditorChange}
          onMount={handleEditorMount}
          loading={<div className="p-4">Loading editor...</div>}
        />
      )}

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
