import type { ButtonHTMLAttributes, KeyboardEvent } from "react"
import type {
  BaseFieldInfo,
  BaseRow,
  BaseRowRange,
  BaseSortDirection,
} from "@eidos.space/base"
import type { Rectangle } from "@glideapps/glide-data-grid"
import {
  ArrowDown,
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUp,
  Copy,
  ExternalLink,
  FileSearch,
  FolderOpen,
  ListX,
  PanelRightOpen,
  Pin,
  PinOff,
  SlidersHorizontal,
  Trash2,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"

export interface BaseFieldMenuState {
  bounds: Rectangle
  field: BaseFieldInfo
  fieldIndex: number
}

export interface BaseCellMenuState {
  bounds: Rectangle
  field: BaseFieldInfo
  fieldIndex: number
  point: { x: number; y: number }
  row: BaseRow
  rowIndex: number
  rowRanges: BaseRowRange[]
}

const menuItemClassName =
  "flex h-7 w-full items-center gap-2 rounded-[3px] px-2 text-left text-xs text-popover-foreground outline-hidden hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent disabled:pointer-events-none disabled:opacity-45"

function menuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return
  event.preventDefault()
  const items = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      '[role="menuitem"]:not(:disabled)'
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

export function BaseFieldMenu({
  state,
  open,
  sortDirection,
  frozen,
  canUpdateView,
  canEditStructure,
  onOpenChange,
  onEditProperty,
  onSort,
  onInsert,
  onToggleFreeze,
  onDelete,
}: {
  state: BaseFieldMenuState | null
  open: boolean
  sortDirection?: BaseSortDirection
  frozen: boolean
  canUpdateView: boolean
  canEditStructure: boolean
  onOpenChange: (open: boolean) => void
  onEditProperty?: (field: BaseFieldInfo) => void
  onSort: (field: BaseFieldInfo, direction: BaseSortDirection | null) => void
  onInsert: (index: number) => void
  onToggleFreeze: (fieldIndex: number, frozen: boolean) => void
  onDelete: (field: BaseFieldInfo) => void
}) {
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
        align="start"
        side="bottom"
        sideOffset={2}
        className="w-56 p-1"
        role="menu"
        aria-label={state ? `Actions for ${state.field.name}` : "Field actions"}
        onKeyDown={menuKeyDown}
      >
        {state ? (
          <>
            <div className="px-2 py-1.5">
              <p className="truncate text-xs font-medium">{state.field.name}</p>
              <p className="text-[11px] capitalize text-muted-foreground">
                {state.field.type.replace("-", " ")}
              </p>
            </div>
            <div className="my-1 h-px bg-border" role="separator" />
            {onEditProperty ? (
              <MenuItem
                disabled={!canEditStructure}
                onClick={() => run(() => onEditProperty(state.field))}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Edit property
              </MenuItem>
            ) : null}
            <div className="my-1 h-px bg-border" role="separator" />
            <MenuItem
              disabled={!canUpdateView}
              onClick={() => run(() => onSort(state.field, "asc"))}
            >
              <ArrowUp className="h-3.5 w-3.5" />
              Sort ascending
              {sortDirection === "asc" ? (
                <span className="ml-auto text-[10px] text-muted-foreground">
                  Active
                </span>
              ) : null}
            </MenuItem>
            <MenuItem
              disabled={!canUpdateView}
              onClick={() => run(() => onSort(state.field, "desc"))}
            >
              <ArrowDown className="h-3.5 w-3.5" />
              Sort descending
              {sortDirection === "desc" ? (
                <span className="ml-auto text-[10px] text-muted-foreground">
                  Active
                </span>
              ) : null}
            </MenuItem>
            {sortDirection ? (
              <MenuItem
                disabled={!canUpdateView}
                onClick={() => run(() => onSort(state.field, null))}
              >
                <ListX className="h-3.5 w-3.5" />
                Clear sort
              </MenuItem>
            ) : null}
            <div className="my-1 h-px bg-border" role="separator" />
            <MenuItem
              disabled={!canEditStructure}
              onClick={() => run(() => onInsert(state.fieldIndex))}
            >
              <ArrowLeftToLine className="h-3.5 w-3.5" />
              Insert field left
            </MenuItem>
            <MenuItem
              disabled={!canEditStructure}
              onClick={() => run(() => onInsert(state.fieldIndex + 1))}
            >
              <ArrowRightToLine className="h-3.5 w-3.5" />
              Insert field right
            </MenuItem>
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
              {frozen ? "Unfreeze columns" : "Freeze to this field"}
            </MenuItem>
            <div className="my-1 h-px bg-border" role="separator" />
            <MenuItem
              destructive
              disabled={
                !canEditStructure || state.field.tableColumnName === "title"
              }
              onClick={() => run(() => onDelete(state.field))}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete field
            </MenuItem>
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

export function BaseCellMenu({
  state,
  open,
  selectionCount,
  cellText,
  filePaths,
  canDelete,
  onOpenChange,
  onOpenRecord,
  onCopyCell,
  onCopyRecordId,
  onOpenUrl,
  onOpenFile,
  onRevealFile,
  onDeleteRows,
}: {
  state: BaseCellMenuState | null
  open: boolean
  selectionCount: number
  cellText: string
  filePaths: string[]
  canDelete: boolean
  onOpenChange: (open: boolean) => void
  onOpenRecord: (state: BaseCellMenuState) => void
  onCopyCell: (text: string) => void
  onCopyRecordId: (id: string) => void
  onOpenUrl: (url: string) => void
  onOpenFile?: (path: string) => void
  onRevealFile?: (path: string) => void
  onDeleteRows: (ranges: BaseRowRange[]) => void
}) {
  const run = (action: () => void) => {
    onOpenChange(false)
    action()
  }
  const rowId = state?.row._id
  const url = state?.field.type === "url" ? cellText : ""
  const firstFile = filePaths[0]

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
        className="w-56 p-1"
        role="menu"
        aria-label="Record actions"
        onKeyDown={menuKeyDown}
      >
        {state ? (
          <>
            <MenuItem onClick={() => run(() => onOpenRecord(state))}>
              <PanelRightOpen className="h-3.5 w-3.5" />
              Open record
            </MenuItem>
            <MenuItem
              disabled={!cellText}
              onClick={() => run(() => onCopyCell(cellText))}
            >
              <Copy className="h-3.5 w-3.5" />
              Copy cell
            </MenuItem>
            <MenuItem
              disabled={typeof rowId !== "string" || rowId.length === 0}
              onClick={() =>
                run(() =>
                  onCopyRecordId(typeof rowId === "string" ? rowId : "")
                )
              }
            >
              <Copy className="h-3.5 w-3.5" />
              Copy record ID
            </MenuItem>
            {url ? (
              <MenuItem onClick={() => run(() => onOpenUrl(url))}>
                <ExternalLink className="h-3.5 w-3.5" />
                Open URL
              </MenuItem>
            ) : null}
            {firstFile && onOpenFile ? (
              <MenuItem onClick={() => run(() => onOpenFile(firstFile))}>
                <FileSearch className="h-3.5 w-3.5" />
                Open file
              </MenuItem>
            ) : null}
            {firstFile && onRevealFile ? (
              <MenuItem onClick={() => run(() => onRevealFile(firstFile))}>
                <FolderOpen className="h-3.5 w-3.5" />
                Show in file manager
              </MenuItem>
            ) : null}
            <div className="my-1 h-px bg-border" role="separator" />
            <MenuItem
              destructive
              disabled={!canDelete}
              onClick={() => run(() => onDeleteRows(state.rowRanges))}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete{" "}
              {selectionCount === 1 ? "record" : `${selectionCount} records`}
            </MenuItem>
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
