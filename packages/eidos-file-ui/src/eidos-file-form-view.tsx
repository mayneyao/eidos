import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react"
import {
  EIDOS_FILE_FORM_INPUT_FIELD_TYPES,
  eidosFileFormViewFields,
  eidosFileFormViewProperties,
  isEidosFileFormInputField,
  type EidosFileFieldInfo,
  type EidosFileFormInputFieldType,
  type EidosFileFormViewFieldProperties,
  type EidosFileFormViewProperties,
  type EidosFileRow,
  type EidosFileRowValue,
  type EidosFileViewInfo,
  type UpdateEidosFileViewInput,
} from "@eidos.space/eidos-file"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  CheckCircle2,
  Database,
  Eye,
  EyeOff,
  GripVertical,
  MoreHorizontal,
  Plus,
  Settings2,
  X,
} from "lucide-react"

import { useEidosFileUI } from "./context"
import type { EidosFileViewRendererProps } from "./eidos-file-editor-view"
import { EidosFileFieldTypeIcon } from "./eidos-file-field-type-picker"
import { EidosFileRecordAttachmentEditor } from "./eidos-file-record-attachment-editor"
import { EidosFileRecordFieldEditor } from "./eidos-file-record-field-editor"
import { cn } from "./lib/cn"
import { SortableContainer } from "./ui/sortable"
import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Switch,
  Textarea,
} from "./ui/primitives"

export type EidosFileFormEditorMode = "build" | "preview"
type FormInputField = EidosFileFieldInfo & {
  type: EidosFileFormInputFieldType
}

export function EidosFileFormModeToolbar({
  mode,
  disabled = false,
  onModeChange,
}: {
  mode: EidosFileFormEditorMode
  disabled?: boolean
  onModeChange: (mode: EidosFileFormEditorMode) => void
}) {
  const { translate: t } = useEidosFileUI()
  return (
    <div
      className="flex rounded-md border border-border/70 p-0.5"
      role="group"
      aria-label={t("Form editor mode")}
      data-eidos-file-form-mode-toolbar
    >
      <button
        type="button"
        className={cn(
          "flex h-7 items-center gap-1.5 rounded px-2.5 text-xs font-medium outline-hidden hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
          mode === "build" && "bg-accent"
        )}
        aria-pressed={mode === "build"}
        disabled={disabled}
        onClick={() => onModeChange("build")}
      >
        <Settings2 className="h-3.5 w-3.5" />
        {t("Build")}
      </button>
      <button
        type="button"
        className={cn(
          "flex h-7 items-center gap-1.5 rounded px-2.5 text-xs font-medium outline-hidden hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
          mode === "preview" && "bg-accent"
        )}
        aria-pressed={mode === "preview"}
        disabled={disabled}
        onClick={() => onModeChange("preview")}
      >
        <Eye className="h-3.5 w-3.5" />
        {t("Preview")}
      </button>
    </div>
  )
}

function isEmptyFormValue(value: EidosFileRow[string]): boolean {
  return (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim().length === 0)
  )
}

function withOptionalFieldText(
  field: EidosFileFormViewFieldProperties,
  key: "label" | "description" | "placeholder",
  value: string
): EidosFileFormViewFieldProperties {
  const normalized = value.trim()
  if ((field[key] ?? "") === normalized) return field
  const next = { ...field }
  if (normalized) next[key] = normalized
  else delete next[key]
  return next
}

function eidosFileFormOrderMap(
  view: Pick<EidosFileViewInfo, "orderMap">,
  fieldIds: readonly string[]
): Record<string, number> {
  const reordered = new Set(fieldIds)
  const orderMap = Object.fromEntries(
    Object.entries(view.orderMap ?? {}).filter(
      ([fieldId]) => !reordered.has(fieldId)
    )
  )
  fieldIds.forEach((fieldId, position) => {
    orderMap[fieldId] = position
  })
  return orderMap
}

function InlineFormText({
  value,
  placeholder,
  label,
  disabled,
  multiline = false,
  required = false,
  className,
  onCommit,
}: {
  value: string
  placeholder: string
  label: string
  disabled: boolean
  multiline?: boolean
  required?: boolean
  className?: string
  onCommit: (value: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (document.activeElement !== ref.current && ref.current) {
      ref.current.textContent = value
    }
  }, [value])

  const reset = () => {
    if (ref.current) ref.current.textContent = value
  }
  const commit = () => {
    const next = ref.current?.textContent?.trim() ?? ""
    if (required && !next) {
      reset()
      return
    }
    if (next !== value) onCommit(next)
  }
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault()
      reset()
      event.currentTarget.blur()
      return
    }
    if (event.key === "Enter" && !multiline) {
      event.preventDefault()
      event.currentTarget.blur()
    }
  }

  return (
    <div
      ref={ref}
      contentEditable={!disabled}
      suppressContentEditableWarning
      role="textbox"
      aria-label={label}
      aria-multiline={multiline}
      data-placeholder={placeholder}
      className={cn(
        "min-w-0 rounded-sm outline-hidden empty:before:pointer-events-none empty:before:text-muted-foreground/55 empty:before:content-[attr(data-placeholder)] focus-visible:ring-1 focus-visible:ring-ring",
        multiline && "whitespace-pre-wrap",
        disabled && "cursor-default",
        className
      )}
      onBlur={commit}
      onKeyDown={handleKeyDown}
    >
      {value}
    </div>
  )
}

function SortableFormBlock({
  field,
  selected,
  disabled,
  actions,
  children,
  onSelect,
}: {
  field: FormInputField
  selected: boolean
  disabled: boolean
  actions: ReactNode
  children: ReactNode
  onSelect: () => void
}) {
  const { translate: t } = useEidosFileUI()
  const sortable = useSortable({ id: field.id, disabled })
  return (
    <section
      ref={sortable.setNodeRef}
      data-eidos-file-form-block={field.id}
      className={cn(
        "group/form-block relative rounded-lg border bg-background px-5 py-5 outline-hidden transition-[border-color,box-shadow]",
        selected
          ? "border-primary/80 ring-1 ring-primary/25"
          : "border-border/70 hover:border-border"
      )}
      style={{
        opacity: sortable.isDragging ? 0.68 : 1,
        transform: CSS.Transform.toString(
          sortable.transform ? { ...sortable.transform, x: 0 } : null
        ),
        transition: sortable.transition,
      }}
      onClick={onSelect}
      onFocusCapture={onSelect}
    >
      <div
        className={cn(
          "absolute -left-9 top-3 opacity-0 transition-opacity group-hover/form-block:opacity-100 group-focus-within/form-block:opacity-100",
          selected && "opacity-100"
        )}
      >
        <button
          ref={sortable.setActivatorNodeRef}
          type="button"
          className="flex h-7 w-7 cursor-grab items-center justify-center rounded text-muted-foreground outline-hidden hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring active:cursor-grabbing disabled:cursor-default disabled:opacity-40"
          aria-label={t("Reorder {field}", { field: field.name })}
          disabled={disabled}
          {...sortable.attributes}
          {...sortable.listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </div>
      <div
        className={cn(
          "absolute right-3 top-3 opacity-0 transition-opacity group-hover/form-block:opacity-100 group-focus-within/form-block:opacity-100",
          selected && "opacity-100"
        )}
      >
        {actions}
      </div>
      {children}
    </section>
  )
}

function FormInsertMenu({
  hiddenFields,
  disabled,
  final,
  onShowField,
  onCreateField,
}: {
  hiddenFields: readonly FormInputField[]
  disabled: boolean
  final: boolean
  onShowField: (field: FormInputField) => void
  onCreateField: () => void
}) {
  const { translate: t } = useEidosFileUI()
  const [open, setOpen] = useState(false)
  const handingOffFocusRef = useRef(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "group/insert flex w-full items-center justify-center gap-2 text-muted-foreground outline-hidden disabled:opacity-40",
            final ? "h-14" : "h-8"
          )}
          aria-label={t("Add question")}
          disabled={disabled}
        >
          <span className="h-px flex-1 bg-border/0 transition-colors group-hover/insert:bg-border group-focus-visible/insert:bg-border" />
          <span
            className={cn(
              "flex items-center justify-center gap-1 rounded-full text-[11px] transition-colors group-hover/insert:bg-accent group-hover/insert:text-foreground group-focus-visible/insert:ring-1 group-focus-visible/insert:ring-ring",
              final
                ? "h-9 w-9 bg-muted/70 text-foreground"
                : "h-7 min-w-7 px-1.5 opacity-0 group-hover/insert:opacity-100 group-focus-visible/insert:opacity-100"
            )}
          >
            <Plus className="h-3.5 w-3.5" />
          </span>
          <span className="h-px flex-1 bg-border/0 transition-colors group-hover/insert:bg-border group-focus-visible/insert:bg-border" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        className="w-72 p-0"
        onCloseAutoFocus={(event) => {
          if (!handingOffFocusRef.current) return
          event.preventDefault()
          handingOffFocusRef.current = false
        }}
      >
        <div className="border-b px-3 py-2.5">
          <p className="text-xs font-semibold">{t("Add question")}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {t("Use an existing field or create a new table field.")}
          </p>
        </div>
        {hiddenFields.length > 0 ? (
          <div className="max-h-56 overflow-y-auto p-1.5">
            <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("Existing fields")}
            </p>
            {hiddenFields.map((field) => (
              <button
                key={field.id}
                type="button"
                className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-xs outline-hidden hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring"
                onClick={() => {
                  onShowField(field)
                  setOpen(false)
                }}
              >
                <EidosFileFieldTypeIcon
                  type={field.type}
                  className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                />
                <span className="min-w-0 flex-1 truncate">{field.name}</span>
                <span className="text-[10px] capitalize text-muted-foreground">
                  {t(field.type)}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="px-3 py-3 text-[11px] leading-4 text-muted-foreground">
            {t("All compatible table fields are already in this form.")}
          </p>
        )}
        <div className="border-t p-1.5">
          <button
            type="button"
            className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-xs font-medium outline-hidden hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-40"
            onClick={() => {
              handingOffFocusRef.current = true
              setOpen(false)
              onCreateField()
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            {t("Create table field…")}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function QuestionOptionsPopover({
  field,
  config,
  disabled,
  onSelect,
  onPlaceholderCommit,
  onMultilineChange,
  onRequiredChange,
  onFieldOpen,
  onHide,
}: {
  field: FormInputField
  config: EidosFileFormViewFieldProperties
  disabled: boolean
  onSelect: () => void
  onPlaceholderCommit: (value: string) => void
  onMultilineChange: (multiline: boolean) => void
  onRequiredChange: (required: boolean) => void
  onFieldOpen?: () => void
  onHide: () => void
}) {
  const { translate: t } = useEidosFileUI()
  const [open, setOpen] = useState(false)
  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (nextOpen) onSelect()
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-md bg-muted/70 text-muted-foreground outline-hidden hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
          aria-label={t("Question options for {field}", {
            field: config.label ?? field.name,
          })}
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="start" className="w-72 p-0">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold">
              {t("Question options")}
            </h3>
            <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
              {t("Linked table field: {field}", { field: field.name })}
            </p>
          </div>
          <button
            type="button"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground outline-hidden hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
            aria-label={t("Close")}
            onClick={() => setOpen(false)}
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="grid gap-4 p-4">
          <label className="flex min-h-8 items-center justify-between gap-3 text-xs font-medium">
            <span>{t("Required")}</span>
            <Switch
              aria-label={t("Require {field}", { field: field.name })}
              checked={config.required}
              disabled={disabled || field.nullable === false}
              onCheckedChange={onRequiredChange}
            />
          </label>
          <label className="grid gap-1.5 text-xs font-medium">
            <span>{t("Placeholder")}</span>
            <Input
              key={`${field.id}-${config.placeholder ?? ""}`}
              className="h-8 text-xs"
              defaultValue={config.placeholder ?? ""}
              disabled={disabled}
              onBlur={(event) => onPlaceholderCommit(event.currentTarget.value)}
            />
          </label>
          {field.type === "text" ? (
            <label className="flex min-h-8 items-center justify-between gap-3 text-xs font-medium">
              <span>{t("Long text")}</span>
              <Switch
                aria-label={t("Use long text for {field}", {
                  field: field.name,
                })}
                checked={config.multiline === true}
                disabled={disabled}
                onCheckedChange={onMultilineChange}
              />
            </label>
          ) : null}
        </div>
        <div className="border-t p-1.5">
          <div className="flex h-9 items-center gap-2 rounded px-2 text-xs">
            <EidosFileFieldTypeIcon
              type={field.type}
              className="h-4 w-4 text-muted-foreground"
            />
            <span className="min-w-0 flex-1">{t("Question type")}</span>
            <span className="capitalize text-muted-foreground">
              {t(field.type)}
            </span>
          </div>
          {onFieldOpen ? (
            <button
              type="button"
              className="flex h-9 w-full items-center gap-2 rounded px-2 text-left text-xs outline-hidden hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring"
              onClick={() => {
                setOpen(false)
                onFieldOpen()
              }}
            >
              <Database className="h-4 w-4 text-muted-foreground" />
              {t("Edit table field")}
            </button>
          ) : null}
          <button
            type="button"
            className="flex h-9 w-full items-center gap-2 rounded px-2 text-left text-xs text-muted-foreground outline-hidden hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
            disabled={disabled}
            onClick={() => {
              setOpen(false)
              onHide()
            }}
          >
            <EyeOff className="h-4 w-4" />
            {t("Hide from form")}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function EidosFileFormView(props: EidosFileViewRendererProps) {
  const { translate: t } = useEidosFileUI()
  const { source, table, view } = props
  const compatibleFields = useMemo(
    () => table.fields.filter(isEidosFileFormInputField),
    [table.fields]
  )
  const fields = useMemo(
    () => (view ? eidosFileFormViewFields(table, view) : []),
    [table, view]
  )
  const hiddenFields = useMemo(() => {
    const visible = new Set(fields.map((field) => field.id))
    return compatibleFields.filter((field) => !visible.has(field.id))
  }, [compatibleFields, fields])
  const properties = useMemo(
    () => (view ? eidosFileFormViewProperties(view, compatibleFields) : null),
    [compatibleFields, view]
  )
  const fieldProperties = useMemo(
    () =>
      new Map(properties?.fields.map((field) => [field.fieldId, field]) ?? []),
    [properties]
  )
  const canBuild = props.capabilities.mutate
  const mode: EidosFileFormEditorMode = canBuild
    ? props.state.formMode === "preview"
      ? "preview"
      : "build"
    : "preview"
  const [selection, setSelection] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const propertyDraftRef = useRef<EidosFileFormViewProperties | null>(
    properties
  )
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const [draft, setDraft] = useState<EidosFileRow>({})
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set())
  const settingsDisabled = props.disabled || !canBuild

  useEffect(() => {
    propertyDraftRef.current = properties
  }, [properties])

  useEffect(() => {
    if (selection === null || fields.some((field) => field.id === selection)) {
      return
    }
    setSelection(null)
  }, [fields, selection])

  useEffect(() => {
    setDraft({})
    setInvalidFields(new Set())
    setSubmitted(false)
    setError(null)
  }, [mode])

  if (!view || !properties) return null

  const saveView = (changes: UpdateEidosFileViewInput): Promise<void> => {
    if (settingsDisabled) return Promise.resolve()
    setSaveError(null)
    const operation = saveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const snapshot = await source.updateView(view.id, changes)
        props.onSnapshot?.(snapshot)
      })
    saveQueueRef.current = operation
    void operation.catch((cause) => {
      setSaveError(
        cause instanceof Error
          ? cause.message
          : t("Unable to save form settings.")
      )
      props.onError?.(cause)
    })
    return operation
  }

  const saveProperties = (
    changes: Partial<EidosFileFormViewProperties>
  ): Promise<void> => {
    const current = propertyDraftRef.current
    if (!current || settingsDisabled) return Promise.resolve()
    const next = { ...current, ...changes }
    propertyDraftRef.current = next
    return saveView({ properties: next })
  }

  const saveFieldProperties = (
    fieldId: string,
    update: (
      field: EidosFileFormViewFieldProperties
    ) => EidosFileFormViewFieldProperties
  ) => {
    const current = propertyDraftRef.current
    if (!current) return
    let changed = false
    const nextFields = current.fields.map((field) => {
      if (field.fieldId !== fieldId) return field
      const next = update(field)
      changed = changed || next !== field
      return next
    })
    if (changed) void saveProperties({ fields: nextFields })
  }

  const reorderFields = (next: FormInputField[]) =>
    saveView({
      orderMap: eidosFileFormOrderMap(
        view,
        next.map((field) => field.id)
      ),
    })

  const showField = (field: FormInputField, index: number) => {
    const nextIds = fields.map((candidate) => candidate.id)
    nextIds.splice(index, 0, field.id)
    setSelection(field.id)
    void saveView({
      hiddenFields: view.hiddenFields.filter((fieldId) => fieldId !== field.id),
      orderMap: eidosFileFormOrderMap(view, nextIds),
    })
  }

  const hideField = (field: FormInputField) => {
    setSelection(null)
    void saveView({
      hiddenFields: [...new Set([...view.hiddenFields, field.id])],
    })
  }

  const createField = (index: number) => {
    props.onFieldAdd?.(index, EIDOS_FILE_FORM_INPUT_FIELD_TYPES)
  }

  const updateDraft = async (
    fieldColumnName: string,
    value: EidosFileRowValue
  ) => {
    setDraft((current) => ({ ...current, [fieldColumnName]: value }))
    setSubmitted(false)
    setError(null)
    setInvalidFields((current) => {
      if (current.size === 0) return current
      const next = new Set(current)
      const field = fields.find(
        (candidate) => candidate.tableColumnName === fieldColumnName
      )
      if (field) next.delete(field.id)
      return next
    })
  }

  const submitPreview = () => {
    if (submitted) return
    const missing = new Set(
      fields
        .filter(
          (field) =>
            fieldProperties.get(field.id)?.required &&
            isEmptyFormValue(draft[field.tableColumnName])
        )
        .map((field) => field.id)
    )
    if (missing.size > 0) {
      setInvalidFields(missing)
      setError(t("Complete the required fields."))
      return
    }
    setError(null)
    setInvalidFields(new Set())
    setSubmitted(true)
  }

  const renderFieldControl = (
    field: FormInputField,
    config: EidosFileFormViewFieldProperties | undefined,
    disabled: boolean
  ) => {
    if (field.type === "text") {
      const value = draft[field.tableColumnName]
      const text = value === null || value === undefined ? "" : String(value)
      return config?.multiline === true ? (
        <Textarea
          value={text}
          rows={4}
          aria-label={field.name}
          placeholder={config?.placeholder}
          disabled={disabled}
          className="min-h-24 resize-y text-xs leading-5"
          onChange={(event) =>
            void updateDraft(field.tableColumnName, event.currentTarget.value)
          }
        />
      ) : (
        <Input
          type="text"
          value={text}
          aria-label={field.name}
          placeholder={config?.placeholder}
          disabled={disabled}
          className="h-9 text-xs"
          onChange={(event) =>
            void updateDraft(field.tableColumnName, event.currentTarget.value)
          }
        />
      )
    }
    return field.type === "file" ? (
      <EidosFileRecordAttachmentEditor
        value={draft[field.tableColumnName]}
        disabled={disabled || mode === "preview"}
        onChange={(value) => updateDraft(field.tableColumnName, value)}
        onError={props.onError}
      />
    ) : (
      <EidosFileRecordFieldEditor
        field={field}
        row={draft}
        placeholder={config?.placeholder}
        disabled={disabled}
        onChange={(value) => updateDraft(field.tableColumnName, value)}
      />
    )
  }

  return (
    <div className="h-full min-h-0 bg-background">
      <main
        className="h-full min-h-0 overflow-y-auto"
        aria-label={mode === "build" ? t("Form builder") : t("Form preview")}
      >
        <div className="mx-auto w-full max-w-3xl px-10 py-10 sm:px-16 sm:py-12">
          {saveError ? (
            <p
              className="mb-5 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
              role="alert"
            >
              {t("Not saved")}
            </p>
          ) : mode === "preview" ? (
            <p
              className="mb-5 flex items-center gap-2 text-xs text-muted-foreground"
              role="note"
            >
              <Eye className="h-3.5 w-3.5" />
              {t("Preview responses are not saved.")}
            </p>
          ) : null}
          {mode === "build" ? (
            <>
              <header
                className="mb-8 px-1 py-2"
                onClick={() => setSelection(null)}
                onFocusCapture={() => setSelection(null)}
              >
                <InlineFormText
                  value={properties.title}
                  placeholder={t("Untitled form")}
                  label={t("Form title")}
                  required
                  disabled={settingsDisabled}
                  className="text-3xl font-semibold tracking-tight"
                  onCommit={(title) => void saveProperties({ title })}
                />
                <InlineFormText
                  value={properties.description ?? ""}
                  placeholder={t("Add a description…")}
                  label={t("Form description")}
                  multiline
                  disabled={settingsDisabled}
                  className="mt-2 min-h-5 text-sm leading-6 text-muted-foreground"
                  onCommit={(description) =>
                    void saveProperties({ description: description || null })
                  }
                />
              </header>

              {fields.length > 0 ? (
                <SortableContainer
                  items={fields}
                  disabled={settingsDisabled}
                  onReorder={reorderFields}
                  className="grid"
                  renderItem={(field, index) => {
                    const config = fieldProperties.get(field.id) ?? {
                      fieldId: field.id,
                      required: field.nullable === false,
                    }
                    return (
                      <>
                        <SortableFormBlock
                          field={field}
                          selected={selection === field.id}
                          disabled={settingsDisabled}
                          onSelect={() => setSelection(field.id)}
                          actions={
                            <QuestionOptionsPopover
                              field={field}
                              config={config}
                              disabled={settingsDisabled}
                              onSelect={() => setSelection(field.id)}
                              onPlaceholderCommit={(placeholder) =>
                                saveFieldProperties(field.id, (current) =>
                                  withOptionalFieldText(
                                    current,
                                    "placeholder",
                                    placeholder
                                  )
                                )
                              }
                              onMultilineChange={(multiline) =>
                                saveFieldProperties(field.id, (current) => {
                                  const next = { ...current }
                                  if (multiline) next.multiline = true
                                  else delete next.multiline
                                  return next
                                })
                              }
                              onRequiredChange={(required) =>
                                saveFieldProperties(field.id, (current) => ({
                                  ...current,
                                  required,
                                }))
                              }
                              onFieldOpen={
                                props.onFieldOpen
                                  ? () => props.onFieldOpen?.(field)
                                  : undefined
                              }
                              onHide={() => hideField(field)}
                            />
                          }
                        >
                          <div className="mb-3 min-w-0 pr-8">
                            <div className="flex items-start gap-1">
                              <InlineFormText
                                value={config.label ?? field.name}
                                placeholder={field.name}
                                label={t("Question label for {field}", {
                                  field: field.name,
                                })}
                                required
                                disabled={settingsDisabled}
                                className="min-h-6 flex-1 text-base font-semibold leading-6"
                                onCommit={(label) =>
                                  saveFieldProperties(field.id, (current) =>
                                    withOptionalFieldText(
                                      current,
                                      "label",
                                      label
                                    )
                                  )
                                }
                              />
                              {config.required ? (
                                <span
                                  className="text-destructive"
                                  aria-label={t("Required")}
                                >
                                  *
                                </span>
                              ) : null}
                            </div>
                            <InlineFormText
                              value={config.description ?? ""}
                              placeholder={t("Add description…")}
                              label={t("Field description")}
                              multiline
                              disabled={settingsDisabled}
                              className="mt-1 min-h-4 text-xs leading-5 text-muted-foreground"
                              onCommit={(description) =>
                                saveFieldProperties(field.id, (current) =>
                                  withOptionalFieldText(
                                    current,
                                    "description",
                                    description
                                  )
                                )
                              }
                            />
                          </div>
                          <fieldset
                            disabled
                            className="pointer-events-none [&_*:disabled]:opacity-100"
                            aria-label={t("Field preview")}
                          >
                            {renderFieldControl(field, config, true)}
                          </fieldset>
                        </SortableFormBlock>
                        <FormInsertMenu
                          hiddenFields={hiddenFields}
                          disabled={settingsDisabled}
                          final={index === fields.length - 1}
                          onShowField={(candidate) =>
                            showField(candidate, index + 1)
                          }
                          onCreateField={() => createField(index + 1)}
                        />
                      </>
                    )
                  }}
                />
              ) : (
                <div className="border-y border-dashed py-8 text-center">
                  <p className="text-sm font-medium">
                    {t("Add your first question")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("Use an existing table field or create a new one.")}
                  </p>
                  <div className="mx-auto mt-3 max-w-72">
                    <FormInsertMenu
                      hiddenFields={hiddenFields}
                      disabled={settingsDisabled}
                      final
                      onShowField={(field) => showField(field, 0)}
                      onCreateField={() => createField(0)}
                    />
                  </div>
                </div>
              )}

              <div
                className="mt-3 border-t pt-5"
                onFocusCapture={() => setSelection(null)}
              >
                <div className="inline-flex min-h-8 min-w-24 items-center justify-center rounded-md bg-primary px-3 py-1.5 text-primary-foreground">
                  <InlineFormText
                    value={properties.submitLabel}
                    placeholder={t("Submit label")}
                    label={t("Submit label")}
                    required
                    disabled={settingsDisabled}
                    className="min-w-12 cursor-text text-center text-xs font-medium leading-5 focus-visible:ring-primary-foreground/70"
                    onCommit={(submitLabel) =>
                      void saveProperties({ submitLabel })
                    }
                  />
                </div>
              </div>

              <section
                className="mt-10 border-t pt-8"
                onFocusCapture={() => setSelection(null)}
              >
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t("After submission")}
                </p>
                <div className="mt-3 flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <InlineFormText
                    value={properties.successMessage}
                    placeholder={t("Success message")}
                    label={t("Success message")}
                    multiline
                    required
                    disabled={settingsDisabled}
                    className="min-h-5 flex-1 text-sm leading-5"
                    onCommit={(successMessage) =>
                      void saveProperties({ successMessage })
                    }
                  />
                </div>
              </section>
            </>
          ) : (
            <>
              <header className="mb-8 border-b pb-5">
                <h1 className="text-2xl font-semibold tracking-tight">
                  {properties.title}
                </h1>
                {properties.description ? (
                  <p className="mt-2 max-w-prose whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                    {properties.description}
                  </p>
                ) : null}
              </header>

              {fields.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("This form has no questions yet.")}
                </p>
              ) : (
                <form
                  className="grid gap-6"
                  onSubmit={(event) => {
                    event.preventDefault()
                    submitPreview()
                  }}
                >
                  <div className="grid gap-6">
                    {fields.map((field) => {
                      const config = fieldProperties.get(field.id)
                      const invalid = invalidFields.has(field.id)
                      return (
                        <div key={field.id} className="grid gap-1.5">
                          <label className="text-xs font-medium leading-5">
                            {config?.label ?? field.name}
                            {config?.required ? (
                              <span
                                className="ml-1 text-destructive"
                                aria-hidden
                              >
                                *
                              </span>
                            ) : null}
                          </label>
                          {config?.description ? (
                            <p className="text-[11px] leading-4 text-muted-foreground">
                              {config.description}
                            </p>
                          ) : null}
                          <div
                            className={cn(
                              "rounded-md",
                              invalid && "ring-1 ring-destructive"
                            )}
                          >
                            {renderFieldControl(field, config, submitted)}
                          </div>
                          {field.type === "file" ? (
                            <p className="text-[10px] text-muted-foreground">
                              {t(
                                "File upload is available on the published form."
                              )}
                            </p>
                          ) : null}
                          {invalid ? (
                            <p className="text-[11px] text-destructive">
                              {t("This field is required.")}
                            </p>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>

                  {error ? (
                    <p
                      className="text-xs leading-5 text-destructive"
                      role="alert"
                    >
                      {error}
                    </p>
                  ) : null}
                  {submitted ? (
                    <div
                      className="flex items-start gap-2 text-sm"
                      role="status"
                    >
                      <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" />
                      <div>
                        <p>{properties.successMessage}</p>
                        <button
                          type="button"
                          className="mt-1 text-xs text-muted-foreground underline-offset-4 hover:underline"
                          onClick={() => {
                            setDraft({})
                            setSubmitted(false)
                          }}
                        >
                          {t("Preview another response")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <Button type="submit" size="sm" className="w-fit min-w-24">
                      {properties.submitLabel}
                    </Button>
                  )}
                </form>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}
