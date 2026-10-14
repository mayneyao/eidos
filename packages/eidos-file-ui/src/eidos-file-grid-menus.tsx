import { useRef, type ButtonHTMLAttributes, type KeyboardEvent } from "react"
import type {
  EidosFileColumnStatType,
  EidosFileFieldInfo,
  EidosFileRow,
  EidosFileRowRange,
  EidosFileSortDirection,
} from "@eidos.space/eidos-file"
import {
  eidosFileColumnStatLabel,
  eidosFileColumnStatTypesForField,
} from "@eidos.space/eidos-file"
import type { Rectangle } from "@glideapps/glide-data-grid"
import {
  ArrowDown,
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUp,
  Calculator,
  Check,
  ChevronLeft,
  Copy,
  ExternalLink,
  EyeOff,
  ListX,
  PanelRightOpen,
  Pin,
  PinOff,
  SlidersHorizontal,
  Trash2,
} from "lucide-react"

import { cn } from "./lib/cn"
import { useEidosFileUI } from "./context"
import { useEidosFileTableActions } from "./table-actions"
import {
  EidosFileCellActions,
  type EidosFileCellAction,
} from "./eidos-file-cell-actions"
import { Zap } from "lucide-react"
import { eidosFileFieldDisplaysUrl } from "./eidos-file-field-properties"
import { eidosFileUrlIsActivatable } from "./eidos-file-url-activation"
import { Popover, PopoverAnchor, PopoverContent } from "./ui/adaptive-popover"

import {
  eidosFileFieldDisplayName,
  isOptionalEidosFileSystemField,
} from "./eidos-file-field-visibility"

export interface EidosFileFieldMenuState {
  bounds: Rectangle
  field: EidosFileFieldInfo
  fieldIndex: number
  openedFromTouch?: boolean
}

export interface EidosFileCellMenuState {
  bounds: Rectangle
  field: EidosFileFieldInfo
  fieldIndex: number
  point: { x: number; y: number }
  row: EidosFileRow
  rowIndex: number
  rowRanges: EidosFileRowRange[]
}

const menuItemClassName =
  "flex h-7 w-full items-center gap-2 rounded-[3px] px-2 text-left text-xs text-popover-foreground outline-hidden hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent disabled:pointer-events-none disabled:opacity-45"

function menuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
  if ((event.target as HTMLElement).closest("[data-menu-drag-handle]")) return
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return
  event.preventDefault()
  const items = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      '[role="menuitem"]:not(:disabled), [role="menuitemradio"]:not(:disabled)'
    )
  )
  if (items.length === 0) return
  const currentIndex = items.indexOf(document.activeElement as HTMLElement)
  const nextIndex =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : event.key === "ArrowDown"
          ? (currentIndex + 1 + items.length) % items.length
          : (currentIndex - 1 + items.length) % items.length
  items[nextIndex]?.focus()
}

function MenuItem({
  destructive = false,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  destructive?: boolean
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={cn(
        menuItemClassName,
        destructive && "text-destructive hover:text-destructive",
        className
      )}
      {...props}
    />
  )
}

export function EidosFileFieldMenu({
  state,
  open,
  sortDirection,
  frozen,
  canUpdateView,
  canEditStructure,
  onOpenChange,
  onEditProperty,
  statType,
  onCalculate,
  onSort,
  onInsert,
  onToggleFreeze,
  onHide,
  onDelete,
}: {
  state: EidosFileFieldMenuState | null
  open: boolean
  sortDirection?: EidosFileSortDirection
  frozen: boolean
  canUpdateView: boolean
  canEditStructure: boolean
  onOpenChange: (open: boolean) => void
  onEditProperty?: (field: EidosFileFieldInfo) => void
  statType?: EidosFileColumnStatType
  onCalculate?: (state: EidosFileFieldMenuState) => void
  onSort: (
    field: EidosFileFieldInfo,
    direction: EidosFileSortDirection | null
  ) => void
  onInsert: (index: number) => void
  onToggleFreeze?: (fieldIndex: number, frozen: boolean) => void
  onHide: (field: EidosFileFieldInfo) => void
  onDelete: (field: EidosFileFieldInfo) => void
}) {
  const { translate: t } = useEidosFileUI()
  const menuRef = useRef<HTMLDivElement>(null)
  const run = (action: () => void) => {
    onOpenChange(false)
    action()
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        <span
          className="pointer-events-none fixed h-px w-px"
          style={
            state
              ? {
                  left: state.bounds.x,
                  top: state.bounds.y + state.bounds.height,
                }
              : undefined
          }
        />
      </PopoverAnchor>
      <PopoverContent
        ref={menuRef}
        align="start"
        side="bottom"
        sideOffset={2}
        className="w-56 p-1"
        role="menu"
        aria-label={
          state
            ? t("Actions for {field}", {
                field: eidosFileFieldDisplayName(state.field),
              })
            : t("Field actions")
        }
        onKeyDown={menuKeyDown}
        onFocusOutside={(event) => {
          if (!state?.openedFromTouch) return
          // Glide restores focus after completing a touch selection. Keep a
          // touch-opened menu stable until the user taps outside or chooses an
          // action instead of treating that programmatic focus move as intent
          // to dismiss the menu.
          event.preventDefault()
          if (event.target instanceof HTMLCanvasElement) {
            requestAnimationFrame(() => {
              menuRef.current
                ?.querySelector<HTMLElement>(
                  '[role="menuitem"]:not(:disabled), [role="menuitemradio"]:not(:disabled)'
                )
                ?.focus({ preventScroll: true })
            })
          }
        }}
      >
        {state ? (
          <>
            <div className="px-2 py-1.5">
              <p className="truncate text-xs font-medium">
                {eidosFileFieldDisplayName(state.field)}
              </p>
              <p className="text-[11px] capitalize text-muted-foreground">
                {t(state.field.type)}
              </p>
            </div>
            <div className="my-1 h-px bg-border" role="separator" />
            {onEditProperty ? (
              <MenuItem
                disabled={
                  !canEditStructure ||
                  isOptionalEidosFileSystemField(state.field)
                }
                onClick={() => run(() => onEditProperty(state.field))}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                {t("Edit property")}
              </MenuItem>
            ) : null}
            <div className="my-1 h-px bg-border" role="separator" />
            <MenuItem
              disabled={!canUpdateView}
              onClick={() => run(() => onSort(state.field, "asc"))}
            >
              <ArrowUp className="h-3.5 w-3.5" />
              {t("Sort ascending")}
              {sortDirection === "asc" ? (
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {t("Active")}
                </span>
              ) : null}
            </MenuItem>
            <MenuItem
              disabled={!canUpdateView}
              onClick={() => run(() => onSort(state.field, "desc"))}
            >
              <ArrowDown className="h-3.5 w-3.5" />
              {t("Sort descending")}
              {sortDirection === "desc" ? (
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {t("Active")}
                </span>
              ) : null}
            </MenuItem>
            {sortDirection ? (
              <MenuItem
                disabled={!canUpdateView}
                onClick={() => run(() => onSort(state.field, null))}
              >
                <ListX className="h-3.5 w-3.5" />
                {t("Clear sort")}
              </MenuItem>
            ) : null}
            <div className="my-1 h-px bg-border" role="separator" />
            <MenuItem
              disabled={!canEditStructure}
              onClick={() => run(() => onInsert(state.fieldIndex))}
            >
              <ArrowLeftToLine className="h-3.5 w-3.5" />
              {t("Insert field left")}
            </MenuItem>
            <MenuItem
              disabled={!canEditStructure}
              onClick={() => run(() => onInsert(state.fieldIndex + 1))}
            >
              <ArrowRightToLine className="h-3.5 w-3.5" />
              {t("Insert field right")}
            </MenuItem>
            {onToggleFreeze && (
              <MenuItem
                disabled={!canUpdateView}
                onClick={() =>
                  run(() => onToggleFreeze(state.fieldIndex, frozen))
                }
              >
                {frozen ? (
                  <PinOff className="h-3.5 w-3.5" />
                ) : (
                  <Pin className="h-3.5 w-3.5" />
                )}
                {frozen ? t("Unfreeze columns") : t("Freeze to this field")}
              </MenuItem>
            )}
            <MenuItem
              disabled={!canUpdateView}
              onClick={() => run(() => onHide(state.field))}
            >
              <EyeOff className="h-3.5 w-3.5" />
              {t("Hide field")}
            </MenuItem>
            {onCalculate ? (
              <MenuItem
                disabled={!canUpdateView}
                onClick={() => run(() => onCalculate(state))}
              >
                <Calculator className="h-3.5 w-3.5" />
                <span className="min-w-0 flex-1 truncate">
                  {t("Calculate")}
                  {statType
                    ? ` · ${t(eidosFileColumnStatLabel(statType))}`
                    : ""}
                </span>
              </MenuItem>
            ) : null}
            <div className="my-1 h-px bg-border" role="separator" />
            <MenuItem
              destructive
              disabled={
                !canEditStructure ||
                state.field.valueKind === "system" ||
                state.field.settings?.isSystem === true
              }
              onClick={() => run(() => onDelete(state.field))}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("Delete field")}
            </MenuItem>
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

export function EidosFileColumnStatMenu({
  state,
  open,
  value,
  disabled,
  onOpenChange,
  onBack,
  onChange,
}: {
  state: EidosFileFieldMenuState | null
  open: boolean
  value?: EidosFileColumnStatType
  disabled: boolean
  onOpenChange: (open: boolean) => void
  onBack: () => void
  onChange: (value: EidosFileColumnStatType | null) => void
}) {
  const { translate: t } = useEidosFileUI()
  const options = state ? eidosFileColumnStatTypesForField(state.field) : []
  const choose = (next: EidosFileColumnStatType | null) => {
    onOpenChange(false)
    onChange(next)
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        <span
          className="pointer-events-none fixed h-px w-px"
          style={
            state
              ? {
                  left: state.bounds.x,
                  top: state.bounds.y + state.bounds.height,
                }
              : undefined
          }
        />
      </PopoverAnchor>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={2}
        className="w-56 p-1"
        role="menu"
        aria-label={
          state
            ? t("Calculate {field}", { field: state.field.name })
            : t("Calculate")
        }
        onKeyDown={menuKeyDown}
      >
        {state ? (
          <>
            <button
              type="button"
              className="mb-1 flex h-7 w-full items-center gap-2 rounded-[3px] px-2 text-left text-xs font-medium outline-hidden hover:bg-accent focus-visible:bg-accent"
              onClick={onBack}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span className="min-w-0 flex-1 truncate">
                {state.field.name}
              </span>
            </button>
            <div className="h-px bg-border" role="separator" />
            <div className="max-h-72 overflow-y-auto py-1">
              <MenuItem
                role="menuitemradio"
                aria-checked={value === undefined}
                disabled={disabled}
                onClick={() => choose(null)}
              >
                <span className="w-3.5 text-center text-muted-foreground">
                  —
                </span>
                {t("None")}
                {value === undefined ? (
                  <Check className="ml-auto h-3.5 w-3.5" />
                ) : null}
              </MenuItem>
              {options.map((type) => (
                <MenuItem
                  key={type}
                  role="menuitemradio"
                  aria-checked={value === type}
                  disabled={disabled}
                  onClick={() => choose(type)}
                >
                  <span className="w-3.5 text-center text-[11px] text-muted-foreground">
                    {type === "sum"
                      ? "Σ"
                      : type === "average"
                        ? "μ"
                        : type.startsWith("percent-")
                          ? "%"
                          : "#"}
                  </span>
                  {t(eidosFileColumnStatLabel(type))}
                  {value === type ? (
                    <Check className="ml-auto h-3.5 w-3.5" />
                  ) : null}
                </MenuItem>
              ))}
            </div>
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

export function EidosFileCellMenu({
  state,
  open,
  selectionCount,
  cellText,
  canDelete,
  onOpenChange,
  onOpenRecord,
  onCopyCell,
  onCopyRecordId,
  onOpenUrl,
  onOpenFile,
  onDeleteRows,
}: {
  state: EidosFileCellMenuState | null
  open: boolean
  selectionCount: number
  cellText: string
  canDelete: boolean
  onOpenChange: (open: boolean) => void
  onOpenRecord: (state: EidosFileCellMenuState) => void
  onCopyCell: (text: string) => void
  onCopyRecordId: (id: string) => void
  onOpenUrl?: (url: string) => void
  onOpenFile?: () => void
  onDeleteRows: (ranges: EidosFileRowRange[]) => void
}) {
  const { translate: t } = useEidosFileUI()
  const dragging = useRef(false)
  const run = (action: () => void) => {
    onOpenChange(false)
    action()
  }
  const rowId = state?.row._id
  const url =
    state &&
    onOpenUrl &&
    eidosFileFieldDisplaysUrl(state.field) &&
    eidosFileUrlIsActivatable(cellText)
      ? cellText
      : ""

  const target = {
    ranges: state?.rowRanges ?? null,
    rowId: typeof rowId === "string" ? rowId : undefined,
  }
  const {
    actions,
    items: extensions,
    error,
  } = useEidosFileTableActions(target, open && !!state)
  const items: EidosFileCellAction[] = state
    ? [
        ...(onOpenFile
          ? [
              {
                id: "core/open-file",
                title: t("Open file"),
                icon: <ExternalLink className="h-3.5 w-3.5" />,
                group: "record" as const,
                run: () => run(onOpenFile),
              },
            ]
          : []),
        {
          id: "core/open-record",
          title: t("Open record"),
          icon: <PanelRightOpen className="h-3.5 w-3.5" />,
          group: "record",
          run: () => run(() => onOpenRecord(state)),
        },
        {
          id: "core/copy-cell",
          title: t("Copy cell"),
          icon: <Copy className="h-3.5 w-3.5" />,
          group: "record",
          disabled: !cellText,
          run: () => run(() => onCopyCell(cellText)),
        },
        {
          id: "core/copy-record-id",
          title: t("Copy record ID"),
          icon: <Copy className="h-3.5 w-3.5" />,
          group: "record",
          disabled: typeof rowId !== "string" || rowId.length === 0,
          run: () =>
            run(() => onCopyRecordId(typeof rowId === "string" ? rowId : "")),
        },
        ...(url
          ? [
              {
                id: "core/open-url",
                title: t("Open URL"),
                icon: <ExternalLink className="h-3.5 w-3.5" />,
                group: "record" as const,
                run: () => run(() => onOpenUrl?.(url)),
              },
            ]
          : []),
        ...extensions.map((item) => ({
          ...item,
          icon: item.icon ?? <Zap className="h-3.5 w-3.5" />,
          group: "extension" as const,
          run: () => run(() => actions?.run(item.id, target)),
        })),
        {
          id: "core/delete-record",
          title:
            selectionCount === 1
              ? t("Delete record")
              : t("Delete {count} records", { count: selectionCount }),
          icon: <Trash2 className="h-3.5 w-3.5" />,
          group: "destructive",
          disabled: !canDelete,
          run: () => run(() => onDeleteRows(state.rowRanges)),
        },
      ]
    : []

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        <span
          className="pointer-events-none fixed h-px w-px"
          style={
            state
              ? {
                  left: state.point.x,
                  top: state.point.y,
                }
              : undefined
          }
        />
      </PopoverAnchor>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={2}
        className="w-56 p-1 has-[[data-menu-reordering=true]]:w-[15.25rem]"
        role="menu"
        aria-label={t("Record actions")}
        onKeyDown={menuKeyDown}
        onEscapeKeyDown={(event) => {
          if (dragging.current) event.preventDefault()
        }}
      >
        {state && (
          <EidosFileCellActions
            items={items}
            open={open}
            onBlur={() => onOpenChange(false)}
            onDragStateChange={(value) => {
              dragging.current = value
            }}
          />
        )}
        {error && (
          <p role="alert" className="px-2 text-xs text-destructive">
            {error}
          </p>
        )}
      </PopoverContent>
    </Popover>
  )
}
