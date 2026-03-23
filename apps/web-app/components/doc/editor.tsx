import React, { useEffect, useMemo, useRef, useState } from "react"
import { AutoFocusPlugin } from "@lexical/react/LexicalAutoFocusPlugin"
import {
  LexicalComposer,
  type InitialConfigType,
} from "@lexical/react/LexicalComposer"
import { ContentEditable } from "@lexical/react/LexicalContentEditable"
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary"
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin"
import { useDebounceFn } from "ahooks"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import { AIEditorPlugin } from "@/components/doc/plugins/AIEditorPlugin"

import { Skeleton } from "../ui/skeleton"
import { EditorInstanceProvider } from "./hooks/editor-instance-context"
import { useLoadingExtBlocks } from "./hooks/use-all-nodes"
import type { ExtBlock } from "./hooks/use-ext-blocks"
import { useEditorStore } from "./hooks/useEditorContext"
import { getAllNodes } from "./nodes"
import { AllPlugins } from "./plugins"
import { AutoLoadSavePlugin } from "./plugins/AutoLoadSavePlugin"
import { DraggableBlockPlugin } from "./plugins/DraggableBlockPlugin"
import { EditorFocusPlugin } from "./plugins/EditorFocusPlugin"
import FloatingTextFormatToolbarPlugin from "./plugins/FloatingTextFormatToolbarPlugin"
import { SafeBottomPaddingPlugin } from "./plugins/SafeBottomPaddingPlugin"
import { SelectionPlugin } from "./plugins/SelectionPlugin"
import TableCellActionMenuPlugin from "./plugins/TableActionMenuPlugin"
import TableHoverActionsPlugin from "./plugins/TableHoverActionsPlugin"
import defaultTheme from "./themes/default"

interface EditorProps {
  docId?: string
  isEditable: boolean
  isActive?: boolean
  namespace?: string
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
  plugins?: React.ReactNode
  disableExtPlugins?: boolean
  disablePlaceholder?: boolean
  renderTitle?: (params: {
    title: string
    setTitle: (value: string) => void
    inputRef: React.RefObject<HTMLInputElement>
    canChangeTitle: boolean
  }) => React.ReactNode
}

export function InnerEditor(props: EditorProps) {
  const { t } = useTranslation()
  const ref = React.useRef<HTMLDivElement>(null)
  const { isToolbarVisible, isAIToolsOpen } = useEditorStore()
  const [floatingAnchorElem, setFloatingAnchorElem] =
    useState<HTMLDivElement | null>(null)
  const onRef = (_floatingAnchorElem: HTMLDivElement) => {
    if (_floatingAnchorElem !== null) {
      setFloatingAnchorElem(_floatingAnchorElem)
    }
  }

  const initConfig: InitialConfigType = useMemo(() => {
    return {
      namespace: props.namespace || "doc",
      // The editor theme
      theme: defaultTheme,
      // Handling of errors during update
      onError(error: any) {
        console.error(error)
      },
      // Any custom nodes go here
      nodes: [...getAllNodes()],
      editable: props.isEditable,
    }
  }, [props.isEditable, props.namespace])

  return (
    <LexicalComposer initialConfig={initConfig}>
      <EditorInstanceProvider docId={props.docId ?? null}>
        <div
          className={cn("editor-container w-full", props.className)}
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
                  <ContentEditable className="editor-input outline-hidden dark:prose-invert" />
                  {!props.disableSafeBottomPaddingPlugin && (
                    <SafeBottomPaddingPlugin />
                  )}
                </div>
              }
              placeholder={
                !props.disablePlaceholder ? (
                  <div className="pointer-events-none absolute left-1 top-[1px] text-base text-[#aaa]">
                    <span>{props.placeholder ?? t("doc.pressForCommand")}</span>
                  </div>
                ) : null
              }
              ErrorBoundary={LexicalErrorBoundary}
            />

            <div id="ai-content-placeholder" />

            <AIEditorPlugin />
            <AllPlugins disableExtPlugins={props.disableExtPlugins} />
            {props.plugins}
            {props.autoFocus && <AutoFocusPlugin />}
            {props.docId && (
              <>
                <AutoLoadSavePlugin
                  docId={props.docId}
                  isEditable={props.isEditable}
                  disableManuallySave={props.disableManuallySave}
                />
                <EditorFocusPlugin
                  isEditable={props.isEditable}
                  disableJumpToTitle
                />
              </>
            )}

            {floatingAnchorElem && (
              <>
                <DraggableBlockPlugin anchorElem={floatingAnchorElem} />
                <FloatingTextFormatToolbarPlugin
                  anchorElem={floatingAnchorElem}
                />
                <TableHoverActionsPlugin anchorElem={floatingAnchorElem} />
                <TableCellActionMenuPlugin anchorElem={floatingAnchorElem} />
              </>
            )}
          </div>
        </div>
        {props.disableSelectionPlugin || isToolbarVisible || isAIToolsOpen ? (
          <></>
        ) : (
          <SelectionPlugin />
        )}
      </EditorInstanceProvider>
    </LexicalComposer>
  )
}

export function Editor(props: EditorProps) {
  const { t } = useTranslation()
  const canChangeTitle = props.onTitleChange !== undefined
  const [title, setTitle] = useState(props.title ?? "")
  const isLoading = useLoadingExtBlocks()

  const titleInputRef = useRef<HTMLInputElement>(null)
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

  useEffect(() => {
    const handleActivateHeader = () => {
      titleInputRef.current?.focus()
    }
    window.addEventListener("eidos-editor-activate-title", handleActivateHeader)
  }, [])

  const titleSection =
    props.showTitle &&
    (props.renderTitle ? (
      props.renderTitle({
        title,
        setTitle,
        inputRef: titleInputRef,
        canChangeTitle,
      })
    ) : (
      <div
        className={cn("mb-4 flex w-full items-baseline gap-2", props.className)}
      >
        {props.beforeTitle && <div>{props.beforeTitle}</div>}
        <input
          id="doc-title"
          placeholder={t("doc.untitled")}
          className="h-[50px] max-w-xs grow truncate bg-transparent text-4xl font-bold text-primary outline-hidden sm:max-w-full"
          value={title}
          title={title}
          style={props.titleStyle}
          ref={titleInputRef}
          autoComplete="off"
          disabled={!canChangeTitle}
          onKeyDown={(e) => {
            // press Enter to active editor
            if (e.key === "Enter" || e.key === "Tab") {
              e.stopPropagation()
              e.preventDefault()
              window.dispatchEvent(new Event("eidos-editor-focus"))
            }
          }}
          onChange={(e) => {
            setTitle(e.target.value)
          }}
        />
        {props.afterTitle && <div className="ml-2">{props.afterTitle}</div>}
      </div>
    ))

  return (
    <div className="doc-editor-area flex w-full flex-col">
      {props.coverComponent}
      <div
        className={cn(
          "prose mx-auto w-full flex-col px-5 dark:prose-invert sm:px-12",
          props.className
        )}
        id="eidos-editor-container"
      >
        {props.topComponent}
        {titleSection}
        {props.propertyComponent}
        {isLoading ? (
          <div className="flex h-full items-center gap-2">
            <div className="prose w-full space-y-2">
              {/* a text editor skeleton */}
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-5 w-2/5" />
            </div>
          </div>
        ) : (
          <InnerEditor {...props} />
        )}
      </div>
    </div>
  )
}
