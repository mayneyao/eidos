import React from "react"
import {
  DataEditorProps,
  GridCellKind,
  ImageCell,
  Item,
} from "@glideapps/glide-data-grid"

import { FieldType } from "@/lib/fields/const"
import { useFileSystem } from "@/hooks/use-files"

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

  const { addFiles } = useFileSystem()
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

      addFiles([file]).then((fileInfos) => {
        const fileInfo = fileInfos[0]
        const newFileUrl = "/" + fileInfo.path.split("/").slice(1).join("/")
        setCellValue(cell[0], cell[1], {
          kind: GridCellKind.Image,
          data: [newFileUrl],
          copyData: newFileUrl,
          allowOverlay: true,
          allowAdd: true,
        } as ImageCell)
      })

      // upload multiple files, it's works but have some bugs
      // if (
      //   !Array.from(files).every((file) => SUPPORTED_IMAGE_TYPES.has(file.type))
      // ) {
      //   return
      // }

      setLastDropCell(cell)
    },
    [addFiles, setCellValue]
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
