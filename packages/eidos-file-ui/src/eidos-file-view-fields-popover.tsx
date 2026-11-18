import { useMemo, useRef, useState, type ReactNode } from "react"
import {
  EIDOS_FILE_FORM_INPUT_FIELD_TYPES,
  isEidosFileFormInputField,
  type CreateEidosFileFieldInput,
  type EidosFileFieldInfo,
  type EidosFileViewInfo,
  type UpdateEidosFileViewInput,
} from "@eidos.space/eidos-file"
import {
  Check,
  ChevronRight,
  Columns3,
  GripVertical,
  Plus,
  Search,
} from "lucide-react"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

import { useEidosFileUI } from "./context"
import { useEidosFilePendingEdit } from "./use-pending-edit"
import { useViewLayoutUpdates } from "./use-view-layout-updates"
import { eidosFileFieldTypeIcon } from "./eidos-file-field-type-picker"
import {
  eidosFileFieldDisplayName,
  eidosFileFieldKey,
  eidosFileViewVisibleSystemFields,
  isOptionalEidosFileSystemField,
  orderedEidosFileViewFields,
} from "./eidos-file-field-visibility"
import { cn } from "./lib/cn"
import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./ui/primitives"
import { SortableContainer } from "./ui/sortable"

function orderedViewFields(
  fields: readonly EidosFileFieldInfo[],
  view: EidosFileViewInfo
): EidosFileFieldInfo[] {
  const ordered = orderedEidosFileViewFields(fields, view)
  return view.type === "form"
    ? ordered.filter(isEidosFileFormInputField)
    : ordered
}

function fieldIsVisible(
  field: EidosFileFieldInfo,
  hiddenFields: ReadonlySet<string>,
  visibleSystemFields: ReadonlySet<string>
): boolean {
  const fieldId = eidosFileFieldKey(field)
  return isOptionalEidosFileSystemField(field)
    ? visibleSystemFields.has(fieldId)
    : !hiddenFields.has(fieldId)
}

function SortableFieldRow({
  id,
  label,
  disabled,
  children,
}: {
  id: string
  label: string
  disabled: boolean
  children: ReactNode
}) {
  const sortable = useSortable({ id, disabled })
  return (
    <div
      ref={sortable.setNodeRef}
      data-eidos-file-sortable-field={id}
      className={cn(
        "group flex min-h-8 items-center gap-1 rounded-md px-1.5 hover:bg-accent",
        sortable.isDragging && "z-10 bg-accent shadow-sm"
      )}
      style={{
        opacity: sortable.isDragging ? 0.72 : 1,
        transform: CSS.Transform.toString(
          sortable.transform ? { ...sortable.transform, x: 0 } : null
        ),
        transition: sortable.transition,
      }}
    >
      <button
        ref={sortable.setActivatorNodeRef}
        type="button"
        className="flex h-7 w-5 shrink-0 cursor-grab items-center justify-center text-muted-foreground/50 outline-hidden hover:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring active:cursor-grabbing disabled:cursor-default disabled:opacity-30"
        aria-label={label}
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

/**
 * Shared saved-View field visibility and ordering control. Form Views expose
 * only writable input fields; other Views retain every configurable field.
 * It mutates only the active View's canonical layout keys.
 */
export function EidosFileViewFieldsPopover({
  fields,
  view: savedView,
  disabled = false,
  className,
  onUpdate,
  onFieldOpen,
  onFieldAdd,
  embedded = false,
  title,
}: {
  fields: EidosFileFieldInfo[]
  view: EidosFileViewInfo
  disabled?: boolean
  className?: string
  onUpdate: (changes: UpdateEidosFileViewInput) => Promise<void> | void
  onFieldOpen?: (field: EidosFileFieldInfo) => void
  /** Render the same field list inside a host-owned mobile sheet. */
  embedded?: boolean
  title?: string
  onFieldAdd?: (
    allowedTypes?: readonly CreateEidosFileFieldInput["type"][]
  ) => void
}) {
  const { translate: t } = useEidosFileUI()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const { view, busy, error, enqueue, settle, clearError } =
    useViewLayoutUpdates(
      savedView,
      onUpdate,
      t("Unable to update visible fields")
    )
  useEidosFilePendingEdit(open || embedded || busy)
  const handingOffFocusRef = useRef(false)
  const orderedFields = useMemo(
    () => orderedViewFields(fields, view),
    [fields, view]
  )
  const hiddenFields = useMemo(
    () => new Set(view.hiddenFields),
    [view.hiddenFields]
  )
  const visibleSystemFields = useMemo(
    () => new Set(eidosFileViewVisibleSystemFields(view)),
    [view]
  )
  const normalizedSearch = search.trim().toLocaleLowerCase()
  const filteredFields = normalizedSearch
    ? orderedFields.filter((field) =>
        eidosFileFieldDisplayName(field)
          .toLocaleLowerCase()
          .includes(normalizedSearch)
      )
    : orderedFields
  const visibleCount = orderedFields.filter((field) =>
    fieldIsVisible(field, hiddenFields, visibleSystemFields)
  ).length
  const allHidden = visibleCount === 0
  const allVisible = visibleCount === orderedFields.length

  const toggleField = (field: EidosFileFieldInfo, visible: boolean) => {
    const fieldId = eidosFileFieldKey(field)
    enqueue((current) => {
      if (isOptionalEidosFileSystemField(field)) {
        const next = new Set(eidosFileViewVisibleSystemFields(current))
        if (visible) next.add(fieldId)
        else next.delete(fieldId)
        return {
          properties: {
            ...(current.properties ?? {}),
            visibleSystemFields: [...next],
          },
        }
      }
      const next = new Set(current.hiddenFields)
      if (visible) next.delete(fieldId)
      else next.add(fieldId)
      return { hiddenFields: [...next] }
    })
  }

  const showAll = () => {
    const configurableIds = new Set(
      orderedFields.map((field) => eidosFileFieldKey(field))
    )
    const systemIds = orderedFields
      .filter(isOptionalEidosFileSystemField)
      .map((field) => eidosFileFieldKey(field))
    enqueue((current) => ({
      hiddenFields: current.hiddenFields.filter(
        (fieldId) => !configurableIds.has(fieldId)
      ),
      properties: {
        ...(current.properties ?? {}),
        visibleSystemFields: [
          ...new Set([
            ...eidosFileViewVisibleSystemFields(current),
            ...systemIds,
          ]),
        ],
      },
    }))
  }

  const hideAll = () => {
    const ordinaryIds = orderedFields
      .filter((field) => !isOptionalEidosFileSystemField(field))
      .map((field) => eidosFileFieldKey(field))
    const systemIds = new Set(
      orderedFields
        .filter(isOptionalEidosFileSystemField)
        .map((field) => eidosFileFieldKey(field))
    )
    enqueue((current) => ({
      hiddenFields: [...new Set([...current.hiddenFields, ...ordinaryIds])],
      properties: {
        ...(current.properties ?? {}),
        visibleSystemFields: eidosFileViewVisibleSystemFields(current).filter(
          (fieldId) => !systemIds.has(fieldId)
        ),
      },
    }))
  }

  const reorderFields = (next: EidosFileFieldInfo[]) => {
    const knownIds = new Set(
      next.map((candidate) => eidosFileFieldKey(candidate))
    )
    enqueue((current) => {
      const orderMap = Object.fromEntries(
        Object.entries(current.orderMap ?? {}).filter(
          ([fieldId]) => !knownIds.has(fieldId)
        )
      )
      next.forEach((candidate, position) => {
        orderMap[eidosFileFieldKey(candidate)] = position
      })
      return { orderMap }
    })
  }

  const content = (
    <>
      <div className="flex items-center justify-between gap-3 border-b px-3 py-2.5">
        <div>
          <p className="text-xs font-medium">
            {title ?? t("Fields in this view")}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {t("{visible} of {total} visible", {
              visible: visibleCount,
              total: orderedFields.length,
            })}
          </p>
          {view.type === "gallery" || view.type === "kanban" ? (
            <p className="mt-0.5 max-w-52 text-[10px] leading-4 text-muted-foreground">
              {t("Card content uses visible fields from this list.")}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="h-7 px-2 text-[11px]"
            disabled={allHidden}
            onClick={hideAll}
          >
            {t("Hide all")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="h-7 px-2 text-[11px]"
            disabled={allVisible}
            onClick={showAll}
          >
            {t("Show all")}
          </Button>
        </div>
      </div>
      <div className="border-b p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            className="h-7 pl-7 text-xs"
            placeholder={t("Search fields")}
            aria-label={t("Search fields")}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>
      <div
        className="max-h-80 overflow-x-hidden overflow-y-auto p-1.5"
        data-eidos-file-view-fields-list
      >
        {filteredFields.length > 0 ? (
          <SortableContainer
            items={filteredFields.map((field) => ({
              id: eidosFileFieldKey(field),
              field,
            }))}
            optimistic={false}
            disabled={Boolean(normalizedSearch)}
            onReorder={(next) =>
              reorderFields(next.map((candidate) => candidate.field))
            }
            className="grid gap-0.5"
            renderItem={({ id: fieldId, field }) => {
              const visible = fieldIsVisible(
                field,
                hiddenFields,
                visibleSystemFields
              )
              const TypeIcon = eidosFileFieldTypeIcon(field.type) ?? Columns3
              const fieldName = eidosFileFieldDisplayName(field)
              const fieldSummary = (
                <>
                  <TypeIcon
                    aria-hidden="true"
                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                  />
                  <span className="min-w-0 flex-1 truncate text-left">
                    {fieldName}
                  </span>
                  <span className="shrink-0 text-[10px] capitalize text-muted-foreground">
                    {isOptionalEidosFileSystemField(field)
                      ? t("System")
                      : t(field.type)}
                  </span>
                </>
              )
              return (
                <SortableFieldRow
                  id={fieldId}
                  label={t("Reorder {field}", {
                    field: eidosFileFieldDisplayName(field),
                  })}
                  disabled={Boolean(normalizedSearch)}
                >
                  <label className="flex h-7 w-6 shrink-0 cursor-pointer items-center justify-center">
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                        visible
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input bg-background"
                      )}
                    >
                      {visible ? <Check className="h-3 w-3" /> : null}
                    </span>
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={visible}
                      aria-label={t("Show {field}", {
                        field: fieldName,
                      })}
                      onChange={(event) =>
                        toggleField(field, event.currentTarget.checked)
                      }
                    />
                  </label>
                  {onFieldOpen && field.valueKind !== "system" ? (
                    <button
                      type="button"
                      className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded px-1 text-xs outline-hidden hover:bg-background/70 focus-visible:ring-1 focus-visible:ring-ring"
                      aria-label={t("Edit {field} properties", {
                        field: fieldName,
                      })}
                      data-eidos-file-field-properties={fieldId}
                      onClick={async () => {
                        if (!(await settle())) return
                        if (!embedded) {
                          setOpen(false)
                          setSearch("")
                        }
                        clearError()
                        onFieldOpen(field)
                      }}
                    >
                      {fieldSummary}
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                    </button>
                  ) : (
                    <div
                      className="flex h-7 min-w-0 flex-1 items-center gap-2 px-1 text-xs"
                      data-eidos-file-system-field={
                        field.valueKind === "system" ? fieldId : undefined
                      }
                    >
                      {fieldSummary}
                      {onFieldOpen ? (
                        <span
                          aria-hidden="true"
                          className="h-3.5 w-3.5 shrink-0"
                        />
                      ) : null}
                    </div>
                  )}
                </SortableFieldRow>
              )
            }}
          />
        ) : (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            {t("No matching fields")}
          </p>
        )}
      </div>
      {onFieldAdd ? (
        <div className="border-t p-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-full justify-start gap-2 px-2 text-xs"
            onClick={async () => {
              if (!(await settle())) return
              if (!embedded) {
                handingOffFocusRef.current = true
                setOpen(false)
                setSearch("")
              }
              clearError()
              onFieldAdd(
                view.type === "form"
                  ? EIDOS_FILE_FORM_INPUT_FIELD_TYPES
                  : undefined
              )
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            {t("New field")}
          </Button>
        </div>
      ) : null}
      {error ? (
        <p
          className="border-t px-3 py-2 text-[11px] text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </>
  )
  if (embedded) return content

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) {
          setSearch("")
          clearError()
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "eidos-file-workbar-action h-7 gap-1 px-2 text-xs",
            className
          )}
          aria-label={t("Manage fields")}
          title={t("Fields")}
          disabled={disabled}
          data-eidos-file-view-fields-trigger
        >
          <Columns3 className="h-3.5 w-3.5" />
          <span className="eidos-file-workbar-action-label">{t("Fields")}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 p-0"
        onCloseAutoFocus={(event) => {
          if (!handingOffFocusRef.current) return
          event.preventDefault()
          handingOffFocusRef.current = false
        }}
      >
        {content}
      </PopoverContent>
    </Popover>
  )
}
