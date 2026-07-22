import { useCallback, useEffect, useRef, useState } from "react"
import type {
  EidosFileFieldInfo,
  EidosFileRow,
  EidosFileRowMutationResult,
  EidosFileRelationValue,
  EidosFileSqlPrimitive,
} from "@eidos.space/eidos-file"
import { decodeEidosFileAttachmentPaths } from "@eidos.space/eidos-file"
import {
  Check,
  Copy,
  ExternalLink,
  FileText,
  FolderOpen,
  LoaderCircle,
  Minus,
  Save,
  X,
} from "lucide-react"

import { useEidosFileUI } from "./context"
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

function FieldValue({
  field,
  row,
  onOpenFile,
  onRevealFile,
}: {
  field: EidosFileFieldInfo
  row: EidosFileRow
  onOpenFile?: (path: string) => void
  onRevealFile?: (path: string) => void
}) {
  const { translate: t } = useEidosFileUI()
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
    const paths = decodeEidosFileAttachmentPaths(value)
    if (paths.length === 0) {
      return <span className="text-xs text-muted-foreground">{t("Empty")}</span>
    }
    return (
      <div className="grid gap-1">
        {paths.map((path) => (
          <div
            key={path}
            className="group/file flex min-w-0 items-center gap-1"
          >
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-1.5 rounded-[3px] px-1 py-0.5 text-left text-xs hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              onClick={() => onOpenFile?.(path)}
            >
              <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{path}</span>
            </button>
            {onRevealFile ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 opacity-0 group-hover/file:opacity-100 focus-visible:opacity-100"
                aria-label={t("Show {path} in file manager", { path })}
                onClick={() => onRevealFile(path)}
              >
                <FolderOpen className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </div>
        ))}
      </div>
    )
  }
  if (field.type === "url" && typeof value === "string" && value.length > 0) {
    return (
      <button
        type="button"
        className="flex max-w-full items-center gap-1.5 rounded-[3px] px-1 py-0.5 text-left text-xs text-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        onClick={() => window.open(value, "_blank", "noopener,noreferrer")}
      >
        <span className="truncate">{value}</span>
        <ExternalLink className="h-3 w-3 shrink-0" />
      </button>
    )
  }
  const display = eidosFileRecordFieldText(row, field)
  return (
    <p
      className={
        display === "Empty"
          ? "text-xs text-muted-foreground"
          : "whitespace-pre-wrap break-words text-xs leading-5"
      }
    >
      {display === "Empty" ? t("Empty") : display}
    </p>
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
  onImportFiles?: () => Promise<string[]>
  onImportDroppedFiles?: (files: File[]) => Promise<string[]>
  onSearchRelation?: (
    field: EidosFileFieldInfo,
    query: string
  ) => Promise<EidosFileRelationValue[]>
  onOpenFile?: (path: string) => void
  onRevealFile?: (path: string) => void
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
  onOpenFile,
  onRevealFile,
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
  const Root = variant === "page" ? "section" : "aside"

  return (
    <Root
      className={cn(
        "flex h-full min-h-0 flex-col bg-background",
        variant === "page"
          ? "w-full max-w-[760px] border-x"
          : "eidos-file-detail-panel border-l"
      )}
      data-eidos-file-detail-panel="record"
      data-eidos-file-record-layout={variant}
      aria-label={t("Record details for {title}", { title })}
      aria-busy={loading || savingField !== null ? "true" : undefined}
    >
      <header
        className={cn(
          "flex items-start gap-2 border-b",
          variant === "page" ? "min-h-20 px-6 py-4" : "min-h-12 px-3 py-2.5"
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <h2
              className={cn(
                "truncate font-medium",
                variant === "page" ? "text-lg" : "text-sm"
              )}
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
                  "grid",
                  variant === "page"
                    ? "gap-3 px-6 py-4 sm:grid-cols-[minmax(140px,0.4fr)_minmax(0,1fr)] sm:items-start"
                    : "gap-1 px-3 py-2.5"
                )}
              >
                <p
                  className={cn(
                    "font-medium text-muted-foreground",
                    variant === "page" ? "pt-1 text-xs" : "text-[11px]"
                  )}
                >
                  {eidosFileFieldDisplayName(field)}
                </p>
                {onCellEdit && field.type === "file" && onImportFiles ? (
                  <EidosFileRecordAttachmentEditor
                    value={currentRow[field.tableColumnName]}
                    disabled={editorDisabled}
                    onChange={(value) => editField(field, value)}
                    onImportFiles={onImportFiles}
                    onImportDroppedFiles={onImportDroppedFiles}
                    onOpenFile={onOpenFile}
                    onRevealFile={onRevealFile}
                    onError={onError}
                  />
                ) : onCellEdit &&
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
                ) : onCellEdit &&
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
                    onOpenFile={onOpenFile}
                    onRevealFile={onRevealFile}
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
