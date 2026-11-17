import { useEffect, useRef, useState, type ReactNode } from "react"
import type {
  EidosFileFieldInfo,
  EidosFileSnapshot,
} from "@eidos.space/eidos-file"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  ArrowLeft,
  ChevronRight,
  Columns3,
  GripVertical,
  Plus,
  Search,
  Settings2,
} from "lucide-react"

import { useEidosFileUI } from "./context"
import type { RecordFieldManagement } from "./eidos-file-record-field-context"
import type { RecordPropertyPreferences } from "./eidos-file-record-preferences"
import { EidosFileFieldPropertyPanel } from "./eidos-file-field-property-panel"
import { EidosFileFieldCreatePopover } from "./eidos-file-field-create-popover"
import { EidosFileFieldDeleteDialog } from "./eidos-file-field-delete-dialog"
import {
  EidosFileFormulaEditorPopover,
  EidosFileLookupEditorPopover,
} from "./eidos-file-derived-field-editor"
import { eidosFileFieldTypeIcon } from "./eidos-file-field-type-picker"
import {
  eidosFileFieldDisplayName,
  isEidosFileRecordLabelField,
} from "./eidos-file-field-visibility"
import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./ui/primitives"
import { SortableContainer } from "./ui/sortable"
import { useEidosFilePendingEdit } from "./use-pending-edit"

function PropertyRow({
  field,
  disabled,
  children,
}: {
  field: EidosFileFieldInfo
  disabled: boolean
  children: ReactNode
}) {
  const { translate: t } = useEidosFileUI()
  const sortable = useSortable({ id: field.id, disabled })
  return (
    <div
      ref={sortable.setNodeRef}
      className="flex min-h-8 items-center gap-1 rounded px-1 hover:bg-accent"
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
        className="flex h-7 w-5 shrink-0 items-center justify-center text-muted-foreground disabled:opacity-30"
        aria-label={t("Reorder {field}", {
          field: eidosFileFieldDisplayName(field),
        })}
        disabled={disabled}
        {...sortable.attributes}
        {...sortable.listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      {children}
    </div>
  )
}

export function EidosFileRecordFieldsPopover({
  management,
  fields,
  contentFieldId,
  preferences,
  onPreferencesChange,
  presentationLocked,
  schemaLocked,
  state,
  onStateChange,
}: {
  management?: RecordFieldManagement
  fields: EidosFileFieldInfo[]
  contentFieldId?: string
  preferences: RecordPropertyPreferences
  onPreferencesChange: (
    edit: (current: RecordPropertyPreferences) => RecordPropertyPreferences
  ) => void
  presentationLocked: boolean
  schemaLocked: boolean
  state: { open: boolean; fieldId: string | null }
  onStateChange: (next: { open: boolean; fieldId: string | null }) => void
}) {
  const { translate: t } = useEidosFileUI()
  const [search, setSearch] = useState("")
  const [creating, setCreating] = useState(false)
  const [derived, setDerived] = useState<"formula" | "lookup" | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<EidosFileFieldInfo | null>(
    null
  )
  const [busy, setBusy] = useState(false)
  const locked = useRef(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (state.open) return
    setSearch("")
    setCreating(false)
    setDerived(null)
    setDeleteTarget(null)
    setError(null)
  }, [state.open])
  useEidosFilePendingEdit(state.open || busy)
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
  const scopeFields = fields.filter((field) => !field.isHidden)
  const order = new Map(preferences.fieldOrder.map((id, index) => [id, index]))
  const ordered = [...scopeFields].sort(
    (a, b) =>
      (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(b.id) ?? Number.MAX_SAFE_INTEGER)
  )
  const normalized = search.trim().toLocaleLowerCase()
  const filtered = ordered.filter((field) =>
    eidosFileFieldDisplayName(field).toLocaleLowerCase().includes(normalized)
  )
  const systemCount = fields.filter((field) => field.systemRole != null).length
  const change = (
    edit: (current: RecordPropertyPreferences) => RecordPropertyPreferences
  ) => {
    if (presentationLocked) return
    try {
      onPreferencesChange(edit)
      setError(null)
    } catch {
      setError(t("Unable to save record property preferences"))
    }
  }
  const mutate = async (operation: () => Promise<EidosFileSnapshot>) => {
    if (!canAlter || !management || locked.current)
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
  const back = () => {
    onStateChange({ open: true, fieldId: null })
    setCreating(false)
    setDerived(null)
    setError(null)
  }
  const close = () => {
    if (locked.current || deleteTarget) return
    onStateChange({ open: false, fieldId: null })
    setSearch("")
    setCreating(false)
    setDerived(null)
    setError(null)
  }
  const list = (
    <>
      <div className="border-b px-3 py-2">
        <p className="text-xs font-medium">{t("Properties in records")}</p>
        <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
          {t(
            "Display settings apply to records in this table, not view columns."
          )}
        </p>
      </div>
      <label className="flex min-h-10 cursor-pointer items-center gap-2 border-b px-3 py-2 text-xs">
        <input
          type="checkbox"
          checked={preferences.hideSystemFields}
          aria-label={t("Always hide system fields")}
          disabled={presentationLocked}
          onChange={(event) => {
            const value = event.currentTarget.checked
            change((current) => ({ ...current, hideSystemFields: value }))
          }}
        />
        <span className="min-w-0 flex-1">{t("Always hide system fields")}</span>
        <span className="text-[10px] text-muted-foreground">{systemCount}</span>
      </label>
      <div className="relative border-b p-2">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="h-7 pl-7 text-xs"
          aria-label={t("Search fields")}
          placeholder={t("Search fields")}
        />
      </div>
      <div
        className="max-h-72 overflow-y-auto p-1.5"
        data-eidos-record-fields-list
      >
        {filtered.length ? (
          <SortableContainer
            items={filtered.map((field) => ({ id: field.id, field }))}
            optimistic={false}
            disabled={presentationLocked || Boolean(normalized)}
            onReorder={(next) =>
              change((current) => ({
                ...current,
                fieldOrder: next.map((item) => item.id),
              }))
            }
            renderItem={({ field }) => {
              const system = field.systemRole != null
              const pinned =
                field.id === contentFieldId ||
                isEidosFileRecordLabelField(field)
              const TypeIcon = eidosFileFieldTypeIcon(field.type) ?? Columns3
              return (
                <PropertyRow
                  field={field}
                  disabled={
                    presentationLocked ||
                    Boolean(normalized) ||
                    system ||
                    pinned
                  }
                >
                  {system || pinned ? (
                    <span className="w-5 shrink-0" />
                  ) : (
                    <input
                      type="checkbox"
                      checked={!preferences.hiddenFields.includes(field.id)}
                      disabled={presentationLocked}
                      aria-label={t("Show {field}", {
                        field: eidosFileFieldDisplayName(field),
                      })}
                      onChange={(event) => {
                        const visible = event.currentTarget.checked
                        change((current) => ({
                          ...current,
                          hiddenFields: visible
                            ? current.hiddenFields.filter(
                                (id) => id !== field.id
                              )
                            : [...new Set([...current.hiddenFields, field.id])],
                        }))
                      }}
                    />
                  )}
                  <button
                    type="button"
                    className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded px-1 text-left text-xs disabled:cursor-default"
                    disabled={system || !canAlter || busy}
                    aria-label={t("Edit {field} properties", {
                      field: eidosFileFieldDisplayName(field),
                    })}
                    onClick={() =>
                      onStateChange({ open: true, fieldId: field.id })
                    }
                  >
                    <TypeIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">
                      {eidosFileFieldDisplayName(field)}
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {system
                        ? t("System")
                        : field.id === contentFieldId
                          ? t("Content")
                          : t(field.type)}
                    </span>
                    {!system && canAlter ? (
                      <ChevronRight className="h-3 w-3 shrink-0" />
                    ) : null}
                  </button>
                </PropertyRow>
              )
            }}
          />
        ) : (
          <p className="p-4 text-center text-xs text-muted-foreground">
            {t("No matching fields")}
          </p>
        )}
      </div>
      {management ? (
        <div className="border-t p-1.5">
          <Button
            variant="ghost"
            className="h-8 w-full justify-start gap-2 text-xs"
            disabled={!canAlter || busy}
            onClick={() => setCreating(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            {t("New field")}
          </Button>
        </div>
      ) : null}
      {schemaLocked ? (
        <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">
          {t("Save record edits before changing fields.")}
        </p>
      ) : null}
    </>
  )

  return (
    <>
      <Popover
        modal
        open={state.open}
        onOpenChange={(open) => {
          if (open) onStateChange({ open: true, fieldId: null })
          else close()
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            aria-label={t("Manage record properties")}
            title={t("Manage record properties")}
          >
            <Settings2 className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-80 max-w-[calc(100vw-24px)] p-0"
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault()
          }}
          onInteractOutside={(event) => {
            if (busy) event.preventDefault()
          }}
        >
          {selected || creating ? (
            <div className="border-b p-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs"
                disabled={busy}
                onClick={back}
              >
                <ArrowLeft className="h-3 w-3" />
                {t("All properties")}
              </Button>
            </div>
          ) : null}
          {selected && management ? (
            <div className="h-[min(65vh,520px)] [&>.eidos-file-detail-panel]:w-full [&>.eidos-file-detail-panel]:border-0">
              {derived ? (
                derived === "formula" ? (
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
                )
              ) : (
                <EidosFileFieldPropertyPanel
                  key={selected.id}
                  field={selected}
                  tables={management.tables ?? [management.table]}
                  disabled={!canAlter}
                  onClose={back}
                  onUpdate={(field, changes) =>
                    mutate(() =>
                      management.source.updateField(
                        management.table.table.id,
                        field.id,
                        changes
                      )
                    )
                  }
                  onDelete={setDeleteTarget}
                  onEditFormula={() => setDerived("formula")}
                  onEditLookup={() => setDerived("lookup")}
                />
              )}
            </div>
          ) : creating && management ? (
            <EidosFileFieldCreatePopover
              embedded
              open
              table={management.table}
              tables={[...(management.tables ?? [management.table])]}
              disabled={!canAlter || busy}
              onOpenChange={(open) => {
                if (!open) setCreating(false)
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
          ) : (
            list
          )}
          {error ? (
            <p
              role="alert"
              className="border-t px-3 py-2 text-xs text-destructive"
            >
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
          back()
        }}
        onError={(cause) =>
          setError(cause instanceof Error ? cause.message : String(cause))
        }
      />
    </>
  )
}
