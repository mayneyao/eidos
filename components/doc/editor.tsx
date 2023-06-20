"use client"

import React, { useState } from "react"
import { LexicalComposer } from "@lexical/react/LexicalComposer"
import { ContentEditable } from "@lexical/react/LexicalContentEditable"
import LexicalErrorBoundary from "@lexical/react/LexicalErrorBoundary"
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin"

import { AllNodes } from "./nodes"
import { AllPlugins } from "./plugins"
import { DraggableBlockPlugin } from "./plugins/DraggableBlockPlugin"
import defaultTheme from "./themes/default"

const editorConfig: any = {
  // The editor theme
  theme: defaultTheme,
  // Handling of errors during update
  onError(error: any) {
    throw error
  },
  // Any custom nodes go here
  nodes: AllNodes,
}

export function Editor() {
  const ref = React.useRef<HTMLDivElement>(null)
  const [floatingAnchorElem, setFloatingAnchorElem] =
    useState<HTMLDivElement | null>(null)
  const onRef = (_floatingAnchorElem: HTMLDivElement) => {
    if (_floatingAnchorElem !== null) {
      setFloatingAnchorElem(_floatingAnchorElem)
    }
  }
  return (
    <LexicalComposer initialConfig={editorConfig}>
      <div className="editor-container h-full" ref={ref} id="editor-container">
        <div className="editor-inner h-full">
          <RichTextPlugin
            contentEditable={
              <div className="editor relative" ref={onRef}>
                <ContentEditable className="editor-input prose p-2 outline-none" />
              </div>
            }
            placeholder={<div />}
            ErrorBoundary={LexicalErrorBoundary}
          />
          <AllPlugins />
          {floatingAnchorElem && (
            <DraggableBlockPlugin anchorElem={floatingAnchorElem!} />
          )}
        </div>
      </div>
    </LexicalComposer>
  )
}
