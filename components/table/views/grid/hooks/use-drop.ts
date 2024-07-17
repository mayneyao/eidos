import React from "react"
import {
  DataEditorProps,
  GridCell,
  GridCellKind,
  Item,
} from "@glideapps/glide-data-grid"

import { useFileSystem } from "@/hooks/use-files"

import { FileCell } from "../cells/file/file-cell"

const SUPPORTED_IMAGE_TYPES = new Set([
  "image/png",
  "image/gif",
  "image/bmp",
  "image/jpeg",
])

interface IProps {
  setCellValue: (col: number, row: number, value: any) => void
  getCellContent: (cell: Item) => GridCell
}

export const useDrop = (props: IProps) => {
  const { setCellValue, getCellContent } = props
  const [highlights, setHighlights] = React.useState<
    DataEditorProps["highlightRegions"]
  >([])

  const { addFiles } = useFileSystem()
  const [lastDropCell, setLastDropCell] = React.useState<Item | undefined>()

  const onDrop = React.useCallback(
    (cell: Item, dataTransfer: DataTransfer | null) => {
      setHighlights([])

      if (dataTransfer === null) {
        return
      }

      const data = dataTransfer.getData("text/plain")
      if (data) {
        console.log("data", data)
        const oldCell = getCellContent(cell) as FileCell
        const newValues = [...(oldCell.data?.data || []), data] as string[]
        setCellValue(cell[0], cell[1], {
          kind: GridCellKind.Custom,
          data: {
            kind: "file-cell",
            data: newValues,
            displayData: newValues,
            allowAdd: true,
          },
          copyData: newValues.join(","),
          allowOverlay: true,
        } as FileCell)
      } else {
        const { files } = dataTransfer

        addFiles(Array.from(files)).then((fileInfos) => {
          const newFileUrls = fileInfos.map(
            (fileInfo) => "/" + fileInfo.path.split("/").slice(1).join("/")
          )
          const oldCell = getCellContent(cell) as FileCell
          const newValues = [
            ...(oldCell.data?.data || []),
            ...newFileUrls,
          ] as string[]
          setCellValue(cell[0], cell[1], {
            kind: GridCellKind.Custom,
            data: {
              kind: "file-cell",
              data: newValues,
              displayData: newValues,
              allowAdd: true,
            },
            copyData: newValues.join(","),
            allowOverlay: true,
          } as FileCell)
        })
      }
      // upload multiple files, it's works but have some bugs
      // if (
      //   !Array.from(files).every((file) => SUPPORTED_IMAGE_TYPES.has(file.type))
      // ) {
      //   return
      // }

      setLastDropCell(cell)
    },
    [addFiles, getCellContent, setCellValue]
  )

  const onDragOverCell = React.useCallback(
    (cell: Item, dataTransfer: DataTransfer | null) => {
      if (dataTransfer === null) {
        return
      }
      const { items } = dataTransfer
      const [item] = items
      console.log("item", dataTransfer)
      const data = "text/uri-list"
      if (data) {
      } else if (!SUPPORTED_IMAGE_TYPES.has(item.type)) {
        return
      }

      const [col, row] = cell
      const oldCell = getCellContent(cell) as FileCell
      if (oldCell.data?.kind === "file-cell") {
        setHighlights([
          {
            color: "#44BB0022",
            range: {
              x: col,
              y: row,
              width: 1,
              height: 1,
            },
          },
        ])
      } else {
        setHighlights([])
      }
    },
    [getCellContent]
  )

  const onDragLeave = React.useCallback(() => {
    setHighlights([])
  }, [])

  return {
    onDragLeave,
    onDrop,
    onDragOverCell,
    highlights,
  }
}
