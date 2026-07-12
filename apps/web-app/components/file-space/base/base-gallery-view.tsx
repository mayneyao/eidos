import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import type {
  BaseFieldInfo,
  BaseRow,
  BaseRowMutationResult,
  BaseRowPage,
  BaseSqlPrimitive,
  BaseTableSnapshot,
  BaseViewInfo,
} from "@eidos.space/base"
import type { SpaceBinaryFile } from "@eidos.space/file-space"
import { LoaderCircle } from "lucide-react"

import { Button } from "@/components/ui/button"

import { BaseRecordCard } from "./base-record-card"
import { BaseRecordDeleteDialog } from "./base-record-delete-dialog"
import { BaseRecordInspector } from "./base-record-inspector"
import { orderedBaseFields } from "./base-view-layout"

const GALLERY_PAGE_SIZE = 100

function galleryCardWidth(view: BaseViewInfo): number {
  const size = view.properties?.cardSize
  if (size === "small") return 220
  if (size === "large") return 340
  return 280
}

export function BaseGalleryView({
  table,
  view,
  reloadToken = 0,
  loadPage,
  readBinary,
  onCellEdit,
  onImportFiles,
  onImportDroppedFiles,
  onDeleteRow,
  onOpenFile,
  onRevealFile,
  onError,
  sidePanel,
}: {
  table: BaseTableSnapshot
  view: BaseViewInfo
  reloadToken?: number
  loadPage: (offset: number, limit: number) => Promise<BaseRowPage>
  readBinary?: (path: string) => Promise<SpaceBinaryFile>
  onCellEdit?: (
    row: BaseRow,
    field: BaseFieldInfo,
    value: BaseSqlPrimitive
  ) => Promise<BaseRowMutationResult>
  onImportFiles?: () => Promise<string[]>
  onImportDroppedFiles?: (files: File[]) => Promise<string[]>
  onDeleteRow?: (row: BaseRow) => Promise<void>
  onOpenFile?: (path: string) => void
  onRevealFile?: (path: string) => Promise<void> | void
  onError?: (error: unknown) => void
  sidePanel?: ReactNode
}) {
  const generationRef = useRef(0)
  const [rows, setRows] = useState<BaseRow[]>([])
  const [total, setTotal] = useState(table.rowCount)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [inspectedRow, setInspectedRow] = useState<BaseRow | null>(null)
  const [deleteRow, setDeleteRow] = useState<BaseRow | null>(null)
  const fields = orderedBaseFields(table.fields, view)

  const requestPage = useCallback(
    async (offset: number, append: boolean) => {
      const generation = generationRef.current
      append ? setLoadingMore(true) : setLoading(true)
      try {
        const page = await loadPage(offset, GALLERY_PAGE_SIZE)
        if (generation !== generationRef.current) return
        setRows((current) => (append ? [...current, ...page.rows] : page.rows))
        setTotal(page.total)
      } catch (error) {
        if (generation === generationRef.current) onError?.(error)
      } finally {
        if (generation === generationRef.current) {
          append ? setLoadingMore(false) : setLoading(false)
        }
      }
    },
    [loadPage, onError]
  )

  useEffect(() => {
    generationRef.current += 1
    setRows([])
    setInspectedRow(null)
    void requestPage(0, false)
    return () => {
      generationRef.current += 1
    }
  }, [reloadToken, requestPage, table.table.id, view.id])

  const copyRecordId = (id: string) => {
    if (!navigator.clipboard) {
      onError?.(new Error("Clipboard access is unavailable"))
      return
    }
    void navigator.clipboard.writeText(id).catch((error) => onError?.(error))
  }

  const editRecord = async (
    row: BaseRow,
    field: BaseFieldInfo,
    value: BaseSqlPrimitive
  ) => {
    if (!onCellEdit) throw new Error("Record editing is unavailable")
    const result = await onCellEdit(row, field, value)
    setRows((current) =>
      current.map((candidate) =>
        String(candidate._id) === String(result.row._id)
          ? result.row
          : candidate
      )
    )
    setInspectedRow(result.row)
    return result
  }

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden">
      <div className="min-w-0 flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex h-40 items-center justify-center gap-2 text-xs text-muted-foreground">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Loading gallery…
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
            No records in this view.
          </div>
        ) : (
          <div
            className="grid items-start gap-3"
            role="list"
            aria-label={`${view.name} records`}
            style={{
              gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${galleryCardWidth(
                view
              )}px), 1fr))`,
            }}
          >
            {rows.map((row) => (
              <BaseRecordCard
                key={String(row._id)}
                row={row}
                fields={table.fields}
                view={view}
                readBinary={readBinary}
                role="listitem"
                onOpen={setInspectedRow}
                onDelete={onDeleteRow ? setDeleteRow : undefined}
              />
            ))}
          </div>
        )}
        {rows.length < total ? (
          <div className="flex justify-center py-5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              disabled={loadingMore}
              onClick={() => void requestPage(rows.length, true)}
            >
              {loadingMore ? (
                <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : null}
              Load more · {rows.length} of {total}
            </Button>
          </div>
        ) : null}
      </div>
      {sidePanel ??
        (inspectedRow ? (
          <BaseRecordInspector
            row={inspectedRow}
            fields={fields}
            onClose={() => setInspectedRow(null)}
            onCopyRecordId={copyRecordId}
            onCellEdit={onCellEdit ? editRecord : undefined}
            onError={onError}
            onImportFiles={onImportFiles}
            onImportDroppedFiles={onImportDroppedFiles}
            onOpenFile={onOpenFile}
            onRevealFile={
              onRevealFile
                ? (path) => {
                    void Promise.resolve(onRevealFile(path)).catch((error) =>
                      onError?.(error)
                    )
                  }
                : undefined
            }
          />
        ) : null)}
      {onDeleteRow ? (
        <BaseRecordDeleteDialog
          row={deleteRow}
          onOpenChange={(open) => {
            if (!open) setDeleteRow(null)
          }}
          onDelete={onDeleteRow}
          onError={onError}
        />
      ) : null}
    </div>
  )
}
