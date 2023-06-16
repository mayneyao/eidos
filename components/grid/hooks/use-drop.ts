import React from "react"
import { DataEditorProps, GridCellKind, Item } from "@glideapps/glide-data-grid"

import { saveFile } from "@/lib/fs"
import { useCurrentDomain } from "@/app/[database]/hook"

const SUPPORTED_IMAGE_TYPES = new Set([
  "image/png",
  "image/gif",
  "image/bmp",
  "image/jpeg",
])

interface IProps {
  setCellValue: (col: number, row: number, value: any) => void
  getCellContent: (cell: Item) => { kind: GridCellKind }
}

export const useDrop = (props: IProps) => {
  const { setCellValue, getCellContent } = props
  const [highlights, setHighlights] = React.useState<
    DataEditorProps["highlightRegions"]
  >([])
  const domain = useCurrentDomain()

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

      const imgUrl = URL.createObjectURL(file)
      const fileHash = imgUrl.split("/").pop()
      const fileExtension = file.name.split(".").pop()
      const newFileName = `${fileHash}.${fileExtension}`

      const newFileUrl = `${domain}/files/${newFileName}`
      setCellValue(cell[0], cell[1], newFileUrl)
      saveFile(file, newFileName)
      setLastDropCell(cell)
    },
    [setCellValue, domain]
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
      if (getCellContent(cell).kind === GridCellKind.Image) {
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
