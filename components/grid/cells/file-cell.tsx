import {
  CustomCell,
  CustomRenderer,
  GridCellKind,
  ImageOverlayEditor,
} from "@glideapps/glide-data-grid"

import { drawImage } from "./helper"

interface FileCellDataProps {
  readonly kind: "file-cell"
  readonly data: string[]
  readonly displayData: string[]
  readonly allowAdd?: boolean
  readonly proxyUrl?: string
}

export type FileCell = CustomCell<FileCellDataProps>

export const imageCellRenderer: CustomRenderer<FileCell> = {
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
  provideEditor: () => (p) => {
    const { value, onFinishedEditing, imageEditorOverride } = p

    const ImageEditor = imageEditorOverride ?? ImageOverlayEditor

    return (
      <ImageEditor
        urls={value.data.displayData}
        canWrite={Boolean(value.data.allowAdd)}
        onCancel={onFinishedEditing}
        onChange={(newImage) => {
          onFinishedEditing({
            ...value,
            data: {
              ...value.data,
              data: [...value.data.data, newImage],
            },
          })
        }}
      />
    )
  },
  onPaste: (toPaste, cell) => {
    toPaste = toPaste.trim()
    const fragments = toPaste.split(",")
    const uris = fragments
      .map((f) => {
        try {
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

export default imageCellRenderer
