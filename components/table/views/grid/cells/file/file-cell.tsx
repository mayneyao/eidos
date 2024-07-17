import { useCallback, useState } from "react"
import {
  CustomCell,
  CustomRenderer,
  GridCellKind,
  ProvideEditorCallback,
} from "@glideapps/glide-data-grid"
import { useKeyPress } from "ahooks"
import update from "immutability-helper"
import { DndProvider } from "react-dnd"
import { HTML5Backend } from "react-dnd-html5-backend"

import { getFileType } from "@/lib/mime/mime"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { FileSelector } from "@/app/[database]/[node]/file-selector"

import { useTableAppStore } from "../../store"
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
  const { currentPreviewIndex, setCurrentPreviewIndex } = useTableAppStore()

  const moveCard = useCallback(
    (dragIndex: number, hoverIndex: number) => {
      const newData = update(cell.data.data, {
        $splice: [
          [dragIndex, 1],
          [hoverIndex, 0, cell.data.data[dragIndex] as any],
        ],
      })

      const newDisplayData = update(cell.data.displayData, {
        $splice: [
          [dragIndex, 1],
          [hoverIndex, 0, cell.data.displayData[dragIndex] as any],
        ],
      })

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

  const renderCard = useCallback(
    (v: string, originalUrl: string, i: number) => {
      return (
        <Card
          key={originalUrl}
          id={v}
          text={v}
          originalUrl={originalUrl}
          moveCard={moveCard}
          index={i}
          setCurrentPreviewIndex={setCurrentPreviewIndex}
          deleteByUrl={deleteByUrl}
        ></Card>
      )
    },
    [deleteByUrl, moveCard, setCurrentPreviewIndex]
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
  // const showUploadFilePicker = async () => {
  //   const pickerOpts = {
  //     types: [
  //       {
  //         description: "Images",
  //         accept: {
  //           "image/*": [".png", ".gif", ".jpeg", ".jpg"],
  //         },
  //       },
  //     ],
  //     excludeAcceptAllOption: true,
  //     multiple: true,
  //   }
  //   const fileHandles = await (window as any).showOpenFilePicker(pickerOpts)
  //   const files = await Promise.all(fileHandles.map((fh: any) => fh.getFile()))

  //   const addedFiles = await addFiles(files)
  //   const urls = addedFiles.map(
  //     (fileInfo) => "/" + fileInfo.path.split("/").slice(1).join("/")
  //   )
  //   addUrls(urls)
  // }

  return (
    <div
      className={cn(
        "max-w-[300px] rounded-md border-none outline-none",
        className
      )}
    >
      <DndProvider backend={HTML5Backend} context={window}>
        {cell.data.displayData.map((v, i) => {
          const originalUrl = cell.data.data[i]
          return renderCard(v, originalUrl, i)
        })}
      </DndProvider>
      {cell.data.displayData.length > 0 && <Separator className="my-1" />}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            className="w-full"
            // onClick={showUploadFilePicker}
          >
            add new
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="click-outside-ignore w-auto p-0"
          container={container}
        >
          <FileSelector
            onSelected={(url) => {
              addUrls([url])
              setOpen(false)
            }}
            onRemove={() => {}}
            disableColor
            hideRemove
            height={300}
          ></FileSelector>
        </PopoverContent>
      </Popover>

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
    drawImage(
      a,
      data
      //   a.cell.rounding,
    )
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
    // if toPaste startWith  " or ' , remove them
    if (toPaste.startsWith('"') || toPaste.startsWith("'")) {
      toPaste = toPaste.slice(1)
    }
    if (toPaste.endsWith('"') || toPaste.endsWith("'")) {
      toPaste = toPaste.slice(0, -1)
    }
    const fragments = toPaste.split(",")
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
