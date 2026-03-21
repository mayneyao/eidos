import { useCallback, useState } from "react"
import {
  GridCellKind,
  type CustomCell,
  type CustomRenderer,
  type ProvideEditorCallback,
} from "@glideapps/glide-data-grid"
import { useKeyPress } from "ahooks"
import { Plus } from "lucide-react"

import { getFileType } from "@/lib/mime/mime"
import { cn } from "@/lib/utils"
import { smartSplitFilePaths } from "@/packages/core/fields/helper"
import { Button } from "@/components/ui/button"
import { FinderDialog } from "@/components/finder"
import { SortableContainer } from "@/components/table/sortable"

import { drawImage } from "../helper"
import { Card } from "./file-cell-eidtor"
import { FilePreview } from "./file-preview"

interface FileCellDataProps {
  readonly kind: "file-cell"
  readonly data: string[]
  readonly displayData: string[]
  readonly allowAdd?: boolean
  readonly proxyUrl?: string
}

export type FileCell = CustomCell<FileCellDataProps>

interface FileItem {
  id: string
  url: string
  displayUrl: string
  index: number
}

export const FileCellEditor: ReturnType<
  ProvideEditorCallback<
    FileCell & {
      className?: string
    }
  >
> = (props) => {
  const { value: cell, onFinishedEditing, initialValue, onChange } = props
  const className = cell.className

  const [open, setOpen] = useState(false)
  const [currentPreviewIndex, setCurrentPreviewIndex] = useState(-1)

  const items: FileItem[] = cell.data.data.map((url, index) => ({
    id: `${url}-${index}`,
    url,
    displayUrl: cell.data.displayData[index],
    index,
  }))

  const handleReorder = useCallback(
    (newItems: FileItem[]) => {
      const newData = newItems.map((item) => item.url)
      const newDisplayData = newItems.map((item) => item.displayUrl)
      onChange({
        ...cell,
        data: {
          ...cell.data,
          data: newData,
          displayData: newDisplayData,
        },
      })
    },
    [cell, onChange]
  )

  useKeyPress("esc", () => {
    setCurrentPreviewIndex(-1)
  })

  useKeyPress("rightarrow", () => {
    if (currentPreviewIndex + 1 < cell.data.displayData.length) {
      setCurrentPreviewIndex(
        (currentPreviewIndex + 1) % cell.data.displayData.length
      )
    }
  })
  useKeyPress("leftarrow", () => {
    if (currentPreviewIndex - 1 > -1) {
      setCurrentPreviewIndex(
        (currentPreviewIndex - 1) % cell.data.displayData.length
      )
    }
  })

  const originalUrl = cell.data.data[currentPreviewIndex]
  const fileType = getFileType(originalUrl)

  const currentPreview =
    fileType === "image"
      ? cell.data.displayData[currentPreviewIndex]
      : originalUrl

  const deleteByUrl = useCallback(
    (index: number) => {
      const newData = cell.data.data.filter((v, i) => i !== index)
      const newDisplayData = cell.data.displayData.filter((v, i) => i !== index)
      onChange({
        ...cell,
        data: {
          ...cell.data,
          data: newData,
          displayData: newDisplayData,
        },
      })
    },
    [cell, onChange]
  )

  const addUrls = (urls: string[]) => {
    const newData = [...cell.data.data, ...urls]
    const newDisplayData = [...cell.data.displayData, ...urls]
    onChange({
      ...cell,
      data: {
        ...cell.data,
        data: newData,
        displayData: newDisplayData,
      },
    })
  }

  const container = document.getElementById("portal") || document.body
  const hasFiles = cell.data.displayData.length > 0

  return (
    <div className={cn("min-w-[200px] max-w-[260px] p-1", className)}>
      <SortableContainer
        items={items}
        onReorder={handleReorder}
        className="space-y-0.5"
        itemClassName=""
        renderItem={(item) => (
          <Card
            id={item.id}
            text={item.displayUrl}
            originalUrl={item.url}
            index={item.index}
            setCurrentPreviewIndex={setCurrentPreviewIndex}
            deleteByUrl={deleteByUrl}
          />
        )}
      />

      {!cell.readonly && (
        <>
          {hasFiles && <div className="h-px bg-border/50 my-1" />}
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "w-full h-6 text-xs text-muted-foreground hover:text-foreground",
              "hover:bg-accent/50 transition-colors duration-100",
              "flex items-center justify-center gap-1"
            )}
            onClick={() => setOpen(true)}
          >
            <Plus className="h-3 w-3" />
            Add File
          </Button>
          <FinderDialog
            open={open}
            onOpenChange={(isOpen) => {
              setOpen(isOpen)
            }}
            title="Select File"
            confirmLabel="Add"
            onSelect={(paths) => {
              if (paths.length > 0) {
                const urls = paths.map((path) =>
                  path.startsWith("/") ? path : `/${path}`
                )
                addUrls(urls)
              }
              setOpen(false)
            }}
            selectMode="file"
            allowMultiple
            initialPath="~/"
            container={container}
          />
        </>
      )}
      {currentPreviewIndex > -1 && (
        <FilePreview
          url={currentPreview}
          type={fileType as string}
          onClose={() => setCurrentPreviewIndex(-1)}
        />
      )}
    </div>
  )
}

export const FileCellRenderer: CustomRenderer<FileCell> = {
  isMatch: (cell: CustomCell): cell is FileCell =>
    (cell.data as any).kind === "file-cell",
  kind: GridCellKind.Custom,
  needsHover: false,
  needsHoverPosition: false,
  draw: (a) => {
    const data = a.cell.data.displayData
    drawImage(a, data)
  },
  measure: (_ctx, cell) => cell.data.data.length * 50,
  onDelete: (c) => ({
    ...c,
    data: {
      ...c.data,
      data: [],
    },
  }),
  provideEditor: () => (p) => <FileCellEditor {...p} />,
  onPaste: (toPaste, cell) => {
    toPaste = toPaste.trim()
    if (toPaste.startsWith('"') || toPaste.startsWith("'")) {
      toPaste = toPaste.slice(1)
    }
    if (toPaste.endsWith('"') || toPaste.endsWith("'")) {
      toPaste = toPaste.slice(0, -1)
    }

    const fragments = smartSplitFilePaths(toPaste)
    const uris = fragments
      .map((f) => {
        try {
          if (f.startsWith("/")) {
            return f
          }
          new URL(f)
          return f
        } catch {
          return undefined
        }
      })
      .filter((x) => x !== undefined) as string[]
    if (
      uris.length === cell.data.length &&
      uris.every((u, i) => u === cell.data[i])
    )
      return undefined
    return {
      ...cell,
      data: uris,
    }
  },
}
