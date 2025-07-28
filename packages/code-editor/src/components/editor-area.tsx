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
}: {
  theme: string
  onSave: (code: string) => void
  onChange?: (code: string) => void
}) => {
  const { files, activeFileId, updateFileContent, fileModels, setFileModel } =
    useMultiFileEditorStore()
  const editorRef = useRef<EditorRef>({
    editor: null,
    save: () => {},
    layout: () => {},
  })
  const containerRef = useRef<HTMLDivElement>(null)
  const [isMonacoReady, setIsMonacoReady] = useState(false)
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

  // 创建防抖的内容同步函数
  const debouncedSyncContent = useCallback(
    createEditorDebounce((scriptId: string, content: string) => {
      syncEditorContentToVirtualFileSystem(monaco, scriptId, content)
      console.log(`🔄 Debounced sync for ${scriptId}`)
    }, "CONTENT_SYNC"),
    []
  )

  // Handle editor content changes with debouncing to avoid frequent updates
  const handleEditorChange = (value: string | undefined) => {
    // Call optional onChange callback
    console.error("fffff", {
      activeFile,
      value,
    })
    if (activeFileId && value !== undefined) {
      updateFileContent(activeFileId, value)

      if (activeFile?.content !== value) {
        onChange?.(value)
      }

      if (activeFile) {
        debouncedSyncContent(activeFile.id, value)
      }
    }
  }

  // Handle editor mount
  const handleEditorMount = (
    editor: monaco.editor.IStandaloneCodeEditor,
    monacoInstance: typeof monaco
  ) => {
    console.log("🎯 Editor mounted, setting up...")
    editorRef.current.editor = editor
    editorRef.current.save = () => {
      const code = editor.getValue()
      console.log(`Saving file: ${activeFileId}`, code.length, "characters")
      // Here you can add logic to save to server
      onSave(code)
    }
    editorRef.current.layout = () => {
      editor.layout()
    }

    // If there's an active file, set model immediately
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

    // Set up keyboard shortcuts
    editor.addAction({
      id: "save",
      label: "Save",
      keybindings: [
        monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS,
      ],
      run: () => {
        editorRef.current.save()
      },
    })

    // Add more editor shortcuts
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

    // If there's an active file, ensure its model is created or retrieved
    if (activeFile) {
      const uri = monacoInstance.Uri.parse(`file:///${activeFile.path}`)

      try {
        // Try to get existing model
        let model = monacoInstance.editor.getModel(uri)

        if (!model) {
          // If model doesn't exist, create new model
          console.log(`Creating model on mount for: ${activeFile.path}`)
          model = createModelSafely(
            activeFile.content,
            activeFile.language,
            uri
          )
          setFileModel(activeFile.id, model)
        }

        editor.setModel(model)
      } catch (error) {
        console.error(
          `Error setting up model on mount for ${activeFile.path}:`,
          error
        )
      }
    }
  }

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
