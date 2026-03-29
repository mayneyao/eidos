"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { LexicalComposer } from "@lexical/react/LexicalComposer"
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin"
import { ContentEditable } from "@lexical/react/LexicalContentEditable"
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import type { SerializedEditorState } from "lexical"
import {
  getStandardNodes,
  getEidosNodes,
  getStandardTransformers,
  getEidosTransformers,
} from "@eidos.space/lexical"
import { PersistentIdPlugin } from "@eidos.space/lexical/plugins/persistent-id"

interface LexicalEditorProps {
  title: string
  state: SerializedEditorState | null
  onStateChange?: (state: SerializedEditorState) => void
}

const NODES = [...getEidosNodes(), ...getStandardNodes()]
const TRANSFORMERS = [...getEidosTransformers(), ...getStandardTransformers()]

const editorConfig = {
  namespace: "ASTDiffEditor",
  nodes: NODES,
  theme: {
    paragraph: "mb-2",
    heading: {
      h1: "text-2xl font-bold mb-4",
      h2: "text-xl font-bold mb-3",
      h3: "text-lg font-bold mb-2",
    },
    list: {
      ul: "list-disc ml-4 mb-2",
      ol: "list-decimal ml-4 mb-2",
    },
    text: {
      bold: "font-bold",
      italic: "italic",
      code: "bg-gray-100 px-1 rounded font-mono text-sm",
    },
  },
  onError: (error: Error) => {
    console.error("Lexical error:", error)
  },
}

// 编辑器内部状态管理
function EditorInternals({
  externalState,
  onStateChange,
}: {
  externalState: SerializedEditorState | null
  onStateChange?: (state: SerializedEditorState) => void
}) {
  const [editor] = useLexicalComposerContext()
  const initialized = useRef(false)
  const lastStateRef = useRef<SerializedEditorState | null>(null)
  const isUserEditing = useRef(false)
  const editTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 标记用户正在编辑
  const markEditing = useCallback(() => {
    isUserEditing.current = true
    if (editTimeoutRef.current) {
      clearTimeout(editTimeoutRef.current)
    }
    // 500ms 后解除编辑状态
    editTimeoutRef.current = setTimeout(() => {
      isUserEditing.current = false
    }, 500)
  }, [])

  // 初始加载 - 使用传入的 state
  useEffect(() => {
    if (initialized.current) return
    if (!externalState) return

    try {
      editor.setEditorState(editor.parseEditorState(externalState))
      lastStateRef.current = externalState
      initialized.current = true
    } catch (error) {
      console.error("Init error:", error)
    }
  }, [externalState, editor])

  // 监听外部 state 变化
  useEffect(() => {
    if (!initialized.current) return
    if (!externalState) return

    // 如果用户正在编辑，不重新加载（避免失去焦点）
    if (isUserEditing.current) {
      console.log("Skipping sync: user is editing")
      return
    }

    // 避免循环更新：检查 state 是否真的变化了
    const currentState = editor.getEditorState().toJSON()
    const currentPidCount = countPids(currentState)
    const externalPidCount = countPids(externalState)

    // 如果外部 state 的 pid 数量少于当前，说明是反向同步，跳过
    if (externalPidCount < currentPidCount) {
      console.log("Skipping sync: external state has fewer PIDs")
      return
    }

    // 检查内容是否实质性变化
    if (statesAreEqual(currentState, externalState)) {
      return
    }

    try {
      editor.setEditorState(editor.parseEditorState(externalState))
      lastStateRef.current = externalState
    } catch (error) {
      console.error("Sync error:", error)
    }
  }, [externalState, editor])

  // 监听编辑器变化
  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      markEditing()
      const state = editorState.toJSON()
      onStateChange?.(state)
    })
  }, [editor, onStateChange, markEditing])

  return null
}

// 辅助函数：计算 pid 数量
function countPids(state: SerializedEditorState): number {
  let count = 0
  const walk = (node: any) => {
    if (node?.$?.pid) count++
    node?.children?.forEach(walk)
  }
  walk(state.root)
  return count
}

// 辅助函数：比较两个 state 是否相等（只比较内容，不比较 pid）
function statesAreEqual(
  a: SerializedEditorState,
  b: SerializedEditorState
): boolean {
  const stripPids = (node: any): any => {
    if (!node) return node
    const { $, ...rest } = node
    const new$ = $ ? { ...$, pid: undefined } : undefined
    return {
      ...rest,
      ...(new$ ? { $: new$ } : {}),
      children: node.children?.map(stripPids),
    }
  }

  const aStripped = { ...a, root: stripPids(a.root) }
  const bStripped = { ...b, root: stripPids(b.root) }

  return JSON.stringify(aStripped) === JSON.stringify(bStripped)
}

export function LexicalEditor({
  title,
  state,
  onStateChange,
}: LexicalEditorProps) {
  const [nodeCount, setNodeCount] = useState(0)
  const [idCount, setIdCount] = useState(0)

  const handleStateChange = (newState: SerializedEditorState) => {
    const count = newState.root?.children?.length || 0
    setNodeCount(count)

    let ids = 0
    const walk = (node: any) => {
      if (node?.$?.pid) ids++
      node?.children?.forEach(walk)
    }
    walk(newState.root)
    setIdCount(ids)

    onStateChange?.(newState)
  }

  return (
    <div className="flex flex-col h-full">
      {title && (
        <div className="px-4 py-3 border-b bg-gray-50 flex justify-between items-center shrink-0">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <div className="flex gap-3 text-xs">
            <span className="text-gray-500">{nodeCount} 块级节点</span>
            <span className="text-green-600 font-medium">{idCount} 个 ID</span>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        <LexicalComposer initialConfig={editorConfig}>
          <div className="relative h-full">
            <RichTextPlugin
              contentEditable={
                <ContentEditable className="w-full min-h-full p-4 outline-none prose prose-sm max-w-none" />
              }
              placeholder={
                <div className="absolute top-4 left-4 text-gray-400 pointer-events-none">
                  在此编辑内容...
                </div>
              }
              ErrorBoundary={({ error }: { error: Error }) => (
                <div className="p-4 text-red-600">Error: {error.message}</div>
              )}
            />
            <HistoryPlugin />
            <PersistentIdPlugin />
            <EditorInternals
              externalState={state}
              onStateChange={handleStateChange}
            />
          </div>
        </LexicalComposer>
      </div>
    </div>
  )
}
