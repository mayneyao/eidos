import {
  useCallback,
  useEffect,
  useLayoutEffect,
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
  Copy,
  ExternalLink,
  LoaderCircle,
  Minus,
  Pencil,
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
import { Textarea } from "./ui/primitives"

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
  label,
  editable,
  disabled,
  onSave,
  onError,
}: {
  value: string
  label: string
  editable: boolean
  disabled: boolean
  onSave: (value: string) => Promise<void>
  onError?: (error: unknown) => void
}) {
  const { activateUrl, translate: t } = useEidosFileUI()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const html = useMemo(() => renderSafeEidosFileMarkdown(value), [value])

  useEffect(() => {
    if (!editing) setDraft(value)
  }, [editing, value])

  useLayoutEffect(() => {
    if (!editing || !editorRef.current) return
    const editor = editorRef.current
    editor.style.height = "0px"
    editor.style.height = `${Math.max(editor.scrollHeight, window.innerHeight * 0.5)}px`
  }, [draft, editing])

  const save = async () => {
    if (saving || disabled) return
    if (draft === value) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      await onSave(draft)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <div className="pb-20" data-eidos-file-markdown-editor="source">
        <div className="sticky top-0 z-10 -mx-2 mb-2 flex min-h-11 items-center justify-between gap-3 border-b bg-background/95 px-2 py-1.5 backdrop-blur-sm">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium">{label}</p>
            <p className="text-[10px] text-muted-foreground">Markdown</p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={saving}
              onClick={() => {
                setDraft(value)
                setEditing(false)
              }}
            >
              {t("Cancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={saving || disabled}
              onClick={() => void save()}
            >
              {saving ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              {saving ? t("Saving…") : t("Save")}
            </Button>
          </div>
        </div>
        <Textarea
          ref={editorRef}
          autoFocus
          rows={1}
          value={draft}
          disabled={saving || disabled}
          aria-label={t("Markdown content")}
          className="min-h-[50vh] resize-none overflow-hidden rounded-none border-0 bg-transparent px-0 py-5 font-mono text-[15px] leading-7 shadow-none focus-visible:ring-0"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault()
              setDraft(value)
              setEditing(false)
            } else if (
              event.key === "Enter" &&
              (event.metaKey || event.ctrlKey)
            ) {
              event.preventDefault()
              void save()
            }
          }}
        />
        <p className="mt-2 text-[11px] text-muted-foreground">
          {t("Press {shortcut} to save.", {
            shortcut: globalThis.navigator?.platform.includes("Mac")
              ? "⌘↵"
              : "Ctrl+Enter",
          })}
        </p>
      </div>
    )
  }

  return (
    <div
      className="group relative pb-20"
      data-eidos-file-markdown-editor="preview"
    >
      <div className="mb-5 flex min-h-9 items-center justify-between gap-3 border-b pb-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium">{label}</p>
          <p className="text-[10px] text-muted-foreground">Markdown</p>
        </div>
        {editable ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground opacity-70 transition-opacity hover:text-foreground group-hover:opacity-100 group-focus-within:opacity-100"
            disabled={disabled}
            onClick={() => setEditing(true)}
          >
            <Pencil className="h-3.5 w-3.5" />
            {t("Edit content")}
          </Button>
        ) : null}
      </div>
      {value.trim() ? (
        <div
          className="max-w-none break-words text-[15px] leading-7 text-foreground [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:my-6 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_code]:rounded-sm [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em] [&_h1]:mb-4 [&_h1]:mt-10 [&_h1]:text-3xl [&_h1]:font-semibold [&_h1]:leading-tight [&_h1]:tracking-tight [&_h2]:mb-3 [&_h2]:mt-9 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:leading-tight [&_h2]:tracking-tight [&_h3]:mb-2 [&_h3]:mt-7 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:leading-snug [&_hr]:my-9 [&_hr]:border-border [&_img]:my-6 [&_img]:max-w-full [&_img]:rounded-sm [&_li]:my-1 [&_ol]:my-5 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-5 [&_pre]:my-6 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-4 [&_pre]:text-sm [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_strong]:font-semibold [&_table]:my-6 [&_table]:w-full [&_td]:border-b [&_td]:px-2 [&_td]:py-2 [&_th]:border-b [&_th]:px-2 [&_th]:py-2 [&_th]:text-left [&_ul]:my-5 [&_ul]:list-disc [&_ul]:pl-6 [&>*:first-child]:mt-0"
          dangerouslySetInnerHTML={{ __html: html }}
          onDoubleClick={() => {
            if (editable && !disabled) setEditing(true)
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
          onClick={() => setEditing(true)}
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
  contentField,
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

  const recordIdButton = (
    <button
      type="button"
      className="mt-1 flex max-w-full items-center gap-1 rounded-sm text-[11px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      onClick={() => onCopyRecordId(currentRowId)}
    >
      <span className="truncate">{currentRowId}</span>
      <Copy className="h-3 w-3 shrink-0" />
    </button>
  )

  const metadataRows = metadataFields.map((field) => {
    const fieldWritable = editable && isEidosFileFieldWritable(field)
    return (
      <div
        key={field.tableColumnName}
        className={cn(
          "eidos-file-record-field grid",
          variant === "page"
            ? "gap-x-8 gap-y-1.5 py-2 sm:grid-cols-[minmax(140px,180px)_minmax(0,1fr)] sm:items-start"
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
        <div className="h-11 shrink-0 border-b bg-background/95">
          <div className="mx-auto flex h-full w-full max-w-[1040px] items-center justify-end gap-2 px-5 sm:px-8">
            {saveStatus}
            {onClose ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                aria-label={t("Close record details")}
                disabled={savingField !== null}
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <header className="flex min-h-14 items-start gap-2 border-b px-4 py-3">
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
            {recordIdButton}
          </div>
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
          {onClose ? (
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
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-color:var(--border)_transparent] [scrollbar-gutter:stable] [scrollbar-width:thin]"
          data-eidos-file-record-page-scroll=""
        >
          <article className="mx-auto w-full max-w-[960px] px-5 pb-20 sm:px-8 lg:px-12">
            <header className="pb-9 pt-10 sm:pt-12">
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
                  className="min-w-0 break-words text-[2rem] font-semibold leading-[1.2] tracking-tight sm:text-[2.25rem]"
                  data-eidos-file-record-title=""
                >
                  {title}
                </h2>
              )}
              {recordIdButton}
            </header>
            {metadataRows.length > 0 ? (
              <div
                className="grid gap-0.5 border-t border-border/70 pt-5"
                data-eidos-file-record-properties=""
              >
                {metadataRows}
              </div>
            ) : null}
            {contentField ? (
              <div className="mt-9 max-w-[760px] border-t border-border/70 pt-6">
                <MarkdownContentEditor
                  key={`${currentRowId}:${contentField.id}`}
                  value={contentValue}
                  label={eidosFileFieldDisplayName(contentField)}
                  editable={editable}
                  disabled={editorDisabled}
                  onSave={(value) => editField(contentField, value)}
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
