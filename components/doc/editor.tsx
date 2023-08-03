"use client"

import React, { useEffect, useState } from "react"
import { AutoFocusPlugin } from "@lexical/react/LexicalAutoFocusPlugin"
import { LexicalComposer } from "@lexical/react/LexicalComposer"
import { ContentEditable } from "@lexical/react/LexicalContentEditable"
import LexicalErrorBoundary from "@lexical/react/LexicalErrorBoundary"
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin"
import { useDebounceFn } from "ahooks"

import { AllNodes } from "./nodes"
import { AllPlugins } from "./plugins"
import { AutoSavePlugin } from "./plugins/AutoSavePlugin"
import { DraggableBlockPlugin } from "./plugins/DraggableBlockPlugin"
import FloatingTextFormatToolbarPlugin from "./plugins/FloatingTextFormatToolbarPlugin"
import { SafeBottomPaddingPlugin } from "./plugins/SafeBottomPaddingPlugin"
import { SelectionPlugin } from "./plugins/SelectionPlugin"
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
  title?: string
  showTitle?: boolean
  onTitleChange?: (title: string) => void
  disableSelectionPlugin?: boolean
}

export function Editor(props: EditorProps) {
  const canChangeTitle = props.onTitleChange !== undefined
  const ref = React.useRef<HTMLDivElement>(null)
  const [title, setTitle] = useState(props.title ?? "")
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

  const { run: handleSave } = useDebounceFn(
    (title: string) => {
      props.onTitleChange?.(title)
      console.log("save title", title)
    },
    {
      wait: 1000,
    }
  )

  useEffect(() => {
    handleSave(title)
  }, [handleSave, title])

  return (
    <>
      <div
        className="prose mx-auto h-full w-full flex-col p-10 xs:prose-sm lg:prose-xl xl:prose-2xl xs:p-5"
        id="eidos-editor-container"
      >
        {props.showTitle && (
          <input
            id="doc-title"
            placeholder="Untitled"
            className="my-4 bg-transparent text-4xl font-bold text-primary outline-none"
            value={title}
            disabled={!canChangeTitle}
            onChange={(e) => {
              setTitle(e.target.value)
            }}
          />
        )}
        <LexicalComposer initialConfig={initConfig}>
          <div
            className="editor-container w-full"
            ref={ref}
            id="editor-container"
          >
            <div className="editor-inner relative w-full">
              <RichTextPlugin
                contentEditable={
                  <div className="editor relative" ref={onRef}>
                    <ContentEditable className="editor-input prose p-2 outline-none dark:prose-invert xl:prose-xl" />
                    <SafeBottomPaddingPlugin />
                  </div>
                }
                placeholder={
                  <div className="pointer-events-none absolute left-3 top-3 text-base text-[#aaa] xl:top-4">
                    <span>{props.placeholder ?? "press / for Command"}</span>
                  </div>
                }
                ErrorBoundary={LexicalErrorBoundary}
              />

              <AllPlugins />
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
          {props.disableSelectionPlugin ? <></> : <SelectionPlugin />}
        </LexicalComposer>
      </div>
    </>
  )
}
