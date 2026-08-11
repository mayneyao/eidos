import { useCallback, useState } from "react"
import {
  decodeEidosFileValues,
  encodeEidosFileValues,
  type FileEntry,
} from "@eidos.space/eidos-file"
import {
  drawTextCell,
  GridCellKind,
  type CustomCell,
  type CustomRenderer,
  type ProvideEditorComponent,
} from "@glideapps/glide-data-grid"
import { GripVertical, Paperclip, Plus, Trash2 } from "lucide-react"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

import { useEidosFileUI } from "./context"
import { EidosFileEntrySurface } from "./eidos-file-entry-surface"
import {
  EidosFileRemoteAttachmentControl,
  eidosFileRemoteAssetAcquisitionAllowed,
} from "./eidos-file-remote-attachment-control"
import { cn } from "./lib/cn"
import { Button } from "./ui/primitives"
import { SortableContainer } from "./ui/sortable"
import {
  EIDOS_FILE_GRID_EDITOR_BODY_CLASS_NAME,
  EIDOS_FILE_GRID_EDITOR_FOOTER_CLASS_NAME,
  EidosFileGridEditorHeader,
  EidosFileGridEditorSurface,
  eidosFileGridPopupEditor,
} from "./cells/grid-editor-surface"

export interface EidosFileAttachmentCellData {
  readonly kind: "eidos-file-file-cell"
  readonly entries: FileEntry[]
  /** Host-approved, decoded image sources for the current rendered Grid cell. */
  readonly thumbnails?: readonly CanvasImageSource[]
  /** Returns Host-acquired entries; UI never manufactures File metadata. */
  readonly onImport?: () => Promise<FileEntry[]>
}

export type EidosFileAttachmentCell = CustomCell<EidosFileAttachmentCellData>

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

function drawAttachmentThumbnails(
  args: Parameters<
    NonNullable<CustomRenderer<EidosFileAttachmentCell>["draw"]>
  >[0]
): boolean {
  const thumbnails = args.cell.data.thumbnails ?? []
  if (thumbnails.length === 0) return false
  const { ctx, rect, theme } = args
  const padding = Math.max(3, theme.cellVerticalPadding)
  const size = Math.max(8, rect.height - padding * 2)
  const available = Math.max(
    1,
    Math.floor((rect.width - theme.cellHorizontalPadding * 2 + 4) / (size + 4))
  )
  const visible = thumbnails.slice(0, available)
  let drawX = rect.x + theme.cellHorizontalPadding
  ctx.save()
  ctx.beginPath()
  ctx.rect(rect.x, rect.y, rect.width, rect.height)
  ctx.clip()
  for (const source of visible) {
    const dimensions = imageDimensions(source)
    if (!dimensions) continue
    const sourceSize = Math.min(dimensions.width, dimensions.height)
    const sourceX = (dimensions.width - sourceSize) / 2
    const sourceY = (dimensions.height - sourceSize) / 2
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
    drawX += size + 4
  }
  const hiddenCount = args.cell.data.entries.length - visible.length
  if (hiddenCount > 0 && drawX < rect.x + rect.width - 12) {
    ctx.fillStyle = theme.textLight
    ctx.font = `${theme.baseFontStyle} ${theme.fontFamily}`
    ctx.fillText(`+${hiddenCount}`, drawX, rect.y + rect.height / 2 + 4)
  }
  ctx.restore()
  return true
}

function EidosFileAttachmentCard({
  entry,
  index,
  onRemove,
}: {
  entry: FileEntry
  index: number
  onRemove: (index: number) => void
}) {
  const { translate: t } = useEidosFileUI()
  const sortable = useSortable({ id: entry.id })
  return (
    <div
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
        opacity: sortable.isDragging ? 0.55 : 1,
      }}
      className={cn(
        "group flex min-w-0 items-center gap-0.5 rounded px-0.5 hover:bg-accent/60 focus-within:bg-accent/60",
        sortable.isDragging && "bg-accent shadow-sm"
      )}
    >
      <button
        type="button"
        className="flex h-6 w-4 shrink-0 cursor-grab items-center justify-center text-muted-foreground/50 active:cursor-grabbing"
        aria-label={t("Reorder {file}", { file: entry.name })}
        {...sortable.attributes}
        {...sortable.listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <EidosFileEntrySurface entry={entry} compact className="min-w-0 flex-1" />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 group-focus-within:opacity-100"
        aria-label={t("Remove {file}", { file: entry.name })}
        onClick={() => onRemove(index)}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

export const EidosFileAttachmentCellEditor: ProvideEditorComponent<
  EidosFileAttachmentCell
> = ({ value: cell, onChange }) => {
  const { assetSession, translate: t } = useEidosFileUI()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const updateEntries = useCallback(
    (entries: FileEntry[]) => {
      onChange({
        ...cell,
        copyData: entries.length > 0 ? encodeEidosFileValues(entries) : "",
        data: { ...cell.data, entries },
      })
    },
    [cell, onChange]
  )

  return (
    <EidosFileGridEditorSurface className="max-h-[340px]">
      <EidosFileGridEditorHeader icon={<Paperclip />} title={t("Files")} />
      <div className={EIDOS_FILE_GRID_EDITOR_BODY_CLASS_NAME}>
        {cell.data.entries.length > 0 ? (
          <SortableContainer
            items={cell.data.entries}
            onReorder={updateEntries}
            className="space-y-0.5"
            renderItem={(entry, index) => (
              <EidosFileAttachmentCard
                entry={entry}
                index={index}
                onRemove={(removeIndex) =>
                  updateEntries(
                    cell.data.entries.filter(
                      (_candidate, candidateIndex) =>
                        candidateIndex !== removeIndex
                    )
                  )
                }
              />
            )}
          />
        ) : (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">
            {t("No files attached")}
          </p>
        )}
        {error ? (
          <p className="px-2 py-1 text-xs text-destructive">{error}</p>
        ) : null}
      </div>
      {!cell.readonly &&
      (cell.data.onImport ||
        eidosFileRemoteAssetAcquisitionAllowed(assetSession)) ? (
        <div
          data-eidos-file-attachment-actions=""
          className={cn(
            EIDOS_FILE_GRID_EDITOR_FOOTER_CLASS_NAME,
            "h-auto min-h-8 max-h-[260px] shrink overflow-y-auto overscroll-contain py-1"
          )}
        >
          <div className="grid w-full gap-1">
            {cell.data.onImport ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-full justify-start gap-1.5 px-1.5 text-xs"
                disabled={busy}
                onClick={() => {
                  setBusy(true)
                  setError(null)
                  void cell.data
                    .onImport?.()
                    .then((entries) => {
                      if (entries.length > 0) {
                        const existingUris = new Set(
                          cell.data.entries.map((entry) => entry.uri)
                        )
                        updateEntries([
                          ...cell.data.entries,
                          ...entries.filter(
                            (entry) => !existingUris.has(entry.uri)
                          ),
                        ])
                      }
                    })
                    .catch((importError) => {
                      setError(
                        importError instanceof Error
                          ? importError.message
                          : t("Unable to import files")
                      )
                    })
                    .finally(() => setBusy(false))
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                {busy ? t("Importing…") : t("Add files")}
              </Button>
            ) : null}
            <EidosFileRemoteAttachmentControl
              className="w-full text-xs"
              disabled={busy}
              onAcquired={(entry) => {
                const existingIds = new Set(
                  cell.data.entries.map((candidate) => candidate.id)
                )
                const existingUris = new Set(
                  cell.data.entries.map((candidate) => candidate.uri)
                )
                if (
                  !existingIds.has(entry.id) &&
                  !existingUris.has(entry.uri)
                ) {
                  updateEntries([...cell.data.entries, entry])
                }
              }}
            />
          </div>
        </div>
      ) : null}
    </EidosFileGridEditorSurface>
  )
}

export const EidosFileAttachmentCellRenderer: CustomRenderer<EidosFileAttachmentCell> =
  {
    isMatch: (cell: CustomCell): cell is EidosFileAttachmentCell =>
      (cell.data as { kind?: unknown }).kind === "eidos-file-file-cell",
    kind: GridCellKind.Custom,
    needsHover: false,
    needsHoverPosition: false,
    draw: (args) =>
      drawAttachmentThumbnails(args) ||
      drawTextCell(
        args,
        args.cell.data.entries.map((entry) => entry.name).join(", ")
      ),
    measure: (_context, cell) =>
      Math.max(
        160,
        cell.data.entries.reduce(
          (length, entry) => length + entry.name.length,
          0
        ) * 8
      ),
    onDelete: (cell) => ({
      ...cell,
      copyData: "",
      data: { ...cell.data, entries: [] },
    }),
    provideEditor: () =>
      eidosFileGridPopupEditor(EidosFileAttachmentCellEditor),
    onPaste: (value, data) => {
      const entries = decodeEidosFileValues(value)
      if (entries.length === 0) return undefined
      return { ...data, entries }
    },
  }
