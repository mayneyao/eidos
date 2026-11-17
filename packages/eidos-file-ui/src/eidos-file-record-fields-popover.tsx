import { useRef, useState, type ReactNode } from "react"
import type {
  EidosFileFieldInfo,
  EidosFileSnapshot,
} from "@eidos.space/eidos-file"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  ArrowLeft,
  ChevronRight,
  EyeOff,
  GripVertical,
  Plus,
  Trash2,
} from "lucide-react"
import { useEidosFileUI } from "./context"
import type { RecordFieldManagement } from "./eidos-file-record-field-context"
import { useEidosFileFieldPropertyControls } from "./eidos-file-field-property-panel"
import {
  eidosFileFieldTypeIcon,
  EIDOS_FILE_FIELD_TYPE_OPTIONS,
} from "./eidos-file-field-type-picker"
import { EidosFileFieldCreatePopover } from "./eidos-file-field-create-popover"
import { EidosFileFieldDeleteDialog } from "./eidos-file-field-delete-dialog"
import {
  EidosFileFormulaEditorPopover,
  EidosFileLookupEditorPopover,
} from "./eidos-file-derived-field-editor"
import {
  eidosFileFieldDisplayName,
  isEidosFileRecordLabelField,
} from "./eidos-file-field-visibility"
import { Button, Popover, PopoverAnchor, PopoverContent } from "./ui/primitives"
import { SortableContainer } from "./ui/sortable"
import { useEidosFilePendingEdit } from "./use-pending-edit"

export interface RecordFieldMenuState {
  anchor: HTMLElement | null
  fieldId: string | null
}

function SortableRecordProperty({
  id,
  disabled,
  label,
  children,
}: {
  id: string
  disabled: boolean
  label: string
  children: ReactNode
}) {
  const sortable = useSortable({ id, disabled })
  return (
    <div
      ref={sortable.setNodeRef}
      className="group/record-property relative min-w-0 pl-5"
      style={{
        transform: CSS.Transform.toString(
          sortable.transform ? { ...sortable.transform, x: 0 } : null
        ),
        transition: sortable.transition,
      }}
    >
      <button
        type="button"
        ref={sortable.setActivatorNodeRef}
        disabled={disabled}
        aria-label={label}
        className="absolute left-0 top-1.5 z-10 flex h-6 w-5 cursor-grab items-center justify-center rounded-sm text-muted-foreground opacity-0 outline-hidden hover:bg-accent focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-ring group-hover/record-property:opacity-100 group-focus-within/record-property:opacity-100 disabled:cursor-default disabled:opacity-0 [@media(hover:none)]:opacity-100"
        {...sortable.attributes}
        {...sortable.listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      {children}
    </div>
  )
}

export function EidosFileRecordPropertyList({
  rows,
  disabled,
  onReorder,
}: {
  rows: { id: string; label: string; content: ReactNode }[]
  disabled: boolean
  onReorder: (ids: string[]) => void
}) {
  const { translate: t } = useEidosFileUI()
  const [dragging, setDragging] = useState(false)
  useEidosFilePendingEdit(dragging)
  return (
    <SortableContainer
      items={rows}
      disabled={disabled}
      optimistic={false}
      onDragStateChange={setDragging}
      onReorder={(next) => onReorder(next.map((item) => item.id))}
      renderItem={(item) => (
        <SortableRecordProperty
          id={item.id}
          label={t("Reorder {field}", { field: item.label })}
          disabled={disabled}
        >
          {item.content}
        </SortableRecordProperty>
      )}
    />
  )
}

function FieldMenuControls({
  field,
  management,
  disabled,
  onUpdate,
  onHide,
  onDelete,
  onDerived,
}: {
  field: EidosFileFieldInfo
  management: RecordFieldManagement
  disabled: boolean
  onUpdate: Parameters<typeof useEidosFileFieldPropertyControls>[0]["onUpdate"]
  onHide: () => void
  onDelete: () => void
  onDerived: (kind: "formula" | "lookup") => void
}) {
  const { translate: t } = useEidosFileUI()
  const [step, setStep] = useState<"menu" | "type" | "settings">("menu")
  const FieldTypeIcon = eidosFileFieldTypeIcon(field.type)
  const controls = useEidosFileFieldPropertyControls({
    field,
    tables: management.tables ?? [management.table],
    disabled,
    onUpdate,
    onEditFormula: () => onDerived("formula"),
    onEditLookup: () => onDerived("lookup"),
  })
  return (
    <div className="grid gap-2 p-2">
      {step !== "menu" ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 justify-start gap-1 text-xs"
          disabled={controls.busy}
          onClick={() => setStep("menu")}
        >
          <ArrowLeft className="h-3 w-3" />
          {field.name}
        </Button>
      ) : null}
      {step === "menu" ? (
        <>
          {controls.nameControl}
          <p className="px-1 text-[11px] leading-4 text-muted-foreground">
            {t("Field changes affect every record in this table.")}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 justify-between text-xs"
            disabled={controls.busy}
            onClick={() => setStep("type")}
          >
            {t("Type")}
            <span className="flex items-center gap-1 text-muted-foreground">
              {FieldTypeIcon ? <FieldTypeIcon className="h-3.5 w-3.5" /> : null}
              {t(
                EIDOS_FILE_FIELD_TYPE_OPTIONS.find(
                  (option) => option.value === field.type
                )?.label ?? field.type
              )}
              <ChevronRight className="h-3 w-3" />
            </span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 justify-between text-xs"
            disabled={controls.busy}
            onClick={() => setStep("settings")}
          >
            {t("Edit property")}
            <ChevronRight className="h-3 w-3" />
          </Button>
          {!isEidosFileRecordLabelField(field) ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 justify-start gap-2 text-xs"
              disabled={controls.busy}
              onClick={onHide}
            >
              <EyeOff className="h-3.5 w-3.5" />
              {t("Hide in records on this device")}
            </Button>
          ) : null}
          {!controls.isRecordLabel ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 justify-start gap-2 text-xs text-destructive hover:text-destructive"
              disabled={controls.busy}
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("Delete field from table")}
            </Button>
          ) : null}
        </>
      ) : step === "type" ? (
        controls.typeControl
      ) : (
        <>
          {controls.optionsControl}
          {controls.settingsControl}
        </>
      )}
      {controls.error ? (
        <p role="alert" className="text-xs text-destructive">
          {controls.error}
        </p>
      ) : null}
    </div>
  )
}

/** Anchored to the selected property name or the inline New field action. */
export function EidosFileRecordFieldMenu({
  management,
  fields,
  schemaLocked,
  state,
  onStateChange,
  onHide,
}: {
  management?: RecordFieldManagement
  fields: EidosFileFieldInfo[]
  schemaLocked: boolean
  state: RecordFieldMenuState
  onStateChange: (next: RecordFieldMenuState) => void
  onHide: (id: string) => void
}) {
  const { translate: t } = useEidosFileUI()
  const [busy, setBusy] = useState(false)
  const locked = useRef(false)
  const lastAnchor = useRef<HTMLElement | null>(null)
  const recordRoot = useRef<HTMLElement | null>(null)
  if (state.anchor) {
    lastAnchor.current = state.anchor
    recordRoot.current = state.anchor.closest<HTMLElement>(
      '[data-eidos-file-detail-panel="record"]'
    )
  }
  const [derived, setDerived] = useState<"formula" | "lookup" | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<EidosFileFieldInfo | null>(
    null
  )
  const [error, setError] = useState<string | null>(null)
  useEidosFilePendingEdit(Boolean(state.anchor) || busy)
  const selected = fields.find(
    (field) =>
      field.id === state.fieldId &&
      field.systemRole == null &&
      field.valueKind !== "system"
  )
  const canAlter = Boolean(
    management &&
    !management.disabled &&
    !schemaLocked &&
    (
      management.table.table.settings?.capabilities as
        | { alterSchema?: boolean }
        | undefined
    )?.alterSchema !== false
  )
  const close = () => {
    if (locked.current || deleteTarget) return
    onStateChange({ anchor: null, fieldId: null })
    setDerived(null)
    setError(null)
  }
  const mutate = async (operation: () => Promise<EidosFileSnapshot>) => {
    if (!management || !canAlter || locked.current)
      throw new Error(t("Field changes are unavailable"))
    locked.current = true
    setBusy(true)
    try {
      management.onSnapshot?.(await operation())
    } finally {
      locked.current = false
      setBusy(false)
    }
  }
  return (
    <>
      <Popover
        modal
        open={Boolean(state.anchor)}
        onOpenChange={(open) => {
          if (!open) close()
        }}
      >
        <PopoverAnchor virtualRef={lastAnchor} />
        <PopoverContent
          align="start"
          side="bottom"
          className="w-72 max-w-[calc(100vw-24px)] overflow-y-auto p-0 max-h-[70vh]"
          onEscapeKeyDown={(event) => {
            if (busy || deleteTarget) event.preventDefault()
          }}
          onInteractOutside={(event) => {
            if (busy || deleteTarget) event.preventDefault()
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            if (lastAnchor.current?.isConnected) lastAnchor.current.focus()
            else
              recordRoot.current
                ?.querySelector<HTMLElement>(
                  "[data-eidos-file-record-properties-toggle]"
                )
                ?.focus()
          }}
        >
          {management && state.anchor ? (
            selected ? (
              derived ? (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="m-1 h-7 gap-1 text-xs"
                    disabled={busy}
                    onClick={() => setDerived(null)}
                  >
                    <ArrowLeft className="h-3 w-3" />
                    {selected.name}
                  </Button>
                  {derived === "formula" ? (
                    <EidosFileFormulaEditorPopover
                      embedded
                      open
                      field={selected}
                      fields={fields}
                      onOpenChange={(open) => {
                        if (!open) setDerived(null)
                      }}
                      onPreview={
                        management.source.previewFormula
                          ? (input) =>
                              management.source.previewFormula!(
                                management.table.table.id,
                                input
                              )
                          : undefined
                      }
                      onSave={(property) =>
                        mutate(() =>
                          management.source.updateField(
                            management.table.table.id,
                            selected.id,
                            { property }
                          )
                        )
                      }
                    />
                  ) : (
                    <EidosFileLookupEditorPopover
                      embedded
                      open
                      field={selected}
                      fields={fields}
                      tables={[...(management.tables ?? [management.table])]}
                      onOpenChange={(open) => {
                        if (!open) setDerived(null)
                      }}
                      onSave={(property) =>
                        mutate(() =>
                          management.source.updateField(
                            management.table.table.id,
                            selected.id,
                            { property }
                          )
                        )
                      }
                    />
                  )}
                </>
              ) : (
                <FieldMenuControls
                  key={selected.id}
                  field={selected}
                  management={management}
                  disabled={!canAlter || busy}
                  onUpdate={(field, changes) =>
                    mutate(() =>
                      management.source.updateField(
                        management.table.table.id,
                        field.id,
                        changes
                      )
                    )
                  }
                  onHide={() => {
                    onHide(selected.id)
                    close()
                  }}
                  onDelete={() => setDeleteTarget(selected)}
                  onDerived={setDerived}
                />
              )
            ) : (
              <EidosFileFieldCreatePopover
                embedded
                open
                table={management.table}
                tables={[...(management.tables ?? [management.table])]}
                disabled={!canAlter || busy}
                description={t(
                  "Field changes affect every record in this table."
                )}
                onOpenChange={(open) => {
                  if (!open) close()
                }}
                onCreate={(input) =>
                  mutate(() =>
                    management.source.addField(management.table.table.id, input)
                  )
                }
                onPreviewFormula={
                  management.source.previewFormula
                    ? (input) =>
                        management.source.previewFormula!(
                          management.table.table.id,
                          input
                        )
                    : undefined
                }
              />
            )
          ) : null}
          {error ? (
            <p role="alert" className="p-2 text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </PopoverContent>
      </Popover>
      <EidosFileFieldDeleteDialog
        field={deleteTarget}
        disabled={!canAlter || busy}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        onDelete={async (field) => {
          if (!management) return
          await mutate(() =>
            management.source.deleteField(management.table.table.id, field.id)
          )
          setDeleteTarget(null)
          onStateChange({ anchor: null, fieldId: null })
          setDerived(null)
        }}
        onError={(cause) =>
          setError(cause instanceof Error ? cause.message : String(cause))
        }
      />
    </>
  )
}

export function EidosFileRecordPropertiesFooter({
  hiddenFields,
  preferencesLocked,
  schemaLocked,
  canCreate,
  onCreate,
  onRestore,
  hideSystemFields,
  systemCount,
  peekSystemFields,
  onPeek,
}: {
  hiddenFields: EidosFileFieldInfo[]
  preferencesLocked: boolean
  schemaLocked: boolean
  canCreate: boolean
  onCreate: (anchor: HTMLElement) => void
  onRestore: (id: string) => void
  hideSystemFields: boolean
  systemCount: number
  peekSystemFields: boolean
  onPeek: () => void
}) {
  const { translate: t } = useEidosFileUI()
  return (
    <div className="grid gap-1 px-5 py-2" data-eidos-record-properties-footer>
      {canCreate ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 justify-start gap-1.5 px-0 text-xs text-muted-foreground"
          disabled={schemaLocked}
          onClick={(event) => onCreate(event.currentTarget)}
        >
          <Plus className="h-3.5 w-3.5" />
          {t("New field")}
        </Button>
      ) : null}
      {hiddenFields.length ? (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer py-1">
            {t("Hidden properties on this device ({count})", {
              count: hiddenFields.length,
            })}
          </summary>
          <div className="grid gap-0.5 py-1">
            {hiddenFields.map((field) => (
              <Button
                key={field.id}
                variant="ghost"
                size="sm"
                className="h-7 justify-start text-xs"
                disabled={preferencesLocked}
                onClick={() => onRestore(field.id)}
              >
                {t("Show {field}", { field: eidosFileFieldDisplayName(field) })}
              </Button>
            ))}
          </div>
        </details>
      ) : null}
      {hideSystemFields && systemCount ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 justify-start px-0 text-xs text-muted-foreground"
          disabled={preferencesLocked}
          onClick={onPeek}
        >
          {peekSystemFields
            ? t("Hide system fields")
            : t("Show system fields temporarily ({count})", {
                count: systemCount,
              })}
        </Button>
      ) : null}
    </div>
  )
}
