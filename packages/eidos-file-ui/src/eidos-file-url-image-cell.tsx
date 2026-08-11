import {
  drawTextCell,
  GridCellKind,
  type CustomCell,
  type CustomRenderer,
  type ProvideEditorComponent,
} from "@glideapps/glide-data-grid"

import { Input } from "./ui/primitives"
import { eidosFileGridPopupEditor } from "./cells/grid-editor-surface"

export interface EidosFileUrlImageCellData {
  readonly kind: "eidos-file-url-image-cell"
  readonly uri: string
  readonly thumbnail?: CanvasImageSource
}

export type EidosFileUrlImageCell = CustomCell<EidosFileUrlImageCellData>

function imageDimensions(source: CanvasImageSource): {
  height: number
  width: number
} | null {
  const candidate = source as unknown as Record<string, unknown>
  const width =
    typeof candidate.naturalWidth === "number"
      ? candidate.naturalWidth
      : typeof candidate.videoWidth === "number"
        ? candidate.videoWidth
        : candidate.width
  const height =
    typeof candidate.naturalHeight === "number"
      ? candidate.naturalHeight
      : typeof candidate.videoHeight === "number"
        ? candidate.videoHeight
        : candidate.height
  return typeof width === "number" &&
    width > 0 &&
    typeof height === "number" &&
    height > 0
    ? { height, width }
    : null
}

function drawThumbnail(
  args: Parameters<
    NonNullable<CustomRenderer<EidosFileUrlImageCell>["draw"]>
  >[0]
): boolean {
  const source = args.cell.data.thumbnail
  if (!source) return false
  const dimensions = imageDimensions(source)
  if (!dimensions) return false
  const { ctx, rect, theme } = args
  const padding = Math.max(3, theme.cellVerticalPadding)
  const size = Math.max(8, rect.height - padding * 2)
  const sourceSize = Math.min(dimensions.width, dimensions.height)
  const sourceX = (dimensions.width - sourceSize) / 2
  const sourceY = (dimensions.height - sourceSize) / 2
  const drawX = rect.x + theme.cellHorizontalPadding
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(drawX, rect.y + padding, size, size, 4)
  ctx.clip()
  ctx.drawImage(
    source,
    sourceX,
    sourceY,
    sourceSize,
    sourceSize,
    drawX,
    rect.y + padding,
    size,
    size
  )
  ctx.restore()
  return true
}

const EidosFileUrlImageCellEditor: ProvideEditorComponent<
  EidosFileUrlImageCell
> = ({ value: cell, onChange }) => (
  <div className="min-w-[320px] p-2">
    <Input
      autoFocus
      value={cell.data.uri}
      className="h-8 text-xs"
      onChange={(event) => {
        const uri = event.target.value
        onChange({
          ...cell,
          copyData: uri,
          data: { kind: "eidos-file-url-image-cell", uri },
        })
      }}
    />
  </div>
)

export const EidosFileUrlImageCellRenderer: CustomRenderer<EidosFileUrlImageCell> =
  {
    isMatch: (cell: CustomCell): cell is EidosFileUrlImageCell =>
      (cell.data as { kind?: unknown }).kind === "eidos-file-url-image-cell",
    kind: GridCellKind.Custom,
    needsHover: false,
    needsHoverPosition: false,
    draw: (args) =>
      drawThumbnail(args) || drawTextCell(args, args.cell.data.uri),
    measure: (_context, cell) => Math.max(180, cell.data.uri.length * 7),
    onDelete: (cell) => ({
      ...cell,
      copyData: "",
      data: { kind: "eidos-file-url-image-cell", uri: "" },
    }),
    provideEditor: () => eidosFileGridPopupEditor(EidosFileUrlImageCellEditor),
    onPaste: (value, data) => ({ ...data, uri: value }),
  }
