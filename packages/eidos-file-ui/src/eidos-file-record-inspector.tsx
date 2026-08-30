import { useCallback, useEffect, useRef, useState } from "react"
import type {
  EidosFileFieldInfo,
  EidosFileRow,
  EidosFileRowMutationResult,
  EidosFileRelationValue,
  EidosFileSqlPrimitive,
  FileEntry,
} from "@eidos.space/eidos-file"
import { decodeEidosFileValues } from "@eidos.space/eidos-file"
import {
  Check,
  Copy,
  ExternalLink,
  LoaderCircle,
  Minus,
  Save,
  X,
} from "lucide-react"

import { useEidosFileUI } from "./context"
import { EidosFileEntrySurface } from "./eidos-file-entry-surface"
import { cn } from "./lib/cn"
import { Button, ScrollArea } from "./ui/primitives"

import { EidosFileRecordFieldEditor } from "./eidos-file-record-field-editor"
import { EidosFileRecordAttachmentEditor } from "./eidos-file-record-attachment-editor"
import { EidosFileRecordRelationEditor } from "./eidos-file-record-relation-editor"
import { eidosFileFieldDisplayName } from "./eidos-file-field-visibility"
import {
  eidosFileRecordFieldText,
  eidosFileRecordTitle,
} from "./eidos-file-record-format"
import { eidosFileUrlIsActivatable } from "./eidos-file-url-activation"
import { useEidosFileAutosizedText } from "./eidos-file-text-height"

interface FailedRecordEdit {
  field: EidosFileFieldInfo
  value: EidosFileSqlPrimitive
  previousRow: EidosFileRow
  message: string
}

function recordEditErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : fallback
  return message
    .replace(/^Error invoking remote method '[^']+':\s*/i, "")
    .replace(/^Error:\s*/i, "")
}

function AutosizedRecordFieldText({
  display,
  empty,
}: {
  display: string
  empty: boolean
}) {
  const measured = useEidosFileAutosizedText<HTMLParagraphElement>({
    text: display,
    maxLines: 12,
  })
  return (
    <p
      ref={measured.ref}
      className={cn(
        empty
          ? "text-xs text-muted-foreground"
          : "whitespace-pre-wrap break-words text-xs leading-5",
        measured.overflowing && "overscroll-contain pr-1"
      )}
      style={measured.style}
      data-eidos-file-text-overflow={
        measured.overflowing ? "scroll" : undefined
      }
    >
      {display}
    </p>
  )
}

function FieldValue({
  field,
  row,
  onError,
}: {
  field: EidosFileFieldInfo
  row: EidosFileRow
  onError?: (error: unknown) => void
}) {
  const { activateUrl, timeZone, translate: t } = useEidosFileUI()
  const value = row[field.tableColumnName]
  if (field.type === "checkbox") {
    const checked = value === true || value === 1 || value === "1"
    return (
      <span className="flex items-center gap-1.5 text-xs">
        {checked ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <Minus className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        {checked ? t("Checked") : t("Unchecked")}
      </span>
    )
  }
  if (field.type === "file") {
    const entries = decodeEidosFileValues(value)
    if (entries.length === 0) {
      return <span className="text-xs text-muted-foreground">{t("Empty")}</span>
    }
    return (
      <div className="grid gap-1">
        {entries.map((entry) => (
          <EidosFileEntrySurface key={entry.id} entry={entry} compact />
        ))}
      </div>
    )
  }
  if (
    field.type === "url" &&
    typeof value === "string" &&
    activateUrl &&
    eidosFileUrlIsActivatable(value)
  ) {
    return (
      <button
        type="button"
        className="flex max-w-full items-center gap-1.5 rounded-[3px] px-1 py-0.5 text-left text-xs text-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        onClick={() => {
          try {
            void Promise.resolve(activateUrl(value)).catch(onError)
          } catch (error) {
            onError?.(error)
          }
        }}
      >
        <span className="truncate">{value}</span>
        <ExternalLink className="h-3 w-3 shrink-0" />
      </button>
    )
  }
  const display = eidosFileRecordFieldText(row, field, timeZone)
  const empty = display === "Empty"
  return (
    <AutosizedRecordFieldText
      display={empty ? t("Empty") : display}
      empty={empty}
    />
  )
}

export interface EidosFileRecordInspectorProps {
  row: EidosFileRow
  fields: EidosFileFieldInfo[]
  variant?: "panel" | "page"
  onClose?: () => void
  onOpenInTab?: (row: EidosFileRow) => void
  onCopyRecordId: (id: string) => void
  onCellEdit?: (
    row: EidosFileRow,
    field: EidosFileFieldInfo,
    value: EidosFileSqlPrimitive
  ) => Promise<EidosFileRowMutationResult>
  disabled?: boolean
  loading?: boolean
  loadError?: string | null
  onRetryLoad?: () => void
  onError?: (error: unknown) => void
  onImportFiles?: () => Promise<FileEntry[]>
  onImportDroppedFiles?: (
    files: File[],
    source?: "drop" | "paste"
  ) => Promise<FileEntry[]>
  onSearchRelation?: (
    field: EidosFileFieldInfo,
    query: string
  ) => Promise<EidosFileRelationValue[]>
}

export function EidosFileRecordInspector({
  row,
  fields,
  variant = "panel",
  onClose,
  onOpenInTab,
  onCopyRecordId,
  onCellEdit,
  disabled = false,
  loading = false,
  loadError,
  onRetryLoad,
  onError,
  onImportFiles,
  onImportDroppedFiles,
  onSearchRelation,
}: EidosFileRecordInspectorProps) {
  const { translate: t } = useEidosFileUI()
  const [currentRow, setCurrentRow] = useState(row)
  const [savingField, setSavingField] = useState<string | null>(null)
  const [failedEdit, setFailedEdit] = useState<FailedRecordEdit | null>(null)
  const failedEditRef = useRef<FailedRecordEdit | null>(null)
  const savingRef = useRef(false)
  const rowId = String(row._id ?? "")
  const sessionRowIdRef = useRef(rowId)
  const latestRowRef = useRef(row)
  latestRowRef.current = row

  const updateFailedEdit = useCallback((next: FailedRecordEdit | null) => {
    failedEditRef.current = next
    setFailedEdit(next)
  }, [])

  useEffect(() => {
    if (sessionRowIdRef.current !== rowId) {
      sessionRowIdRef.current = rowId
      savingRef.current = false
      setSavingField(null)
      updateFailedEdit(null)
      setCurrentRow(row)
      return
    }
    if (!savingRef.current && !failedEditRef.current) {
      setCurrentRow(row)
    }
  }, [row, rowId, updateFailedEdit])
  const title = eidosFileRecordTitle(currentRow, fields)
  const measuredTitle = useEidosFileAutosizedText<HTMLHeadingElement>({
    text: title,
    maxLines: 3,
    whiteSpace: "normal",
  })
  const currentRowId =
    typeof currentRow._id === "string"
      ? currentRow._id
      : String(currentRow._id ?? "")

  const persistFieldEdit = async (
    previousRow: EidosFileRow,
    field: EidosFileFieldInfo,
    value: EidosFileSqlPrimitive,
    retrying = false
  ) => {
    if (!onCellEdit || disabled || savingRef.current) return
    const editRowId = String(previousRow._id ?? "")
    savingRef.current = true
    setSavingField(field.tableColumnName)
    if (!retrying) updateFailedEdit(null)
    try {
      const result = await onCellEdit(previousRow, field, value)
      if (String(latestRowRef.current._id ?? "") !== editRowId) return
      setCurrentRow(result.row)
      updateFailedEdit(null)
    } catch (error) {
      if (String(latestRowRef.current._id ?? "") !== editRowId) return
      const optimisticRow = {
        ...previousRow,
        [field.tableColumnName]: value,
      }
      setCurrentRow(optimisticRow)
      updateFailedEdit({
        field,
        value,
        previousRow,
        message: recordEditErrorMessage(error, t("Unable to save record")),
      })
    } finally {
      if (String(latestRowRef.current._id ?? "") === editRowId) {
        savingRef.current = false
        setSavingField(null)
      }
    }
  }

  const editField = async (
    field: EidosFileFieldInfo,
    value: EidosFileSqlPrimitive
  ) => {
    if (!onCellEdit || disabled || savingRef.current || failedEditRef.current) {
      return
    }
    const previousRow = currentRow
    setCurrentRow((current) => ({
      ...current,
      [field.tableColumnName]: value,
    }))
    await persistFieldEdit(previousRow, field, value)
  }

  const retryFailedEdit = async () => {
    const failed = failedEditRef.current
    if (!failed) return
    await persistFieldEdit(failed.previousRow, failed.field, failed.value, true)
  }

  const discardFailedEdit = () => {
    if (savingRef.current) return
    updateFailedEdit(null)
    setCurrentRow(latestRowRef.current)
  }

  const editorDisabled =
    disabled || loading || savingField !== null || failedEdit !== null
  const editable = Boolean(onCellEdit) && !disabled
  const Root = variant === "page" ? "section" : "aside"

  return (
    <Root
      className={cn(
        "flex h-full min-h-0 flex-col bg-background",
        variant === "page"
          ? "w-full max-w-[760px] border-x"
          : "eidos-file-detail-panel eidos-file-record-panel border-l"
      )}
      data-eidos-file-detail-panel="record"
      data-eidos-file-record-layout={variant}
      aria-label={t("Record details for {title}", { title })}
      aria-busy={loading || savingField !== null ? "true" : undefined}
    >
      <header
        className={cn(
          "flex items-start gap-2 border-b",
          variant === "page" ? "min-h-20 px-6 py-4" : "min-h-14 px-4 py-3"
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <h2
              ref={measuredTitle.ref}
              className={cn(
                "line-clamp-3 min-w-0 flex-1 break-words font-medium",
                variant === "page" ? "text-lg" : "text-sm"
              )}
              style={{ ...measuredTitle.style, overflowY: "hidden" }}
              data-eidos-file-record-title=""
              title={measuredTitle.overflowing ? title : undefined}
            >
              {title}
            </h2>
            {loading ? (
              <span
                role="status"
                aria-live="polite"
                className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground"
              >
                <LoaderCircle className="h-3 w-3 animate-spin motion-reduce:animate-none" />
                {t("Loading…")}
              </span>
            ) : savingField ? (
              <span
                role="status"
                aria-live="polite"
                className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground"
              >
                <Save className="h-3 w-3" />
                {t("Saving…")}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            className="mt-0.5 flex max-w-full items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={() => onCopyRecordId(currentRowId)}
          >
            <span className="truncate">{currentRowId}</span>
            <Copy className="h-3 w-3 shrink-0" />
          </button>
        </div>
        {variant === "panel" && onOpenInTab ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            aria-label={t("Open record in tab")}
            title={t("Open in tab")}
            disabled={savingField !== null}
            onClick={() => onOpenInTab(currentRow)}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        ) : null}
        {variant === "panel" && onClose ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            aria-label={t("Close record details")}
            disabled={savingField !== null}
            onClick={onClose}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </header>
      {failedEdit ? (
        <div
          className="border-b bg-destructive/5 px-3 py-2 text-xs text-destructive"
          role="alert"
        >
          <p className="break-words leading-4">{failedEdit.message}</p>
          <div className="mt-2 flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2.5 text-xs"
              disabled={savingField !== null}
              onClick={() => void retryFailedEdit()}
            >
              {savingField ? t("Retrying…") : t("Retry")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2.5 text-xs text-muted-foreground"
              disabled={savingField !== null}
              onClick={discardFailedEdit}
            >
              {t("Discard change")}
            </Button>
          </div>
        </div>
      ) : null}
      {loading ? (
        <div
          className="flex min-h-0 flex-1 items-center justify-center gap-2 text-xs text-muted-foreground"
          aria-hidden="true"
        >
          <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />
          {t("Loading record details…")}
        </div>
      ) : loadError ? (
        <div
          className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-5 text-center text-xs text-muted-foreground"
          role="alert"
        >
          <p className="max-w-64 break-words">{loadError}</p>
          {onRetryLoad ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={onRetryLoad}
            >
              {t("Retry")}
            </Button>
          ) : null}
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="divide-y">
            {fields.map((field) => (
              <div
                key={field.tableColumnName}
                className={cn(
                  "eidos-file-record-field grid",
                  variant === "page"
                    ? "gap-3 px-6 py-4 sm:grid-cols-[minmax(140px,0.4fr)_minmax(0,1fr)] sm:items-start"
                    : "gap-1.5 px-4 py-3"
                )}
              >
                <p
                  className={cn(
                    "eidos-file-record-field-label font-medium text-muted-foreground",
                    variant === "page" ? "pt-1 text-xs" : "text-[11px]"
                  )}
                >
                  {eidosFileFieldDisplayName(field)}
                </p>
                {editable && field.type === "file" ? (
                  <EidosFileRecordAttachmentEditor
                    value={currentRow[field.tableColumnName]}
                    disabled={editorDisabled}
                    onChange={(value) => editField(field, value)}
                    onImportFiles={onImportFiles}
                    onImportDroppedFiles={onImportDroppedFiles}
                    onError={onError}
                  />
                ) : editable &&
                  field.type === "relation" &&
                  onSearchRelation ? (
                  <EidosFileRecordRelationEditor
                    row={currentRow}
                    field={field}
                    disabled={editorDisabled}
                    onChange={(value) => editField(field, value)}
                    onSearch={onSearchRelation}
                    onError={onError}
                  />
                ) : editable &&
                  field.valueKind === "source" &&
                  field.type !== "file" &&
                  field.type !== "relation" ? (
                  <EidosFileRecordFieldEditor
                    field={field}
                    row={currentRow}
                    disabled={editorDisabled}
                    onChange={(value) => editField(field, value)}
                  />
                ) : (
                  <FieldValue
                    field={field}
                    row={currentRow}
                    onError={onError}
                  />
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </Root>
  )
}
