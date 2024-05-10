import React, { useEffect, useMemo, useState } from "react"
import { AutoFocusPlugin } from "@lexical/react/LexicalAutoFocusPlugin"
import {
  InitialConfigType,
  LexicalComposer,
} from "@lexical/react/LexicalComposer"
import { ContentEditable } from "@lexical/react/LexicalContentEditable"
import LexicalErrorBoundary from "@lexical/react/LexicalErrorBoundary"
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin"
import { useDebounceFn } from "ahooks"

import { cn } from "@/lib/utils"
import { AIEditorPlugin } from "@/components/doc/plugins/AIEditorPlugin"

import { Loading } from "../loading"
import { useLoadingExtBlocks } from "./hooks/use-all-nodes"
import { ExtBlock, useEnabledExtBlocks } from "./hooks/use-ext-blocks"
import { useEditorStore } from "./hooks/useEditorContext"
import { AllNodes } from "./nodes"
import { AllPlugins } from "./plugins"
import { EidosAutoSavePlugin } from "./plugins/AutoSavePlugin"
import { DraggableBlockPlugin } from "./plugins/DraggableBlockPlugin"
import FloatingTextFormatToolbarPlugin from "./plugins/FloatingTextFormatToolbarPlugin"
import NewMentionsPlugin from "./plugins/MentionsPlugin"
import { SafeBottomPaddingPlugin } from "./plugins/SafeBottomPaddingPlugin"
import { SelectionPlugin } from "./plugins/SelectionPlugin"
import defaultTheme from "./themes/default"

interface EditorProps {
  docId?: string
  isEditable: boolean
  placeholder?: string
  autoFocus?: boolean
  title?: string
  showTitle?: boolean
  disableManuallySave?: boolean
  onTitleChange?: (title: string) => void
  disableSelectionPlugin?: boolean
  disableSafeBottomPaddingPlugin?: boolean
  disableUpdateTitle?: boolean
  className?: string
  beforeTitle?: React.ReactNode
  afterTitle?: React.ReactNode
  titleStyle?: React.CSSProperties
  topComponent?: React.ReactNode
  coverComponent?: React.ReactNode
  propertyComponent?: React.ReactNode
}

export function Editor(props: EditorProps) {
  const isLoading = useLoadingExtBlocks()
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center gap-2">
        <Loading />
      </div>
    )
  }
  return <DocEditor {...props} />
}

export function DocEditor(props: EditorProps) {
  const canChangeTitle = props.onTitleChange !== undefined
  const ref = React.useRef<HTMLDivElement>(null)
  const [title, setTitle] = useState(props.title ?? "")

  const { isToolbarVisible, isAIToolsOpen } = useEditorStore()
  const [floatingAnchorElem, setFloatingAnchorElem] =
    useState<HTMLDivElement | null>(null)
  const onRef = (_floatingAnchorElem: HTMLDivElement) => {
    if (_floatingAnchorElem !== null) {
      setFloatingAnchorElem(_floatingAnchorElem)
    }
  }

  const initConfig: InitialConfigType = useMemo(() => {
    const extBlocks = ((window as any).__DOC_EXT_BLOCKS as ExtBlock[]) || []
    return {
      namespace: "doc",
      // The editor theme
      theme: defaultTheme,
      // Handling of errors during update
      onError(error: any) {
        console.error(error)
      },
      // Any custom nodes go here
      nodes: [...AllNodes, ...extBlocks.map((block) => block.node)],
      editable: props.isEditable,
    }
  }, [props.isEditable])

  const { run: handleSave } = useDebounceFn(
    (title: string) => {
      !props.disableUpdateTitle && props.onTitleChange?.(title)
    },
    {
      wait: 500,
    }
  )

  useEffect(() => {
    handleSave(title)
  }, [handleSave, title])

  useEffect(() => {
    setTitle(props.title ?? "")
  }, [props.title])

  return (
    <div className="flex w-full flex-col">
      {props.coverComponent}
      <div
        className={cn(
          "prose mx-auto h-full w-full flex-col p-10 dark:prose-invert xs:p-5",
          props.className
        )}
        id="eidos-editor-container"
      >
        {props.topComponent}
        {props.showTitle && (
          <div className="mb-4 flex w-full items-baseline">
            {props.beforeTitle && <div>{props.beforeTitle}</div>}
            <input
              id="doc-title"
              placeholder="Untitled"
              className="h-[50px] w-[90%] truncate bg-transparent text-4xl font-bold text-primary outline-none"
              value={title}
              title={title}
              style={props.titleStyle}
              autoComplete="off"
              disabled={!canChangeTitle}
              onKeyDown={(e) => {
                // press Enter to active editor
              }}
              onChange={(e) => {
                setTitle(e.target.value)
              }}
            />
            {props.afterTitle && <div className="ml-2">{props.afterTitle}</div>}
          </div>
        )}
        {props.propertyComponent}
        <LexicalComposer initialConfig={initConfig}>
          <div
            className="editor-container w-full"
            ref={ref}
            id="editor-container"
          >
            <div
              className="editor-inner relative w-full"
              id="editor-container-inner"
            >
              <RichTextPlugin
                contentEditable={
                  <div className="editor relative" ref={onRef}>
                    <ContentEditable className="editor-input outline-none dark:prose-invert" />
                    {!props.disableSafeBottomPaddingPlugin && (
                      <SafeBottomPaddingPlugin />
                    )}
                  </div>
                }
                placeholder={
                  <div className="pointer-events-none absolute left-1 top-0 text-base text-[#aaa]">
                    <span>{props.placeholder ?? "press / for Command"}</span>
                  </div>
                }
                ErrorBoundary={LexicalErrorBoundary}
              />

              <AIEditorPlugin />
              <AllPlugins />
              <NewMentionsPlugin currentDocId={props.docId!} />
              {props.autoFocus && <AutoFocusPlugin />}
              {props.docId && (
                <EidosAutoSavePlugin
                  docId={props.docId}
                  isEditable={props.isEditable}
                  disableManuallySave={props.disableManuallySave}
                />
              )}

              {floatingAnchorElem && (
                <>
                  <DraggableBlockPlugin anchorElem={floatingAnchorElem} />
                  <FloatingTextFormatToolbarPlugin
                    anchorElem={floatingAnchorElem}
                  />
                </>
              )}
            </div>
          </div>
          {props.disableSelectionPlugin || isToolbarVisible || isAIToolsOpen ? (
            <></>
          ) : (
            <SelectionPlugin />
          )}
        </LexicalComposer>
      </div>
    </div>
  )
}
