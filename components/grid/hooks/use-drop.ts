import { DataEditorProps, Item } from "@glideapps/glide-data-grid"
import React from "react"

import { FieldType } from "@/lib/fields/const"
import { uploadFile2OPFS } from "@/lib/fs"

const SUPPORTED_IMAGE_TYPES = new Set([
  "image/png",
  "image/gif",
  "image/bmp",
  "image/jpeg",
])

interface IProps {
  setCellValue: (col: number, row: number, value: any) => void
  getCellContent: (cell: Item) => { kind: string }
}

export const useDrop = (props: IProps) => {
  const { setCellValue, getCellContent } = props
  const [highlights, setHighlights] = React.useState<
    DataEditorProps["highlightRegions"]
  >([])

  const [lastDropCell, setLastDropCell] = React.useState<Item | undefined>()

  const onDrop = React.useCallback(
    (cell: Item, dataTransfer: DataTransfer | null) => {
      setHighlights([])

      if (dataTransfer === null) {
        return
      }

      const { files } = dataTransfer
      // This only supports one image, for simplicity.
      if (files.length !== 1) {
        return
      }

      const [file] = files
      if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
        return
      }

      uploadFile2OPFS(file).then((newFileUrl) => {
        setCellValue(cell[0], cell[1], newFileUrl)
      })

      setLastDropCell(cell)
    },
    [setCellValue]
  )

  const onDragOverCell = React.useCallback(
    (cell: Item, dataTransfer: DataTransfer | null) => {
      if (dataTransfer === null) {
        return
      }

      const { items } = dataTransfer
      // This only supports one image, for simplicity.
      if (items.length !== 1) {
        return
      }

      const [item] = items
      if (!SUPPORTED_IMAGE_TYPES.has(item.type)) {
        return
      }

      const [col, row] = cell
      if (getCellContent(cell).kind === FieldType.File) {
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
