import React from "react"
import {
  DataEditorProps,
  GridCellKind,
  ImageCell,
  Item,
} from "@platools/glide-data-grid"

import { FieldType } from "@/lib/fields/const"
import { uploadFile2OPFS } from "@/lib/opfs"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"

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
  const { space } = useCurrentPathInfo()
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

      uploadFile2OPFS(file, space).then((newFileUrl) => {
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

      // Promise.all(Array.from(files).map((file) => uploadFile2OPFS(file))).then(
      //   (res) => {
      //     const cv = res.join(",")
      //     setCellValue(cell[0], cell[1], cv)
      //   }
      // )

      setLastDropCell(cell)
    },
    [setCellValue, space]
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
