import React, { useCallback, useEffect, useRef, useState } from "react"
import Editor from "@monaco-editor/react"
import * as monaco from "monaco-editor"

import { LanguageConfigManager } from "../languages"
import { syncEditorContentToVirtualFileSystem } from "../languages/typescript"
import {
  createModelSafely,
  getDefaultEditorOptions,
  setupMonacoModels,
} from "../monaco-setup"
import { useMultiFileEditorStore } from "../store"
import { FileType, type EditorRef } from "../types"
import { createEditorDebounce } from "../utils/debounce"

/**
 * Editor area component
 * Displays the editor for the currently active file
 */
export const EditorArea = ({
  theme,
  onSave,
  onChange,
  onFileJump,
}: {
  theme: string
  onSave: (code: string) => void
  onChange?: (code: string) => void
  onFileJump?: (path: string) => void
}) => {
  const {
    files,
    activeFileId,
    setActiveFileId,
    updateFileContent,
    fileModels,
    setFileModel,
  } = useMultiFileEditorStore()
  const editorRef = useRef<EditorRef>({
    editor: null,
    save: () => {},
    layout: () => {},
  })
  const containerRef = useRef<HTMLDivElement>(null)
  const [isMonacoReady, setIsMonacoReady] = useState(false)
  const [isEditorReady, setIsEditorReady] = useState(false)
  const languageConfigManagerRef = useRef<LanguageConfigManager>(
    new LanguageConfigManager()
  )

  // Get currently active file
  const activeFile = activeFileId
    ? files.find((f) => f.id === activeFileId && f.type === FileType.File)
    : null

  // Initialize Monaco models
  useEffect(() => {
    if (files.length > 0) {
      console.log(
        "EditorArea: Setting up Monaco models, file count:",
        files.length
      )
      try {
        setupMonacoModels(files)
        setIsMonacoReady(true)
        console.log("✅ Monaco model setup complete")
      } catch (error) {
        console.error("❌ Monaco model setup failed:", error)
      }
    }
  }, [files])

  // Configure language support only once when Monaco is ready
  useEffect(() => {
    if (isMonacoReady && files.length > 0) {
      const context = {
        scriptPathMappings: {
          "@/scripts/*": ["file:///scripts/*"],
          "@/utils/*": ["file:///utils/*"],
        },
        allScripts: files
          .filter((f) => f.type === FileType.File)
          .map((f) => ({
            id: f.id,
            name: f.name,
            code: f.content,
            ts_code: f.content,
          })),
      }

      // Only configure language once when Monaco is ready
      languageConfigManagerRef.current.configureLanguage(
        monaco,
        "typescript", // Use typescript as default
        context
      )
    }
  }, [isMonacoReady]) // Remove files dependency to avoid reconfiguration

  // Clean up language configuration
  useEffect(() => {
    return () => {
      languageConfigManagerRef.current.dispose()
    }
  }, [])

  const debouncedSyncContent = useCallback(
    createEditorDebounce((scriptId: string, content: string) => {
      syncEditorContentToVirtualFileSystem(monaco, scriptId, content)
      console.log(`🔄 Debounced sync for ${scriptId}`)
    }, "CONTENT_SYNC"),
    []
  )

  // Handle editor content changes with debouncing to avoid frequent updates
  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      if (activeFileId && value !== undefined) {
        updateFileContent(activeFileId, value)

        if (activeFile?.content !== value) {
          onChange?.(value)
        }

        if (activeFile) {
          debouncedSyncContent(activeFile.id, value)
        }
      }
    },
    [activeFileId, activeFile, onChange]
  )

  // Handle editor mount - only setup basic editor instance
  const handleEditorMount = (
    editor: monaco.editor.IStandaloneCodeEditor,
    monacoInstance: typeof monaco
  ) => {
    console.log("🎯 Editor mounted, setting up...")
    editorRef.current.editor = editor
    editorRef.current.layout = () => {
      editor.layout()
    }

    // Only set up keyboard shortcuts that don't depend on external state
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

    // Mark editor as ready
    setIsEditorReady(true)
  }

  // Handle save action and initial model setup - depends on activeFile and onSave
  useEffect(() => {
    const editor = editorRef.current.editor
    if (!editor || !isEditorReady) return

    const disposables: monaco.IDisposable[] = []

    // Setup save function that depends on onSave callback
    editorRef.current.save = () => {
      const code = editor.getValue()
      const currentActiveFileId =
        useMultiFileEditorStore.getState().activeFileId
      console.log(
        `Saving file: ${currentActiveFileId}`,
        code.length,
        "characters"
      )
      onSave(code)
    }

    // Register save action
    const saveAction = editor.addAction({
      id: "save",
      label: "Save",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: () => {
        editorRef.current.save()
      },
    })
    disposables.push(saveAction)

    // Setup initial model if there's an active file
    if (activeFile) {
      console.log(`Setting initial model: ${activeFile.path}`)
      try {
        const uri = monaco.Uri.parse(`file:///${activeFile.path}`)
        let model = monaco.editor.getModel(uri)

        if (!model) {
          console.log(`Creating new model: ${activeFile.path}`)
          model = createModelSafely(
            activeFile.content,
            activeFile.language,
            uri
          )
          setFileModel(activeFile.id, model)
        } else {
          console.log(`Using existing model: ${activeFile.path}`)
        }

        if (model) {
          editor.setModel(model)
          console.log(`✅ Model setup successful: ${activeFile.path}`)

          // Force trigger language service
          setTimeout(() => {
            const markers = monaco.editor.getModelMarkers({
              resource: model.uri,
            })
            console.log(
              `Model ${activeFile.path} marker count:`,
              markers.length
            )
          }, 1000)
        }
      } catch (error) {
        console.error(`❌ Initial model setup failed:`, error)
      }
    }

    return () => {
      disposables.forEach((d) => d.dispose())
    }
  }, [isEditorReady, activeFile, onSave, setFileModel])

  // Extract reusable function for handling go-to-definition
  const handleGoToDefinition = useCallback(
    async (position: monaco.Position) => {
      const editor = editorRef.current.editor
      if (!editor) return

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
          const fileId = files.find((f) => f.path === targetPath)?.id
          if (fileId) {
            onFileJump?.(fileId)
            setActiveFileId(fileId)

            // Set cursor position in target file
            const targetModel = monaco.editor.getModel(
              monaco.Uri.parse(definition.fileName)
            )
            if (targetModel) {
              const targetPosition = targetModel.getPositionAt(
                definition.textSpan.start
              )
              editor.setPosition(targetPosition)
            }
          }
        }
      } catch (error) {
        console.error("Go to definition failed:", error)
      }
    },
    [files, onFileJump, setActiveFileId]
  )

  // Handle dynamic actions and events that need fresh dependencies
  useEffect(() => {
    const editor = editorRef.current.editor
    if (!editor || !isEditorReady) return

    const disposables: monaco.IDisposable[] = []

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

    // Register mouse down event
    const mouseDownDisposable = editor.onMouseDown((e) => {
      if ((e.event.ctrlKey || e.event.metaKey) && e.target.position) {
        handleGoToDefinition(e.target.position)
      }
    })
    disposables.push(mouseDownDisposable)

    return () => {
      disposables.forEach((d) => d.dispose())
    }
  }, [handleGoToDefinition, isEditorReady])

  // When active file changes, switch editor model
  useEffect(() => {
    if (!editorRef.current.editor || !activeFile) return

    const uri = monaco.Uri.parse(`file:///${activeFile.path}`)

    try {
      // Try to get existing model
      let model = monaco.editor.getModel(uri)

      if (!model) {
        // If model doesn't exist, create new model
        console.log(`Creating new model for active file: ${activeFile.path}`)
        model = createModelSafely(activeFile.content, activeFile.language, uri)
        setFileModel(activeFile.id, model)
      } else {
        // If model exists but content is different, update content
        if (model.getValue() !== activeFile.content) {
          console.log(`Updating content for existing model: ${activeFile.path}`)
          model.setValue(activeFile.content)
        }
      }

      // Set editor model
      if (model) {
        editorRef.current.editor.setModel(model)
        console.log(`✅ Successfully set model for: ${activeFile.path}`)
      } else {
        console.error(`❌ Failed to create/get model for: ${activeFile.path}`)
      }
    } catch (error) {
      console.error(`Error switching to file ${activeFile.path}:`, error)
    }
  }, [activeFile, setFileModel])

  // If no active file, show blank state
  if (!activeFile) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center text-gray-500 dark:text-gray-400">
          <p className="text-lg font-medium">No open files</p>
          <p className="text-sm mt-2">
            Select a file from the left file tree to open
          </p>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="h-full w-full">
      <Editor
        height="100%"
        width="100%"
        language={activeFile.language}
        // Don't set value, let model manage content
        // value={activeFile.content}
        theme={theme}
        options={{
          ...getDefaultEditorOptions(),
          ...languageConfigManagerRef.current.getEditorOptions(
            activeFile.language
          ),
        }}
        onChange={handleEditorChange}
        onMount={handleEditorMount}
        loading={<div className="p-4">Loading editor...</div>}
      />
    </div>
  )
}

export default EditorArea
