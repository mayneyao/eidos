import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react"
import type {
  EidosFileFieldInfo,
  EidosFileRow,
  EidosFileRowMutationResult,
  EidosFileRelationValue,
  EidosFileSqlPrimitive,
  FileEntry,
  UpdateEidosFileFieldInput,
} from "@eidos.space/eidos-file"
import {
  decodeEidosFileValues,
  decodeEidosFileMultiSelectValues,
} from "@eidos.space/eidos-file"
import {
  Check,
  Copy,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  LoaderCircle,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  X,
} from "lucide-react"

import { useEidosFileUI } from "./context"
import {
  useRecordFieldManagement,
  type RecordFieldManagement,
} from "./eidos-file-record-field-context"
import { useRecordPropertyPreferences } from "./eidos-file-record-preferences"
import {
  EidosFileRecordFieldMenu,
  EidosFileRecordPropertyList,
  EidosFileRecordPropertyLabel,
  EidosFileRecordPropertiesFooter,
  type RecordFieldMenuState,
} from "./eidos-file-record-fields-popover"
import {
  eidosFileNewRecordDateDefaults,
  useEidosFileCreationContext,
} from "./eidos-file-temporal-defaults"
import { useEidosFilePendingEdit } from "./use-pending-edit"
import { useMobileBack } from "./mobile-back"
import { EidosFileMobileCellEditor } from "./eidos-file-mobile-cell-editor"
import { EidosFileEntrySurface } from "./eidos-file-entry-surface"
import { cn } from "./lib/cn"
import { Button, ScrollArea } from "./ui/primitives"

import { EidosFileRecordFieldEditor } from "./eidos-file-record-field-editor"
import { EidosFileRecordPropertyEditor } from "./eidos-file-record-property-editor"
import {
  eidosFileFieldDisplayName,
  eidosFileViewVisibleSystemFields,
  isEidosFileFieldWritable,
  isEidosFileRecordLabelField,
  orderedEidosFileViewFields,
  visibleEidosFileFields,
} from "./eidos-file-field-visibility"
import {
  eidosFileRecordFieldText,
  eidosFileRecordTitle,
} from "./eidos-file-record-format"
import { eidosFileUrlIsActivatable } from "./eidos-file-url-activation"
import { useEidosFileAutosizedText } from "./eidos-file-text-height"
import { EidosFileMarkdownPreview } from "./eidos-file-markdown-preview"
import { eidosFileFieldTypeIcon } from "./eidos-file-field-type-picker"
import { eidosFileSelectOptions } from "./eidos-file-field-properties"
import { SelectOptionItem } from "./ui/select-option-item"

function RecordChoiceValue({
  field,
  value,
}: {
  field: EidosFileFieldInfo
  value: EidosFileRow[string] | undefined
}) {
  const { translate: t } = useEidosFileUI()
  const options = eidosFileSelectOptions(field)
  const values =
    field.type === "select"
      ? typeof value === "string" && value
        ? [value]
        : []
      : decodeEidosFileMultiSelectValues(
          typeof value === "string" ? value : null
        )
  if (values.length === 0)
    return <span className="text-sm text-muted-foreground">{t("Empty")}</span>
  return (
    <span className="flex flex-wrap gap-1.5">
      {values.map((value) => (
        <SelectOptionItem
          key={value}
          className="text-sm"
          option={
            options.find((option) => option.value === value) ?? {
              name: value,
              color: "default",
            }
          }
        />
      ))}
    </span>
  )
}

function MobileRecordValue({
  field,
  row,
}: {
  field: EidosFileFieldInfo
  row: EidosFileRow
}) {
  const { translate: t, timeZone, calendarTimeZoneData } = useEidosFileUI()
  const value = row[field.tableColumnName]
  if (value === null || value === undefined || value === "")
    return <span className="text-muted-foreground">{t("Empty")}</span>
  if (field.type === "select" || field.type === "multi-select")
    return <RecordChoiceValue field={field} value={value} />
  if (field.type === "checkbox")
    return (
      <span
        role="img"
        aria-label={t(
          value === true || value === 1 || value === "1"
            ? "Checked"
            : "Unchecked"
        )}
        className="inline-flex h-5 w-5 items-center justify-center rounded border border-input"
      >
        {value === true || value === 1 || value === "1" ? (
          <Check className="h-4 w-4" />
        ) : null}
      </span>
    )
  return (
    <span className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">
      {eidosFileRecordFieldText(row, field, timeZone, calendarTimeZoneData)}
    </span>
  )
}

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
          ? "text-sm leading-5 text-muted-foreground"
          : "whitespace-pre-wrap break-words text-sm leading-5",
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

function CopyableFieldValue({
  field,
  row,
  onError,
}: {
  field: EidosFileFieldInfo
  row: EidosFileRow
  onError?: (error: unknown) => void
}) {
  const { timeZone, translate: t, calendarTimeZoneData } = useEidosFileUI()
  const [copied, setCopied] = useState(false)
  const value = row[field.tableColumnName]
  const inlineFileActions =
    field.type === "file" && decodeEidosFileValues(value).length > 0
  const text = eidosFileRecordFieldText(
    row,
    field,
    timeZone,
    calendarTimeZoneData
  )
  useEffect(() => {
    setCopied(false)
  }, [text, row._id])
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])
  const copyAction =
    value !== null && value !== undefined && value !== "" ? (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn(
          "text-muted-foreground",
          inlineFileActions
            ? "h-7 w-7 shrink-0"
            : "absolute right-0 -top-0.5 h-6 w-6 opacity-0 group-hover/readonly:opacity-100 group-focus-within/readonly:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
        )}
        aria-label={t("Copy {field}", {
          field: eidosFileFieldDisplayName(field),
        })}
        title={copied ? t("Copied") : t("Copy")}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text)
            setCopied(true)
          } catch (error) {
            onError?.(error)
          }
        }}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
        <span className="sr-only" role="status">
          {copied ? t("Copied") : ""}
        </span>
      </Button>
    ) : null
  return (
    <div
      className={cn(
        "relative min-h-[34px] min-w-0 px-2 py-[7px]",
        !inlineFileActions && "flex flex-col justify-center pr-8"
      )}
    >
      <FieldValue
        field={field}
        row={row}
        onError={onError}
        fileActions={inlineFileActions ? copyAction : undefined}
      />
      {!inlineFileActions ? copyAction : null}
    </div>
  )
}

function FieldValue({
  field,
  row,
  onError,
  fileActions,
}: {
  field: EidosFileFieldInfo
  row: EidosFileRow
  onError?: (error: unknown) => void
  fileActions?: ReactNode
}) {
  const {
    activateUrl,
    timeZone,
    translate: t,
    calendarTimeZoneData,
  } = useEidosFileUI()
  const value = row[field.tableColumnName]
  if (field.type === "select" || field.type === "multi-select")
    return <RecordChoiceValue field={field} value={value} />
  if (field.type === "checkbox") {
    if (value === null || value === undefined) {
      return <span className="text-sm text-muted-foreground">{t("Empty")}</span>
    }
    const checked = value === true || value === 1 || value === "1"
    return (
      <span className="flex items-center gap-1.5 text-sm">
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
      return <span className="text-sm text-muted-foreground">{t("Empty")}</span>
    }
    return (
      <div className="grid gap-1">
        {entries.map((entry, index) => (
          <EidosFileEntrySurface
            key={entry.id}
            entry={entry}
            compact
            trailingActions={index === 0 ? fileActions : undefined}
          />
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
  const display = eidosFileRecordFieldText(
    row,
    field,
    timeZone,
    calendarTimeZoneData
  )
  const empty = display === "Empty"
  return (
    <AutosizedRecordFieldText
      display={empty ? t("Empty") : display}
      empty={empty}
    />
  )
}

function MarkdownContentEditor({
  focusRequestToken,
  value,
  mode,
  editable,
  disabled,
  cacheKey,
  compact = false,
  onDraftChange,
  onEdit,
  onCancelEdit,
  onSave,
  onError,
}: {
  value: string
  focusRequestToken?: number
  mode: "preview" | "edit"
  editable: boolean
  disabled: boolean
  cacheKey: string
  /** Tighter layout for the side panel instead of the full content page. */
  compact?: boolean
  onDraftChange: (value: string) => void
  onEdit: () => void
  onCancelEdit: () => void
  onSave: () => Promise<void>
  onError?: (error: unknown) => void
}) {
  const { markdownEditingMode, translate: t } = useEidosFileUI()

  if (mode === "edit") {
    return (
      <div
        className={cn(
          "w-full",
          markdownEditingMode === "wysiwyg"
            ? compact
              ? "min-h-72"
              : ""
            : cn(
                "mx-auto flex min-h-0 max-w-[760px] flex-1 flex-col",
                compact && "min-h-72"
              )
        )}
        data-eidos-file-markdown-editor={markdownEditingMode ?? "source"}
        onKeyDownCapture={(event) => {
          if (event.key === "Escape" && markdownEditingMode !== "wysiwyg") {
            event.preventDefault()
            onCancelEdit()
          } else if (
            event.key.toLowerCase() === "s" &&
            (event.metaKey || event.ctrlKey) &&
            !event.altKey
          ) {
            event.preventDefault()
            void onSave()
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
            focusRequestToken={focusRequestToken}
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
      className={cn(
        "group relative mx-auto min-h-0 w-full max-w-[760px]",
        compact ? "pb-0" : "pb-20"
      )}
      data-eidos-file-markdown-editor="preview"
    >
      {value.trim() ? (
        <EidosFileMarkdownPreview
          markdown={value}
          onError={onError}
          onDoubleClick={() => {
            if (editable && !disabled) onEdit()
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
  /** Override the inherited editor boundary for a related record in another Table. */
  recordFieldManagement?: RecordFieldManagement
  row: EidosFileRow
  fields: EidosFileFieldInfo[]
  /** A new unsaved record whose absent keys are omitted create inputs, not unloaded projections. */
  isNewRecord?: boolean
  variant?: "panel" | "page"
  contentField?: EidosFileFieldInfo | null
  onClose?: () => void
  onPreviousRecord?: () => void | Promise<void>
  onNextRecord?: () => void | Promise<void>
  onOpenInTab?: (row: EidosFileRow) => void
  /** Switch between the side panel and the full content page. */
  onPresentationToggle?: () => void
  onFieldUpdate?: (
    field: EidosFileFieldInfo,
    changes: UpdateEidosFileFieldInput
  ) => void | Promise<void>
  /** @deprecated Record IDs are no longer shown in record inspectors. */
  onCopyRecordId?: (id: string) => void
  onCellEdit?: (
    row: EidosFileRow,
    field: EidosFileFieldInfo,
    value: EidosFileSqlPrimitive
  ) => Promise<EidosFileRowMutationResult>
  disabled?: boolean
  loading?: boolean
  /** Keep the last complete record mounted while its replacement loads. */
  preserveContentWhileLoading?: boolean
  loadError?: string | null
  onRetryLoad?: () => void
  onError?: (error: unknown) => void
  onImportFiles?: (options?: { imagesOnly?: boolean }) => Promise<FileEntry[]>
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
  recordFieldManagement,
  row,
  fields,
  isNewRecord = false,
  variant: requestedVariant = "panel",
  contentField,
  onClose,
  onPreviousRecord,
  onNextRecord,
  onOpenInTab,
  onPresentationToggle,
  onFieldUpdate,
  onCellEdit,
  disabled = false,
  loading = false,
  preserveContentWhileLoading = false,
  loadError,
  onRetryLoad,
  onError,
  onImportFiles,
  onImportDroppedFiles,
  onSearchRelation,
}: EidosFileRecordInspectorProps) {
  const {
    markdownEditingMode = "source",
    translate: t,
    interactionMode,
    recordPropertyScope,
    defaultHideSystemFieldsInRecords = false,
  } = useEidosFileUI()
  const inheritedFieldManagement = useRecordFieldManagement()
  const fieldManagement = recordFieldManagement ?? inheritedFieldManagement
  // View renderers can supply only visible fields. The full table is needed
  // for the temporary disclosure and to resolve the record title.
  const recordFields = fieldManagement?.table.fields ?? fields
  const variant = interactionMode === "mobile" ? "page" : requestedVariant
  const isMobile = interactionMode === "mobile"
  const tableId = fieldManagement?.table.table.id ?? fields[0]?.tableId ?? ""
  const view =
    fieldManagement?.view?.tableId === tableId
      ? fieldManagement.view
      : undefined
  const propertyScope = fields[0]?.tableId ?? ""
  const [recordPreferences, updateRecordPreferences] =
    useRecordPropertyPreferences(
      recordPropertyScope,
      tableId,
      fieldManagement?.source
    )
  const [fieldManager, setFieldManager] = useState<RecordFieldMenuState>({
    anchor: null,
    fieldId: null,
  })
  useEffect(() => {
    setFieldManager({ anchor: null, fieldId: null })
  }, [recordPropertyScope, tableId, view?.id])
  const creationContext = useEidosFileCreationContext()
  const defaultSession = `${propertyScope}:${String(row._id ?? "")}`
  const newRecordDefaults = useRef<{
    session: string
    values: EidosFileRow
    pending: string[]
  } | null>(null)
  if (!isNewRecord) newRecordDefaults.current = null
  else if (!loading && newRecordDefaults.current?.session !== defaultSession) {
    const values = eidosFileNewRecordDateDefaults(
      fields,
      row,
      new Date().toISOString(),
      creationContext
    )
    newRecordDefaults.current = {
      session: defaultSession,
      values,
      pending: Object.keys(values),
    }
  }
  const [revealedPropertiesFor, setRevealedPropertiesFor] = useState<
    string | null
  >(null)
  const collapseScope = JSON.stringify([recordPropertyScope, tableId])
  const [collapsedPropertiesFor, setCollapsedPropertiesFor] = useState<
    string | null
  >(null)
  const propertiesCollapsed = collapsedPropertiesFor === collapseScope
  const propertiesId = useId()
  const propertyRowsId = useId()
  const propertiesRef = useRef<HTMLDivElement>(null)
  const [expandedProperties, setExpandedProperties] = useState(false)
  const [mobileField, setMobileField] = useState<EidosFileFieldInfo | null>(
    null
  )
  const [currentRow, setCurrentRow] = useState(() => ({
    ...newRecordDefaults.current?.values,
    ...row,
  }))
  const [savingField, setSavingField] = useState<string | null>(null)
  const [failedEdit, setFailedEdit] = useState<FailedRecordEdit | null>(null)
  const failedEditRef = useRef<FailedRecordEdit | null>(null)
  const savingRef = useRef(false)
  const rowId = String(row._id ?? "")
  const sessionRowIdRef = useRef(rowId)
  const editGenerationRef = useRef(0)
  const latestRowRef = useRef(row)
  latestRowRef.current = row

  const updateFailedEdit = useCallback((next: FailedRecordEdit | null) => {
    failedEditRef.current = next
    setFailedEdit(next)
  }, [])

  useEffect(() => {
    if (sessionRowIdRef.current !== rowId) {
      editGenerationRef.current += 1
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
    const editGeneration = editGenerationRef.current
    const isCurrentEdit = () =>
      editGenerationRef.current === editGeneration &&
      String(latestRowRef.current._id ?? "") === editRowId
    savingRef.current = true
    setSavingField(field.tableColumnName)
    if (!retrying) updateFailedEdit(null)
    try {
      const result = await onCellEdit(previousRow, field, value)
      if (!isCurrentEdit()) return
      setCurrentRow(result.row)
      updateFailedEdit(null)
    } catch (error) {
      if (!isCurrentEdit()) return
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
      if (isCurrentEdit()) {
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

  // A new-record host owns an unsaved draft. Seed it through its normal edit
  // boundary, serially; failed writes use the same retained value on retry.
  useEffect(() => {
    if (
      !isNewRecord ||
      loading ||
      disabled ||
      !onCellEdit ||
      savingRef.current ||
      failedEditRef.current
    )
      return
    const defaults = newRecordDefaults.current
    if (!defaults || defaults.session !== defaultSession) return
    let key: string | undefined
    while ((key = defaults.pending.shift()) !== undefined) {
      if (Object.hasOwn(row, key)) continue
      const field = fields.find(
        (candidate) => candidate.tableColumnName === key
      )
      const value = defaults.values[key]
      if (field && typeof value === "string") {
        void editField(field, value)
        break
      }
    }
  })

  const discardFailedEdit = () => {
    if (savingRef.current) return
    updateFailedEdit(null)
    setCurrentRow(latestRowRef.current)
  }

  const editorDisabled =
    disabled || (isMobile && (loading || Boolean(loadError)))
  const propertyReadOnly =
    loading || Boolean(loadError) || savingField !== null || failedEdit !== null
  const recordNavigationDisabled =
    loading || Boolean(loadError) || savingField !== null || failedEdit !== null
  const editable = Boolean(onCellEdit) && !disabled
  const Root = variant === "page" ? "section" : "aside"
  const recordLabelField =
    recordFields.find(isEidosFileRecordLabelField) ?? null
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
  const visibleFieldIds = view
    ? new Set(
        visibleEidosFileFields(
          recordFields,
          view.hiddenFields,
          eidosFileViewVisibleSystemFields(view)
        ).map((field) => field.id)
      )
    : null
  const allMetadataFields = (
    view ? orderedEidosFileViewFields(recordFields, view) : recordFields
  ).filter(
    (field) =>
      (!field.isHidden || field.systemRole != null) &&
      (!defaultHideSystemFieldsInRecords ||
        (field.valueKind !== "system" && field.systemRole == null)) &&
      field.id !== contentField?.id &&
      (variant !== "page" || field.id !== pageTitleField?.id)
  )
  const hiddenFieldIds = new Set(
    visibleFieldIds
      ? allMetadataFields
          .filter((field) => !visibleFieldIds.has(field.id))
          .map((field) => field.id)
      : []
  )
  const hiddenPropertyScope = JSON.stringify([
    collapseScope,
    view?.id,
    currentRowId,
  ])
  const showHiddenProperties = revealedPropertiesFor === hiddenPropertyScope
  // A view layout update must preserve active editors and failed edits.
  const retainedPropertyIds = new Set(
    Array.from(
      propertiesRef.current?.querySelectorAll<HTMLElement>(
        "[data-eidos-record-property]"
      ) ?? []
    ).flatMap((node) =>
      (node.contains(document.activeElement) &&
        document.activeElement?.matches(
          "input, textarea, [contenteditable=true]"
        )) ||
      node.querySelector(
        '[aria-invalid="true"], [role="alert"], [data-eidos-file-property-editing="true"]'
      )
        ? [node.getAttribute("data-eidos-record-property")]
        : []
    )
  )
  const metadataFields = allMetadataFields.filter(
    (field) =>
      showHiddenProperties ||
      !hiddenFieldIds.has(field.id) ||
      retainedPropertyIds.has(field.id) ||
      savingField === field.tableColumnName ||
      failedEdit?.field.id === field.id
  )
  if (!view) {
    const fieldOrder = new Map(
      recordPreferences.fieldOrder.map((id, index) => [id, index])
    )
    metadataFields.sort(
      (a, b) =>
        (fieldOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
        (fieldOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER)
    )
  }
  const compactProperties = metadataFields
    .filter(
      (field) =>
        !hiddenFieldIds.has(field.id) &&
        field.valueKind !== "system" &&
        field.systemRole == null
    )
    .slice(0, 3)
  const primaryProperties = new Set(compactProperties.map((field) => field.id))
  const hiddenPropertyCount =
    allMetadataFields.length - hiddenFieldIds.size - primaryProperties.size
  useEffect(() => {
    setRevealedPropertiesFor(null)
  }, [hiddenPropertyScope])
  useEffect(() => {
    setExpandedProperties(false)
    setMobileField(null)
  }, [currentRowId])
  const contentValue = contentField
    ? typeof currentRow[contentField.tableColumnName] === "string"
      ? (currentRow[contentField.tableColumnName] as string)
      : String(currentRow[contentField.tableColumnName] ?? "")
    : ""
  const [contentMode, setContentMode] = useState<"preview" | "edit">("preview")
  const [contentDraft, setContentDraft] = useState(contentValue)
  useEidosFilePendingEdit(
    savingField !== null || failedEdit !== null || contentDraft !== contentValue
  )
  const [contentFocusToken, setContentFocusToken] = useState(0)
  const directWysiwygContent =
    variant === "page" &&
    markdownEditingMode === "wysiwyg" &&
    editable &&
    Boolean(contentField)
  const contentDisplayMode = directWysiwygContent ? "edit" : contentMode
  const contentEditorOwnsScroll =
    contentDisplayMode === "edit" && !directWysiwygContent
  const contentIdentity = `${currentRowId}:${contentField?.id ?? ""}`
  const contentIdentityRef = useRef(contentIdentity)
  const savedContentRef = useRef(contentValue)

  useEffect(() => {
    if (contentIdentityRef.current === contentIdentity) return
    contentIdentityRef.current = contentIdentity
    setContentFocusToken(0)
    setContentMode("preview")
    setContentDraft(contentValue)
  }, [contentIdentity, contentValue])

  useEffect(() => {
    const previousSaved = savedContentRef.current
    savedContentRef.current = contentValue
    setContentDraft((draft) =>
      contentMode === "preview" && !directWysiwygContent
        ? contentValue
        : draft === previousSaved
          ? contentValue
          : draft
    )
  }, [contentMode, contentValue, directWysiwygContent])

  const startContentEdit = () => {
    if (!contentField || editorDisabled || propertyReadOnly) return
    setContentDraft(contentValue)
    setContentMode("edit")
  }

  const cancelContentEdit = () => {
    setContentDraft(contentValue)
    setContentMode("preview")
  }

  const saveContent = async () => {
    if (!contentField || editorDisabled || propertyReadOnly) return false
    if (contentDraft !== contentValue) {
      await editField(contentField, contentDraft)
      if (failedEditRef.current) return false
    }
    return true
  }

  const saveContentAndPreview = async () => {
    if (!(await saveContent())) return false
    setContentMode("preview")
    return true
  }

  const closeRecord = async () => {
    if (!onClose) return
    if (interactionMode === "mobile") {
      if (document.activeElement instanceof HTMLElement)
        document.activeElement.blur()
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve())
      )
      if (savingRef.current || failedEditRef.current) return
    }
    if (contentDisplayMode === "edit" && contentDraft !== contentValue) {
      const saved = await saveContentAndPreview()
      if (!saved) return
    }
    onClose()
  }
  useMobileBack(onClose ? closeRecord : undefined)

  const togglePresentation = async () => {
    if (!onPresentationToggle) return
    if (contentDisplayMode === "edit" && contentDraft !== contentValue) {
      const saved = await saveContentAndPreview()
      if (!saved) return
    }
    onPresentationToggle()
  }

  const navigateRecord = async (
    navigate: (() => void | Promise<void>) | undefined
  ) => {
    if (!navigate) return
    if (contentDisplayMode === "edit") {
      const saved = await saveContentAndPreview()
      if (!saved) return
    }
    try {
      await navigate()
    } catch (error) {
      onError?.(error)
    }
  }

  const loadStatus =
    loading && preserveContentWhileLoading ? (
      <span
        role="status"
        aria-label={t("Loading record details…")}
        className="shrink-0 text-muted-foreground"
      >
        <LoaderCircle className="h-3 w-3 animate-spin motion-reduce:animate-none" />
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

  const fieldCreationLocked = disabled || propertyReadOnly
  // Adding a field preserves the existing Content field and its draft.
  const fieldEditingLocked =
    fieldCreationLocked || contentDraft !== contentValue
  const metadataRows = metadataFields
    .filter(
      (field) =>
        !isMobile ||
        expandedProperties ||
        primaryProperties.has(field.id) ||
        hiddenFieldIds.has(field.id)
    )
    .map((field) => {
      const fieldWritable = editable && isEidosFileFieldWritable(field)
      const hasFiles =
        field.type === "file" &&
        decodeEidosFileValues(currentRow[field.tableColumnName]).length > 0
      const FieldTypeIcon = eidosFileFieldTypeIcon(field.type)
      const canManageField =
        !isMobile &&
        Boolean(
          fieldManagement &&
          !fieldManagement.disabled &&
          !fieldEditingLocked &&
          field.systemRole == null &&
          field.valueKind !== "system" &&
          (
            fieldManagement.table.table.settings?.capabilities as
              | { alterSchema?: boolean }
              | undefined
          )?.alterSchema !== false
        )
      const label = eidosFileFieldDisplayName(field)
      const icon = FieldTypeIcon ? (
        <FieldTypeIcon
          aria-hidden="true"
          data-eidos-file-field-type-icon={field.type}
          className="h-4 w-4 shrink-0"
        />
      ) : null
      return (
        <div
          key={field.tableColumnName}
          data-eidos-record-property={field.id}
          data-eidos-record-system-role={field.systemRole ?? undefined}
          className={cn(
            "eidos-file-record-field group/readonly grid min-w-0",
            isMobile && "eidos-mobile-record-property",
            !isMobile &&
              (variant === "page"
                ? "grid-cols-[120px_minmax(0,1fr)] gap-y-1 py-0.5 sm:grid-cols-[160px_minmax(0,1fr)]"
                : "grid-cols-[120px_minmax(0,1fr)] gap-y-1 px-4 py-0.5 @min-[480px]/eidos-file-record-panel:grid-cols-[160px_minmax(0,1fr)]")
          )}
        >
          {isMobile ? (
            <p className="eidos-file-record-field-label flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
              {icon}
              <span className="truncate">{label}</span>
            </p>
          ) : (
            <EidosFileRecordPropertyLabel
              label={label}
              icon={icon}
              onManage={
                canManageField
                  ? (event) =>
                      setFieldManager({
                        anchor: event.currentTarget,
                        fieldId: field.id,
                      })
                  : undefined
              }
            />
          )}
          {isMobile ? (
            fieldWritable &&
            ["text", "number", "integer", "url", "checkbox", "rating"].includes(
              field.type
            ) ? (
              <EidosFileRecordFieldEditor
                field={field}
                row={currentRow}
                isNewRecord={isNewRecord && !loading}
                appearance="record-property"
                placeholder={t("Empty")}
                disabled={editorDisabled}
                readOnly={propertyReadOnly}
                onChange={(value) => editField(field, value)}
              />
            ) : fieldWritable ? (
              <button
                className="eidos-mobile-record-value min-h-11 min-w-0 w-full rounded text-left text-base focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                disabled={editorDisabled}
                aria-label={field.name}
                onClick={() => setMobileField(field)}
              >
                <MobileRecordValue field={field} row={currentRow} />
              </button>
            ) : (
              <div className="eidos-mobile-record-value min-w-0 text-base">
                <MobileRecordValue field={field} row={currentRow} />
              </div>
            )
          ) : fieldWritable && field.type === "file" ? (
            <div className="min-w-0">
              {hasFiles ? (
                <CopyableFieldValue
                  field={field}
                  row={currentRow}
                  onError={onError}
                />
              ) : null}
              <EidosFileRecordPropertyEditor
                field={field}
                row={currentRow}
                display={
                  hasFiles ? (
                    t("Edit files")
                  ) : (
                    <>
                      <Plus aria-hidden="true" />
                      {t("Add files")}
                    </>
                  )
                }
                disabled={editorDisabled}
                readOnly={propertyReadOnly}
                onChange={(value) => editField(field, value)}
                onImportFiles={onImportFiles}
                onImportDroppedFiles={onImportDroppedFiles}
                onError={onError}
              />
            </div>
          ) : fieldWritable && field.type === "relation" && onSearchRelation ? (
            <EidosFileRecordPropertyEditor
              row={currentRow}
              field={field}
              disabled={editorDisabled}
              readOnly={propertyReadOnly}
              onChange={(value) => editField(field, value)}
              onSearchRelation={onSearchRelation}
              onError={onError}
            />
          ) : fieldWritable &&
            field.valueKind === "source" &&
            field.type !== "file" &&
            field.type !== "relation" ? (
            <EidosFileRecordPropertyEditor
              field={field}
              row={currentRow}
              isNewRecord={isNewRecord && !loading}
              disabled={editorDisabled}
              readOnly={propertyReadOnly}
              onChange={(value) => editField(field, value)}
              onFieldUpdate={onFieldUpdate}
              onError={onError}
            />
          ) : (
            <CopyableFieldValue
              key={`${currentRow._id}:${field.tableColumnName}`}
              field={field}
              row={currentRow}
              onError={onError}
            />
          )}
        </div>
      )
    })

  const presentationLocked =
    propertyReadOnly ||
    Boolean(
      propertiesRef.current?.querySelector(
        '[aria-invalid="true"], [role="alert"], [data-eidos-file-property-editing="true"]'
      )
    )
  const canAlterSchema = Boolean(
    fieldManagement &&
    !fieldManagement.disabled &&
    (
      fieldManagement.table.table.settings?.capabilities as
        | { alterSchema?: boolean }
        | undefined
    )?.alterSchema !== false
  )
  const changeRecordPreferences = (
    edit: Parameters<typeof updateRecordPreferences>[0]
  ) => {
    if (presentationLocked) return
    try {
      updateRecordPreferences(edit)
    } catch (cause) {
      onError?.(cause)
    }
  }
  const propertiesList =
    isMobile || view ? (
      metadataRows
    ) : (
      <EidosFileRecordPropertyList
        disabled={presentationLocked || Boolean(fieldManager.anchor)}
        rows={metadataRows.map((content) => ({
          id: content.props["data-eidos-record-property"] as string,
          label: eidosFileFieldDisplayName(
            recordFields.find(
              (field) =>
                field.id === content.props["data-eidos-record-property"]
            )!
          ),
          content,
        }))}
        onReorder={(ids) =>
          changeRecordPreferences((current) => ({
            ...current,
            fieldOrder: [
              ...ids,
              ...current.fieldOrder.filter((id) => !ids.includes(id)),
            ],
          }))
        }
      />
    )
  const propertiesFooter = (
    <EidosFileRecordPropertiesFooter
      variant={variant}
      hiddenCount={hiddenFieldIds.size}
      expanded={showHiddenProperties}
      controlsId={propertyRowsId}
      preferencesLocked={presentationLocked || Boolean(fieldManager.anchor)}
      creationLocked={fieldCreationLocked}
      canCreate={!isMobile && canAlterSchema}
      onCreate={(anchor) => setFieldManager({ anchor, fieldId: null })}
      onToggleHidden={() => {
        if (presentationLocked) return
        const invalid = propertiesRef.current?.querySelector<HTMLElement>(
          '[aria-invalid="true"], [role="alert"], [data-eidos-file-property-editing="true"]'
        )
        if (showHiddenProperties && invalid) {
          invalid.focus()
          return
        }
        setRevealedPropertiesFor(
          showHiddenProperties ? null : hiddenPropertyScope
        )
      }}
    />
  )
  const propertyMenu = !isMobile ? (
    <EidosFileRecordFieldMenu
      management={fieldManagement}
      fields={recordFields}
      schemaLocked={
        fieldManager.fieldId === null ? fieldCreationLocked : fieldEditingLocked
      }
      state={fieldManager}
      onStateChange={setFieldManager}
    />
  ) : null
  const desktopPropertiesToggle = !isMobile && (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn(
        "h-[34px] justify-start justify-self-start gap-2 px-1.5 text-sm font-normal text-muted-foreground",
        variant === "panel" ? "ml-2.5" : "-ml-1.5"
      )}
      data-eidos-file-record-properties-toggle=""
      aria-expanded={!propertiesCollapsed}
      aria-controls={propertiesId}
      disabled={
        !propertiesCollapsed &&
        (presentationLocked || Boolean(fieldManager.anchor))
      }
      onClick={() =>
        setCollapsedPropertiesFor(propertiesCollapsed ? null : collapseScope)
      }
    >
      {propertiesCollapsed ? (
        <ChevronRight className="h-4 w-4" />
      ) : (
        <ChevronDown className="h-4 w-4" />
      )}
      {t("Properties")}
    </Button>
  )
  const emptyProperties =
    !isMobile && allMetadataFields.length === 0 ? (
      <p
        className={cn(
          "py-2 text-xs text-muted-foreground",
          variant === "panel" && "px-4"
        )}
      >
        {t("No visible properties")}
      </p>
    ) : null

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
      data-mobile-record={interactionMode === "mobile" ? "true" : undefined}
      aria-label={t("Record details for {title}", { title })}
      aria-busy={loading || savingField !== null ? "true" : undefined}
    >
      {mobileField && (
        <EidosFileMobileCellEditor
          field={mobileField}
          row={currentRow}
          onCreateOptions={
            onFieldUpdate && !editorDisabled
              ? async (options) => {
                  const property = {
                    ...mobileField.property,
                    options: options.map(
                      ({ value: _value, ...option }) => option
                    ),
                  }
                  await onFieldUpdate(mobileField, { property })
                }
              : undefined
          }
          onClose={() => setMobileField(null)}
          onSave={async (value) => {
            await editField(mobileField, value)
            if (failedEditRef.current)
              throw new Error(failedEditRef.current.message)
          }}
          onSearchRelation={onSearchRelation}
          onImportFiles={onImportFiles}
          onImportDroppedFiles={onImportDroppedFiles}
        />
      )}
      {isMobile ? (
        <header className="flex shrink-0 items-center gap-2 border-b px-3 py-1">
          {onClose ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("Close record details")}
              disabled={savingField !== null}
              onClick={() => void closeRecord()}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
          ) : null}
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
            {t("Record details")}
          </span>
          {loadStatus}
          {recordNavigationButtons}
        </header>
      ) : variant === "page" ? (
        <header className="shrink-0 bg-background">
          <div className="mx-auto w-full max-w-[960px] px-5 pt-8 sm:px-8 lg:px-12">
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
                      isNewRecord={isNewRecord && !loading}
                      placeholder={eidosFileFieldDisplayName(pageTitleField)}
                      appearance="record-title"
                      onEnter={() => {
                        if (!contentField || editorDisabled) return
                        if (contentDisplayMode !== "edit") startContentEdit()
                        setContentFocusToken((token) => token + 1)
                      }}
                      disabled={editorDisabled}
                      readOnly={propertyReadOnly}
                      onChange={(value) => editField(pageTitleField, value)}
                    />
                  </div>
                ) : (
                  <h2
                    ref={measuredTitle.ref}
                    className="line-clamp-1 min-w-0 break-words text-[40px] font-bold leading-tight tracking-tight"
                    style={{
                      height: "1lh",
                      minHeight: "1lh",
                      overflowY: "hidden",
                    }}
                    title={title}
                    data-eidos-file-record-title=""
                  >
                    {title}
                  </h2>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                {loadStatus}
                {recordNavigationButtons}
                {onPresentationToggle ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    aria-label={t("Open in side panel")}
                    title={t("Open in side panel")}
                    disabled={savingField !== null}
                    onClick={() => void togglePresentation()}
                  >
                    <Minimize2 className="h-3.5 w-3.5" />
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
              {loadStatus}
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
            {onPresentationToggle ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                aria-label={t("Open as full page")}
                title={t("Open as full page")}
                disabled={savingField !== null}
                onClick={() => void togglePresentation()}
              >
                <Maximize2 className="h-3.5 w-3.5" />
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
      {loadError && preserveContentWhileLoading ? (
        <div
          role="alert"
          className="flex shrink-0 items-center gap-2 border-b px-3 py-2 text-xs text-destructive"
        >
          <p className="min-w-0 flex-1 break-words">{loadError}</p>
          {onRetryLoad ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={onRetryLoad}
            >
              {t("Retry")}
            </Button>
          ) : null}
        </div>
      ) : null}
      {loading && !preserveContentWhileLoading ? (
        <div
          className="flex min-h-0 flex-1 items-center justify-center gap-2 text-xs text-muted-foreground"
          role="status"
        >
          <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />
          {t("Loading record details…")}
        </div>
      ) : loadError && !preserveContentWhileLoading ? (
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
            contentEditorOwnsScroll ? "overflow-hidden" : "overflow-y-auto"
          )}
          data-eidos-file-record-page-scroll=""
          data-markdown-selection-canvas={directWysiwygContent ? "" : undefined}
        >
          <article
            className={cn(
              "w-full px-5 pt-2 sm:px-8 lg:px-12",
              contentEditorOwnsScroll
                ? "flex h-full min-h-0 flex-col pb-3"
                : "pb-20"
            )}
          >
            {isMobile ? (
              <div
                className="eidos-mobile-record-heading"
                data-eidos-file-record-title=""
              >
                {pageTitleField && pageTitleWritable ? (
                  <h1>
                    <EidosFileRecordFieldEditor
                      field={pageTitleField}
                      row={currentRow}
                      isNewRecord={isNewRecord && !loading}
                      placeholder={t("Untitled")}
                      appearance="record-title"
                      disabled={editorDisabled}
                      readOnly={propertyReadOnly}
                      onChange={(value) => editField(pageTitleField, value)}
                    />
                  </h1>
                ) : (
                  <h1>{title}</h1>
                )}
              </div>
            ) : null}
            {allMetadataFields.length > 0 || !isMobile ? (
              <div
                className="mx-auto grid w-full max-w-[760px] gap-0 py-2"
                data-eidos-file-record-properties=""
                data-markdown-selection-ignore=""
              >
                {propertyMenu}
                {desktopPropertiesToggle}
                <div
                  ref={propertiesRef}
                  id={propertiesId}
                  hidden={propertiesCollapsed}
                >
                  <div id={propertyRowsId}>{propertiesList}</div>
                  {isMobile ? null : propertiesFooter}
                  {emptyProperties}
                </div>
                {isMobile && hiddenPropertyCount > 0 ? (
                  <button
                    type="button"
                    className="eidos-mobile-record-disclosure"
                    aria-expanded={expandedProperties}
                    onClick={() => setExpandedProperties((value) => !value)}
                  >
                    {expandedProperties
                      ? t("Collapse properties")
                      : t("Show all properties ({count})", {
                          count: metadataFields.length,
                        })}
                    <ChevronDown
                      className={cn(
                        "h-4 w-4",
                        expandedProperties && "rotate-180"
                      )}
                    />
                  </button>
                ) : null}
                {isMobile ? propertiesFooter : null}
              </div>
            ) : null}
            {contentField ? (
              <div
                className={cn(
                  "mx-auto mt-3 w-full max-w-none pt-3",
                  contentEditorOwnsScroll && "flex min-h-0 flex-1 flex-col"
                )}
                data-eidos-file-record-content=""
              >
                <MarkdownContentEditor
                  focusRequestToken={
                    contentIdentityRef.current === contentIdentity
                      ? contentFocusToken
                      : 0
                  }
                  key={`${currentRowId}:${contentField.id}`}
                  value={
                    contentDisplayMode === "edit" ? contentDraft : contentValue
                  }
                  mode={contentDisplayMode}
                  editable={editable}
                  disabled={disabled || loading || Boolean(loadError)}
                  cacheKey={`${currentRowId}:${contentField.id}`}
                  onDraftChange={setContentDraft}
                  onEdit={startContentEdit}
                  onCancelEdit={cancelContentEdit}
                  onSave={async () => {
                    await saveContent()
                  }}
                  onError={onError}
                />
              </div>
            ) : null}
          </article>
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          {propertyMenu}
          {desktopPropertiesToggle}
          <div
            ref={propertiesRef}
            id={propertiesId}
            hidden={propertiesCollapsed}
          >
            <div id={propertyRowsId}>{propertiesList}</div>
            {propertiesFooter}
            {emptyProperties}
          </div>
          {contentField ? (
            <div
              className="border-t px-4 py-3"
              data-eidos-file-record-content=""
            >
              <MarkdownContentEditor
                key={`${currentRowId}:${contentField.id}`}
                value={contentValue}
                mode="preview"
                editable={false}
                disabled={editorDisabled}
                cacheKey={`${currentRowId}:${contentField.id}`}
                compact
                onDraftChange={setContentDraft}
                onEdit={startContentEdit}
                onCancelEdit={cancelContentEdit}
                onSave={async () => {
                  await saveContentAndPreview()
                }}
                onError={onError}
              />
            </div>
          ) : null}
        </ScrollArea>
      )}
    </Root>
  )
}
