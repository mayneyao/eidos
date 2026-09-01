import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
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
  ChevronLeft,
  ChevronRight,
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
import {
  eidosFileFieldDisplayName,
  isEidosFileFieldWritable,
  isEidosFileRecordLabelField,
} from "./eidos-file-field-visibility"
import {
  eidosFileRecordFieldText,
  eidosFileRecordTitle,
} from "./eidos-file-record-format"
import { eidosFileUrlIsActivatable } from "./eidos-file-url-activation"
import { useEidosFileAutosizedText } from "./eidos-file-text-height"
import { renderSafeEidosFileMarkdown } from "./eidos-file-markdown"
import { eidosFileFieldTypeIcon } from "./eidos-file-field-type-picker"

const LazyEidosFileMarkdownSourceEditor = lazy(async () => {
  const module = await import("./eidos-file-markdown-source-editor")
  return { default: module.EidosFileMarkdownSourceEditor }
})

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
    if (value === null || value === undefined) {
      return <span className="text-xs text-muted-foreground">{t("Empty")}</span>
    }
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

function MarkdownContentEditor({
  value,
  mode,
  editable,
  disabled,
  cacheKey,
  onDraftChange,
  onEdit,
  onCancelEdit,
  onSaveAndPreview,
  onError,
}: {
  value: string
  mode: "preview" | "edit"
  editable: boolean
  disabled: boolean
  cacheKey: string
  onDraftChange: (value: string) => void
  onEdit: () => void
  onCancelEdit: () => void
  onSaveAndPreview: () => Promise<void>
  onError?: (error: unknown) => void
}) {
  const { activateUrl, translate: t } = useEidosFileUI()
  const html = useMemo(() => renderSafeEidosFileMarkdown(value), [value])

  if (mode === "edit") {
    return (
      <div
        className="flex min-h-0 w-full flex-1 flex-col"
        data-eidos-file-markdown-editor="source"
        onKeyDownCapture={(event) => {
          if (event.key === "Escape") {
            event.preventDefault()
            onCancelEdit()
          } else if (
            event.key.toLowerCase() === "s" &&
            (event.metaKey || event.ctrlKey) &&
            !event.altKey
          ) {
            event.preventDefault()
            void onSaveAndPreview()
          }
        }}
      >
        <Suspense
          fallback={
            <div
              className="flex min-h-0 flex-1 items-center justify-center gap-2 text-xs text-muted-foreground"
              role="status"
            >
              <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />
              {t("Loading…")}
            </div>
          }
        >
          <LazyEidosFileMarkdownSourceEditor
            cacheKey={cacheKey}
            content={value}
            disabled={disabled}
            onChange={onDraftChange}
          />
        </Suspense>
      </div>
    )
  }

  return (
    <div
      className="group relative min-h-0 w-full pb-20"
      data-eidos-file-markdown-editor="preview"
    >
      {value.trim() ? (
        <div
          className="max-w-none break-words text-[15px] leading-7 text-foreground [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:my-6 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_code]:rounded-sm [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em] [&_h1]:mb-4 [&_h1]:mt-10 [&_h1]:text-3xl [&_h1]:font-semibold [&_h1]:leading-tight [&_h1]:tracking-tight [&_h2]:mb-3 [&_h2]:mt-9 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:leading-tight [&_h2]:tracking-tight [&_h3]:mb-2 [&_h3]:mt-7 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:leading-snug [&_hr]:my-9 [&_hr]:border-border [&_img]:my-6 [&_img]:max-w-full [&_img]:rounded-sm [&_li]:my-1 [&_ol]:my-5 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-5 [&_pre]:my-6 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-4 [&_pre]:text-sm [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_strong]:font-semibold [&_table]:my-6 [&_table]:w-full [&_td]:border-b [&_td]:px-2 [&_td]:py-2 [&_th]:border-b [&_th]:px-2 [&_th]:py-2 [&_th]:text-left [&_ul]:my-5 [&_ul]:list-disc [&_ul]:pl-6 [&>*:first-child]:mt-0"
          data-eidos-file-markdown-preview=""
          dangerouslySetInnerHTML={{ __html: html }}
          onDoubleClick={() => {
            if (editable && !disabled) onEdit()
          }}
          onClick={(event) => {
            const target = event.target as Element
            const link = target.closest<HTMLAnchorElement>(
              "a[data-eidos-file-markdown-external]"
            )
            if (!link) return
            event.preventDefault()
            if (!activateUrl) return
            try {
              void Promise.resolve(activateUrl(link.href)).catch(onError)
            } catch (error) {
              onError?.(error)
            }
          }}
        />
      ) : editable ? (
        <button
          type="button"
          className="w-full py-10 text-left text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          disabled={disabled}
          onClick={onEdit}
        >
          {t("Write content with Markdown…")}
        </button>
      ) : (
        <p className="py-8 text-sm text-muted-foreground">{t("Empty")}</p>
      )}
    </div>
  )
}

export interface EidosFileRecordInspectorProps {
  row: EidosFileRow
  fields: EidosFileFieldInfo[]
  variant?: "panel" | "page"
  contentField?: EidosFileFieldInfo | null
  onClose?: () => void
  onPreviousRecord?: () => void | Promise<void>
  onNextRecord?: () => void | Promise<void>
  onOpenInTab?: (row: EidosFileRow) => void
  /** @deprecated Record IDs are no longer shown in record inspectors. */
  onCopyRecordId?: (id: string) => void
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
  contentField,
  onClose,
  onPreviousRecord,
  onNextRecord,
  onOpenInTab,
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
  const recordNavigationDisabled =
    loading || savingField !== null || failedEdit !== null
  const editable = Boolean(onCellEdit) && !disabled
  const Root = variant === "page" ? "section" : "aside"
  const recordLabelField = fields.find(isEidosFileRecordLabelField) ?? null
  const pageTitleField =
    variant === "page" && recordLabelField?.type === "text"
      ? recordLabelField
      : null
  const pageTitleWritable = Boolean(
    pageTitleField &&
    editable &&
    pageTitleField.valueKind === "source" &&
    isEidosFileFieldWritable(pageTitleField)
  )
  const metadataFields = fields.filter(
    (field) =>
      field.id !== contentField?.id &&
      (variant !== "page" || field.id !== pageTitleField?.id)
  )
  const contentValue = contentField
    ? typeof currentRow[contentField.tableColumnName] === "string"
      ? (currentRow[contentField.tableColumnName] as string)
      : String(currentRow[contentField.tableColumnName] ?? "")
    : ""
  const [contentMode, setContentMode] = useState<"preview" | "edit">("preview")
  const [contentDraft, setContentDraft] = useState(contentValue)
  const contentIdentity = `${currentRowId}:${contentField?.id ?? ""}`
  const contentIdentityRef = useRef(contentIdentity)

  useEffect(() => {
    if (contentIdentityRef.current === contentIdentity) return
    contentIdentityRef.current = contentIdentity
    setContentMode("preview")
    setContentDraft(contentValue)
  }, [contentIdentity, contentValue])

  useEffect(() => {
    if (contentMode === "preview") setContentDraft(contentValue)
  }, [contentMode, contentValue])

  const startContentEdit = () => {
    if (!contentField || editorDisabled) return
    setContentDraft(contentValue)
    setContentMode("edit")
  }

  const cancelContentEdit = () => {
    setContentDraft(contentValue)
    setContentMode("preview")
  }

  const saveContentAndPreview = async () => {
    if (!contentField || editorDisabled) return false
    if (contentDraft !== contentValue) {
      await editField(contentField, contentDraft)
      if (failedEditRef.current) return false
    }
    setContentMode("preview")
    return true
  }

  const closeRecord = async () => {
    if (!onClose) return
    if (contentMode === "edit" && contentDraft !== contentValue) {
      const saved = await saveContentAndPreview()
      if (!saved) return
    }
    onClose()
  }

  const navigateRecord = async (
    navigate: (() => void | Promise<void>) | undefined
  ) => {
    if (!navigate) return
    if (contentMode === "edit") {
      const saved = await saveContentAndPreview()
      if (!saved) return
    }
    try {
      await navigate()
    } catch (error) {
      onError?.(error)
    }
  }

  const saveStatus = loading ? (
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
  ) : null

  const recordNavigationButtons = (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        aria-label={t("Previous record")}
        title={t("Previous record")}
        disabled={!onPreviousRecord || recordNavigationDisabled}
        onClick={() => void navigateRecord(onPreviousRecord)}
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        aria-label={t("Next record")}
        title={t("Next record")}
        disabled={!onNextRecord || recordNavigationDisabled}
        onClick={() => void navigateRecord(onNextRecord)}
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </Button>
    </>
  )

  const metadataRows = metadataFields.map((field) => {
    const fieldWritable = editable && isEidosFileFieldWritable(field)
    const FieldTypeIcon = eidosFileFieldTypeIcon(field.type)
    return (
      <div
        key={field.tableColumnName}
        className={cn(
          "eidos-file-record-field grid",
          variant === "page"
            ? "gap-x-5 gap-y-1 py-1 sm:grid-cols-[120px_minmax(0,1fr)] sm:items-start"
            : "gap-1.5 px-4 py-3"
        )}
      >
        <p
          className={cn(
            "eidos-file-record-field-label flex min-w-0 items-center gap-1.5 font-medium text-muted-foreground",
            variant === "page" ? "pt-1 text-xs" : "text-[11px]"
          )}
        >
          {FieldTypeIcon ? (
            <FieldTypeIcon
              aria-hidden="true"
              data-eidos-file-field-type-icon={field.type}
              className="h-3.5 w-3.5 shrink-0"
            />
          ) : null}
          <span className="truncate">{eidosFileFieldDisplayName(field)}</span>
        </p>
        {fieldWritable && field.type === "file" ? (
          <EidosFileRecordAttachmentEditor
            value={currentRow[field.tableColumnName]}
            disabled={editorDisabled}
            onChange={(value) => editField(field, value)}
            onImportFiles={onImportFiles}
            onImportDroppedFiles={onImportDroppedFiles}
            onError={onError}
          />
        ) : fieldWritable && field.type === "relation" && onSearchRelation ? (
          <EidosFileRecordRelationEditor
            row={currentRow}
            field={field}
            disabled={editorDisabled}
            onChange={(value) => editField(field, value)}
            onSearch={onSearchRelation}
            onError={onError}
          />
        ) : fieldWritable &&
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
          <FieldValue field={field} row={currentRow} onError={onError} />
        )}
      </div>
    )
  })

  return (
    <Root
      className={cn(
        "flex h-full min-h-0 flex-col bg-background",
        variant === "page"
          ? "absolute inset-0 z-30 w-full overflow-hidden"
          : "eidos-file-detail-panel eidos-file-record-panel border-l"
      )}
      data-eidos-file-detail-panel="record"
      data-eidos-file-record-layout={variant}
      aria-label={t("Record details for {title}", { title })}
      aria-busy={loading || savingField !== null ? "true" : undefined}
    >
      {variant === "page" ? (
        <header className="shrink-0 bg-background">
          <div className="mx-auto w-full max-w-[960px] px-5 pt-4 sm:px-8 lg:px-12">
            <div
              className="mx-auto flex min-h-11 w-full max-w-[760px] items-center gap-4 py-2"
              data-eidos-file-record-page-header-row=""
            >
              <div className="min-w-0 flex-1">
                {pageTitleField && pageTitleWritable ? (
                  <div data-eidos-file-record-title="">
                    <EidosFileRecordFieldEditor
                      field={pageTitleField}
                      row={currentRow}
                      placeholder={eidosFileFieldDisplayName(pageTitleField)}
                      appearance="record-title"
                      disabled={editorDisabled}
                      onChange={(value) => editField(pageTitleField, value)}
                    />
                  </div>
                ) : (
                  <h2
                    ref={measuredTitle.ref}
                    className="min-w-0 break-words text-xl font-semibold leading-tight tracking-tight sm:text-2xl"
                    data-eidos-file-record-title=""
                  >
                    {title}
                  </h2>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                {saveStatus}
                {recordNavigationButtons}
                {onClose ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    aria-label={t("Close record details")}
                    disabled={savingField !== null}
                    onClick={() => void closeRecord()}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </header>
      ) : (
        <header
          className="flex min-h-14 items-start gap-2 border-b px-4 py-3"
          data-eidos-file-record-panel-header=""
        >
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <h2
                ref={measuredTitle.ref}
                className="line-clamp-3 min-w-0 flex-1 break-words text-sm font-medium"
                style={{ ...measuredTitle.style, overflowY: "hidden" }}
                data-eidos-file-record-title=""
                title={measuredTitle.overflowing ? title : undefined}
              >
                {title}
              </h2>
              {saveStatus}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {onOpenInTab ? (
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
            {recordNavigationButtons}
            {onClose ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                aria-label={t("Close record details")}
                disabled={savingField !== null}
                onClick={() => void closeRecord()}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </div>
        </header>
      )}
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
      ) : variant === "page" ? (
        <div
          className={cn(
            "min-h-0 flex-1 overscroll-contain [scrollbar-color:var(--border)_transparent] [scrollbar-gutter:stable_both-edges] [scrollbar-width:thin]",
            contentMode === "edit" ? "overflow-hidden" : "overflow-y-auto"
          )}
          data-eidos-file-record-page-scroll=""
        >
          <article
            className={cn(
              "mx-auto w-full max-w-[960px] px-5 pt-2 sm:px-8 lg:px-12",
              contentMode === "edit"
                ? "flex h-full min-h-0 flex-col pb-3"
                : "pb-20"
            )}
          >
            {metadataRows.length > 0 ? (
              <div
                className="mx-auto grid w-full max-w-[760px] gap-0 py-2"
                data-eidos-file-record-properties=""
              >
                {metadataRows}
              </div>
            ) : null}
            {contentField ? (
              <div
                className={cn(
                  "mx-auto mt-3 w-full max-w-[760px] pt-3",
                  contentMode === "edit" && "flex min-h-0 flex-1 flex-col"
                )}
                data-eidos-file-record-content=""
              >
                <MarkdownContentEditor
                  key={`${currentRowId}:${contentField.id}`}
                  value={contentValue}
                  mode={contentMode}
                  editable={editable}
                  disabled={editorDisabled}
                  cacheKey={`${currentRowId}:${contentField.id}`}
                  onDraftChange={setContentDraft}
                  onEdit={startContentEdit}
                  onCancelEdit={cancelContentEdit}
                  onSaveAndPreview={async () => {
                    await saveContentAndPreview()
                  }}
                  onError={onError}
                />
              </div>
            ) : null}
          </article>
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="divide-y">{metadataRows}</div>
        </ScrollArea>
      )}
    </Root>
  )
}
