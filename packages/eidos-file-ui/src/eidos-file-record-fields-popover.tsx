import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react"
import type {
  EidosFileFieldInfo,
  EidosFileFormulaPreviewInput,
  EidosFileSnapshot,
} from "@eidos.space/eidos-file"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  ChevronUp,
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
import { EidosFileLookupEditorPopover } from "./eidos-file-derived-field-editor"
import { EidosFileRecordFormulaDialog } from "./eidos-file-record-formula-dialog"
import { Button, Popover, PopoverAnchor, PopoverContent } from "./ui/primitives"
import { SortableContainer } from "./ui/sortable"
import { useEidosFilePendingEdit } from "./use-pending-edit"
import { cn } from "./lib/cn"

export interface RecordFieldMenuState {
  anchor: HTMLElement | null
  fieldId: string | null
  formula?: { initialName: string }
}

const RecordPropertyDragContext = createContext<ReturnType<
  typeof useSortable
> | null>(null)

function SortableRecordProperty({
  id,
  disabled,
  children,
}: {
  id: string
  disabled: boolean
  children: ReactNode
}) {
  const sortable = useSortable({ id, disabled })
  return (
    <div
      ref={sortable.setNodeRef}
      className="group/record-property relative min-w-0"
      style={{
        transform: CSS.Transform.toString(
          sortable.transform ? { ...sortable.transform, x: 0 } : null
        ),
        transition: sortable.transition,
      }}
    >
      <RecordPropertyDragContext.Provider value={sortable}>
        {children}
      </RecordPropertyDragContext.Provider>
    </div>
  )
}

export function EidosFileRecordPropertyLabel({
  label,
  icon,
  onManage,
}: {
  label: string
  icon: ReactNode
  onManage?: (event: MouseEvent<HTMLElement>) => void
}) {
  const { translate: t } = useEidosFileUI()
  const sortable = useContext(RecordPropertyDragContext)
  const draggable = Boolean(sortable?.listeners)
  return (
    <div
      data-eidos-file-record-property-label=""
      className={cn(
        "group/property-label -ml-1.5 mr-1.5 flex min-h-[34px] min-w-0 items-start gap-2 rounded-md pl-1.5 pr-2 text-sm leading-5 text-muted-foreground",
        (draggable || onManage) && "hover:bg-muted focus-within:bg-muted"
      )}
      onPointerDown={(event) => sortable?.listeners?.onPointerDown?.(event)}
      title={label}
    >
      {draggable ? (
        <button
          type="button"
          ref={sortable?.setActivatorNodeRef}
          aria-label={t("Reorder {field}", { field: label })}
          data-eidos-file-record-property-handle=""
          className="relative mt-[9px] flex h-4 w-4 shrink-0 cursor-grab items-center justify-center rounded-sm outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
          {...sortable?.attributes}
          onKeyDown={(event) => sortable?.listeners?.onKeyDown?.(event)}
          onClick={onManage}
        >
          <span className="flex group-hover/property-label:opacity-0 group-focus-within/property-label:opacity-0">
            {icon}
          </span>
          <GripVertical
            aria-hidden="true"
            className="absolute h-4 w-4 opacity-0 group-hover/property-label:opacity-100 group-focus-within/property-label:opacity-100"
          />
        </button>
      ) : (
        <span aria-hidden="true" className="mt-[9px] flex h-4 w-4 shrink-0">
          {icon}
        </span>
      )}
      {onManage ? (
        <button
          type="button"
          aria-label={t("Edit {field} properties", { field: label })}
          className="min-h-[34px] min-w-0 flex-1 truncate py-[7px] text-left outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
          onClick={onManage}
        >
          {label}
        </button>
      ) : (
        <p className="min-w-0 truncate py-[7px]">{label}</p>
      )}
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
        <SortableRecordProperty id={item.id} disabled={disabled}>
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
  onDelete,
  onDerived,
}: {
  field: EidosFileFieldInfo
  management: RecordFieldManagement
  disabled: boolean
  onUpdate: Parameters<typeof useEidosFileFieldPropertyControls>[0]["onUpdate"]
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
            onClick={() =>
              field.type === "formula"
                ? onDerived("formula")
                : setStep("settings")
            }
          >
            {t(field.type === "formula" ? "Edit formula" : "Edit property")}
            <ChevronRight className="h-3 w-3" />
          </Button>
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
  rowId,
  schemaLocked,
  state,
  onStateChange,
}: {
  management?: RecordFieldManagement
  fields: EidosFileFieldInfo[]
  rowId: string
  schemaLocked: boolean
  state: RecordFieldMenuState
  onStateChange: (next: RecordFieldMenuState) => void
}) {
  const { translate: t } = useEidosFileUI()
  const [busy, setBusy] = useState(false)
  const locked = useRef(false)
  const transferringFocus = useRef(false)
  const lastAnchor = useRef<HTMLElement | null>(null)
  const recordRoot = useRef<HTMLElement | null>(null)
  if (state.anchor) {
    lastAnchor.current = state.anchor
    recordRoot.current = state.anchor.closest<HTMLElement>(
      '[data-eidos-file-detail-panel="record"]'
    )
  }
  const [editingLookup, setEditingLookup] = useState(false)
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
  const tableId = management?.table.table.id
  const source = management?.source
  const previewFormula = useCallback(
    (input: EidosFileFormulaPreviewInput) =>
      source!.previewFormula!(tableId!, input),
    [source, tableId]
  )
  const restoreFocus = () => {
    if (lastAnchor.current?.isConnected)
      lastAnchor.current.focus({ preventScroll: true })
    else
      recordRoot.current
        ?.querySelector<HTMLElement>(
          "[data-eidos-record-properties-footer] button"
        )
        ?.focus()
  }
  const openFormula = (initialName: string) => {
    if (!canAlter || locked.current) return
    transferringFocus.current = true
    onStateChange({ ...state, formula: { initialName } })
  }
  const close = () => {
    if (locked.current || deleteTarget) return
    onStateChange({ anchor: null, fieldId: null })
    setEditingLookup(false)
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
        open={Boolean(state.anchor) && !state.formula}
        onOpenChange={(open) => {
          if (!open && !transferringFocus.current) close()
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
            if (!transferringFocus.current) restoreFocus()
          }}
        >
          {management && state.anchor ? (
            selected ? (
              editingLookup ? (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="m-1 h-7 gap-1 text-xs"
                    disabled={busy}
                    onClick={() => setEditingLookup(false)}
                  >
                    <ArrowLeft className="h-3 w-3" />
                    {selected.name}
                  </Button>
                  <EidosFileLookupEditorPopover
                    embedded
                    open
                    field={selected}
                    fields={fields}
                    tables={[...(management.tables ?? [management.table])]}
                    onOpenChange={(open) => {
                      if (!open) setEditingLookup(false)
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
                  onDelete={() => setDeleteTarget(selected)}
                  onDerived={(kind) => {
                    if (kind === "formula") openFormula(selected.name)
                    else setEditingLookup(true)
                  }}
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
                onChooseFormula={openFormula}
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
      {management && state.formula && (state.fieldId === null || selected) ? (
        <EidosFileRecordFormulaDialog
          field={selected ?? null}
          fields={fields}
          initialName={state.formula.initialName}
          rowId={rowId}
          disabled={!canAlter || busy}
          onClose={close}
          onRestoreFocus={() => {
            transferringFocus.current = false
            restoreFocus()
          }}
          onPreview={source?.previewFormula ? previewFormula : undefined}
          onSave={({ name, columnName, property }) =>
            mutate(() =>
              selected
                ? management.source.updateField(
                    management.table.table.id,
                    selected.id,
                    { property }
                  )
                : management.source.addField(management.table.table.id, {
                    name,
                    columnName,
                    type: "formula",
                    property,
                  })
            )
          }
        />
      ) : null}
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
          setEditingLookup(false)
        }}
        onError={(cause) =>
          setError(cause instanceof Error ? cause.message : String(cause))
        }
      />
    </>
  )
}

export function EidosFileRecordPropertiesFooter({
  hiddenCount,
  expanded,
  controlsId,
  preferencesLocked,
  creationLocked,
  canCreate,
  onCreate,
  onToggleHidden,
  variant,
}: {
  hiddenCount: number
  expanded: boolean
  controlsId: string
  preferencesLocked: boolean
  creationLocked: boolean
  canCreate: boolean
  onCreate: (anchor: HTMLElement) => void
  onToggleHidden: () => void
  variant: "page" | "panel"
}) {
  const { interactionMode, translate: t } = useEidosFileUI()
  if (!canCreate && hiddenCount === 0) return null
  return (
    <div
      className={cn(
        "grid justify-items-start gap-0.5 py-0.5",
        variant === "panel" && "px-4"
      )}
      data-eidos-record-properties-footer
    >
      {canCreate ? (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-1.5 h-[34px] justify-start gap-2 rounded-md px-1.5 text-sm font-normal text-muted-foreground hover:bg-muted"
          disabled={creationLocked}
          onClick={(event) => onCreate(event.currentTarget)}
        >
          <Plus className="h-4 w-4" />
          {t("Add a property")}
        </Button>
      ) : null}
      {hiddenCount ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={
            interactionMode === "mobile"
              ? "eidos-mobile-record-disclosure"
              : "-ml-1.5 h-[34px] justify-start gap-2 rounded-md px-1.5 text-sm font-normal text-muted-foreground hover:bg-muted"
          }
          data-eidos-file-record-hidden-properties-toggle=""
          aria-expanded={expanded}
          aria-controls={controlsId}
          disabled={preferencesLocked}
          onClick={onToggleHidden}
        >
          {expanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
          {expanded
            ? t(
                hiddenCount === 1
                  ? "Collapse {count} hidden property"
                  : "Collapse {count} hidden properties",
                { count: hiddenCount }
              )
            : t(
                hiddenCount === 1
                  ? "Show {count} hidden property"
                  : "Show {count} hidden properties",
                { count: hiddenCount }
              )}
        </Button>
      ) : null}
    </div>
  )
}
