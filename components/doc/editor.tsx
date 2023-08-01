"use client"

import React, { useState } from "react"
import { AutoFocusPlugin } from "@lexical/react/LexicalAutoFocusPlugin"
import { LexicalComposer } from "@lexical/react/LexicalComposer"
import { ContentEditable } from "@lexical/react/LexicalContentEditable"
import LexicalErrorBoundary from "@lexical/react/LexicalErrorBoundary"
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin"

// import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
// import { useSqlite } from "@/hooks/use-sqlite"
// import { useTodo } from "@/hooks/use-todo"

import { AllNodes } from "./nodes"
import { AllPlugins } from "./plugins"
import { AutoSavePlugin } from "./plugins/AutoSavePlugin"
import { DraggableBlockPlugin } from "./plugins/DraggableBlockPlugin"
import FloatingTextFormatToolbarPlugin from "./plugins/FloatingTextFormatToolbarPlugin"
import { SafeBottomPaddingPlugin } from "./plugins/SafeBottomPaddingPlugin"
// import { TodoPlugin } from "./plugins/TodoPlugin"
import defaultTheme from "./themes/default"

const editorConfig: any = {
  // The editor theme
  theme: defaultTheme,
  // Handling of errors during update
  onError(error: any) {
    console.error(error)
  },
  // Any custom nodes go here
  nodes: AllNodes,
}

interface EditorProps {
  docId?: string
  onSave: (content: string) => void
  initContent?: string
  isEditable: boolean
  placeholder?: string
  autoFocus?: boolean
}

export function Editor(props: EditorProps) {
  // FIXME: should be pass from props
  // const { space } = useCurrentPathInfo()
  // const { sqlite } = useSqlite(space)
  // const { addTodo, updateTodo, deleteTodo, deleteByListId } = useTodo(
  //   sqlite,
  //   props.docId
  // )
  //
  const ref = React.useRef<HTMLDivElement>(null)
  const [floatingAnchorElem, setFloatingAnchorElem] =
    useState<HTMLDivElement | null>(null)
  const onRef = (_floatingAnchorElem: HTMLDivElement) => {
    if (_floatingAnchorElem !== null) {
      setFloatingAnchorElem(_floatingAnchorElem)
    }
  }
  const initConfig = {
    ...editorConfig,
    editable: props.isEditable,
  }

  return (
    <div className="h-full w-full">
      <LexicalComposer initialConfig={initConfig}>
        <div
          className="editor-container h-full w-full"
          ref={ref}
          id="editor-container"
        >
          <div className="editor-inner relative h-full w-full">
            <RichTextPlugin
              contentEditable={
                <div className="editor relative" ref={onRef}>
                  <ContentEditable className="editor-input prose p-2 outline-none dark:prose-invert xl:prose-xl" />
                  <SafeBottomPaddingPlugin />
                </div>
              }
              placeholder={
                <div className="pointer-events-none absolute left-3 top-6 text-base text-[#aaa] xl:left-6 xl:top-10">
                  <span>{props.placeholder ?? "press / for Command"}</span>
                </div>
              }
              ErrorBoundary={LexicalErrorBoundary}
            />
            <AllPlugins />
            {/* <TodoPlugin
              onItemAdded={addTodo}
              onItemUpdate={updateTodo}
              onItemRemoved={deleteTodo}
              deleteByListId={deleteByListId}
            /> */}
            {props.autoFocus && <AutoFocusPlugin />}
            <AutoSavePlugin
              onSave={props.onSave}
              initContent={props.initContent}
            />
            <FloatingTextFormatToolbarPlugin />
            {floatingAnchorElem && (
              <>
                <DraggableBlockPlugin anchorElem={floatingAnchorElem!} />
              </>
            )}
          </div>
        </div>
      </LexicalComposer>
    </div>
  )
}
