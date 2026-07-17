import { useCallback, useState } from "react"
import { decodeBaseFilePaths, encodeBaseFilePaths } from "@eidos.space/base"
import {
  GridCellKind,
  type CustomCell,
  type CustomRenderer,
  type ProvideEditorComponent,
} from "@glideapps/glide-data-grid"
import {
  ExternalLink,
  FileIcon,
  FolderOpen,
  GripVertical,
  Plus,
  Trash2,
} from "lucide-react"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

import { resolveDefaultFilePreview, useBaseUI } from "./context"
import { drawImage } from "./cells/grid-cell-helper"
import { cn } from "./lib/cn"
import { Button } from "./ui/primitives"
import { SortableContainer } from "./ui/sortable"

interface BaseFileCellData {
  readonly kind: "base-file-cell"
  readonly paths: string[]
  readonly displayData: string[]
  readonly onImport?: () => Promise<string[]>
  readonly onOpen?: (path: string) => void
  readonly onReveal?: (path: string) => Promise<void> | void
}

export type BaseFileCell = CustomCell<BaseFileCellData>

export function baseFileDisplayData(
  paths: readonly string[],
  resolvePreview: (path: string) => string = resolveDefaultFilePreview
): string[] {
  return paths.map(resolvePreview)
}

function isImagePath(path: string): boolean {
  return (
    /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)(?:[?#].*)?$/i.test(path) ||
    /^data:image\//i.test(path)
  )
}

function displayName(path: string): string {
  try {
    return decodeURIComponent(
      path.split(/[?#]/, 1)[0].split("/").at(-1) ?? path
    )
  } catch {
    return path.split("/").at(-1) ?? path
  }
}

function BaseFileCard({
  id,
  path,
  preview,
  index,
  onOpen,
  onReveal,
  onRemove,
}: {
  id: string
  path: string
  preview: string
  index: number
  onOpen?: (path: string) => void
  onReveal?: (path: string) => Promise<void> | void
  onRemove: (index: number) => void
}) {
  const sortable = useSortable({ id })
  const image = isImagePath(path)
  return (
    <div
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
        opacity: sortable.isDragging ? 0.55 : 1,
      }}
      className={cn(
        "group flex h-9 min-w-0 items-center gap-1.5 rounded-md px-1.5 hover:bg-accent/60",
        sortable.isDragging && "bg-accent shadow-sm"
      )}
    >
      <button
        type="button"
        className="flex h-6 w-4 shrink-0 cursor-grab items-center justify-center text-muted-foreground/50 active:cursor-grabbing"
        aria-label={`Reorder ${displayName(path)}`}
        {...sortable.attributes}
        {...sortable.listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      {image ? (
        <img
          src={preview}
          alt=""
          className="h-7 w-7 shrink-0 rounded object-cover"
        />
      ) : (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-muted">
          <FileIcon className="h-3.5 w-3.5 text-muted-foreground" />
        </span>
      )}
      <button
        type="button"
        className="min-w-0 flex-1 truncate text-left text-xs"
        title={path}
        onClick={() => onOpen?.(path)}
      >
        {displayName(path)}
      </button>
      <div className="flex shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground"
          aria-label={`Open ${displayName(path)}`}
          onClick={() => onOpen?.(path)}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
        {!/^(?:https?:|data:)/i.test(path) ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground"
            aria-label={`Reveal ${displayName(path)}`}
            onClick={() => void onReveal?.(path)}
          >
            <FolderOpen className="h-3.5 w-3.5" />
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          aria-label={`Remove ${displayName(path)}`}
          onClick={() => onRemove(index)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

export const BaseFileCellEditor: ProvideEditorComponent<BaseFileCell> = ({
  value: cell,
  onChange,
}) => {
  const { resolveFilePreview } = useBaseUI()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const items = cell.data.paths.map((path, index) => ({
    id: `${path}:${index}`,
    path,
    preview: cell.data.displayData[index] ?? resolveFilePreview(path),
    index,
  }))
  const updatePaths = useCallback(
    (paths: string[]) => {
      onChange({
        ...cell,
        copyData: encodeBaseFilePaths(paths) ?? "",
        data: {
          ...cell.data,
          paths,
          displayData: baseFileDisplayData(paths, resolveFilePreview),
        },
      })
    },
    [cell, onChange, resolveFilePreview]
  )

  return (
    <div className="min-w-72 max-w-96 p-1.5">
      {items.length > 0 ? (
        <SortableContainer
          items={items}
          onReorder={(next) => updatePaths(next.map((item) => item.path))}
          className="space-y-0.5"
          renderItem={(item) => (
            <BaseFileCard
              {...item}
              onOpen={cell.data.onOpen}
              onReveal={cell.data.onReveal}
              onRemove={(index) =>
                updatePaths(
                  cell.data.paths.filter(
                    (_candidate, candidateIndex) => candidateIndex !== index
                  )
                )
              }
            />
          )}
        />
      ) : (
        <p className="px-2 py-3 text-center text-xs text-muted-foreground">
          No files attached
        </p>
      )}
      {!cell.readonly && cell.data.onImport ? (
        <>
          {items.length > 0 ? <div className="my-1 h-px bg-border" /> : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-full gap-1.5 text-xs"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              setError(null)
              void cell.data
                .onImport?.()
                .then((paths) => {
                  if (paths.length > 0) {
                    updatePaths([...cell.data.paths, ...paths])
                  }
                })
                .catch((importError) => {
                  setError(
                    importError instanceof Error
                      ? importError.message
                      : "Unable to import files"
                  )
                })
                .finally(() => setBusy(false))
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            {busy ? "Importing…" : "Add files"}
          </Button>
        </>
      ) : null}
      {error ? (
        <p className="px-2 py-1 text-xs text-destructive">{error}</p>
      ) : null}
    </div>
  )
}

export const BaseFileCellRenderer: CustomRenderer<BaseFileCell> = {
  isMatch: (cell: CustomCell): cell is BaseFileCell =>
    (cell.data as { kind?: unknown }).kind === "base-file-cell",
  kind: GridCellKind.Custom,
  needsHover: false,
  needsHoverPosition: false,
  draw: (args) => drawImage(args, args.cell.data.displayData),
  measure: (_context, cell) => Math.max(160, cell.data.paths.length * 42),
  onDelete: (cell) => ({
    ...cell,
    copyData: "",
    data: { ...cell.data, paths: [], displayData: [] },
  }),
  provideEditor: () => BaseFileCellEditor,
  onPaste: (value, data) => {
    const paths = decodeBaseFilePaths(value)
    if (paths.length === 0) return undefined
    return {
      ...data,
      paths,
      displayData: baseFileDisplayData(paths),
    }
  },
}
