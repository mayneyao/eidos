import { forwardRef, useState } from "react"
import type { IExtension } from "@/packages/core/meta-table/extension"
import { BlockExtensionType } from "@/packages/core/types/IExtension"

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { BlockRenderer } from "@/components/block-renderer/block-renderer"

import { FileTreeSelector } from "./extension-preview"

interface FileHandlerPreviewProps {
  script: IExtension
  currentCompiledDraftCode: string
  height?: number
}

export const FileHandlerPreview = forwardRef<
  HTMLDivElement,
  FileHandlerPreviewProps
>(({ script, currentCompiledDraftCode, height }, ref) => {
  const [selectedFileHash, setSelectedFileHash] = useState<string>("")

  const getStoredPanelSize = () => {
    if (typeof window === "undefined") return 25
    const stored = localStorage.getItem("extension-preview-panel-size")
    return stored ? parseFloat(stored) : 25
  }

  const [panelSize, setPanelSize] = useState(getStoredPanelSize)

  const handlePanelResize = (sizes: number[]) => {
    const newSize = sizes[0]
    setPanelSize(newSize)
    localStorage.setItem("extension-preview-panel-size", newSize.toString())
  }

  return (
    <div className="h-full" ref={ref}>
      <ResizablePanelGroup direction="horizontal" onLayout={handlePanelResize}>
        <ResizablePanel defaultSize={panelSize} minSize={20}>
          <div className="h-full flex flex-col">
            <div className="flex-1 overflow-hidden">
              <FileTreeSelector
                rootDir="~/"
                selectedPath={selectedFileHash}
                onSelect={setSelectedFileHash}
              />
            </div>
          </div>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={100 - panelSize} minSize={30}>
          <div className="h-full overflow-hidden">
            {script.type === "block" && (
              <BlockRenderer
                blockId={script.id}
                code={script.ts_code || ""}
                compiledCode={currentCompiledDraftCode || script.code || ""}
                env={{}}
                bindings={{}}
                height={height}
                hash={`#${selectedFileHash}`}
              />
            )}

            {script.type === "script" && (
              <div className="h-full overflow-auto p-2">
                <div className="text-sm text-muted-foreground">
                  Script extensions run in the background and don't have a
                  visual preview.
                </div>
              </div>
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
})

FileHandlerPreview.displayName = "FileHandlerPreview"
