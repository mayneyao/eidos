import {
  cloneElement,
  useEffect,
  useId,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactElement,
} from "react"
import { Copy, PanelRightOpen, Trash2, Zap } from "lucide-react"
import type { EidosFileRow } from "@eidos.space/eidos-file"

import { useEidosFileUI, type EidosFileUIHost } from "./context"
import {
  EidosFileCellActions,
  eidosFileMenuKeyDown,
  type EidosFileCellAction,
} from "./eidos-file-cell-actions"
import { useEidosFileTableActions } from "./table-actions"
import { useEidosFileUndo } from "./eidos-file-undo-scope"
import { Popover, PopoverAnchor, PopoverContent } from "./ui/adaptive-popover"

/** Shared record operations; cells and individual views add their own actions. */
export function eidosFileRecordActions({
  rowId,
  count = 1,
  canDelete,
  onOpen,
  onCopyId,
  onDelete,
  translate: t,
}: {
  rowId: unknown
  count?: number
  canDelete: boolean
  onOpen(): void
  onCopyId(id: string): void
  onDelete(): void
  translate: EidosFileUIHost["translate"]
}): [EidosFileCellAction, EidosFileCellAction, EidosFileCellAction] {
  return [
    {
      id: "core/open-record",
      title: t("Open record"),
      icon: <PanelRightOpen className="h-3.5 w-3.5" />,
      group: "record",
      run: onOpen,
    },
    {
      id: "core/copy-record-id",
      title: t("Copy record ID"),
      icon: <Copy className="h-3.5 w-3.5" />,
      group: "record",
      disabled: typeof rowId !== "string" || rowId.length === 0,
      run: () => onCopyId(typeof rowId === "string" ? rowId : ""),
    },
    {
      id: "core/delete-record",
      title:
        count === 1
          ? t("Delete record")
          : t("Delete {count} records", { count }),
      icon: <Trash2 className="h-3.5 w-3.5" />,
      group: "destructive",
      disabled: !canDelete,
      run: onDelete,
    },
  ]
}

export function EidosFileRecordContextMenu({
  children,
  row,
  onOpen,
  onDelete,
  onError,
  extraActions,
  getActionRowIds,
  onDeleteRowIds,
  batchDeleteLimit,
  actionScope,
}: {
  children: ReactElement<HTMLAttributes<HTMLElement>>
  row: EidosFileRow
  onOpen?: (row: EidosFileRow) => void
  onDelete?: (row: EidosFileRow) => void
  onError?: (error: unknown) => void
  extraActions?: () => EidosFileCellAction[]
  /** Resolve stable selection identities when the menu opens. */
  getActionRowIds?: (row: EidosFileRow) => readonly string[]
  onDeleteRowIds?: (rowIds: readonly string[]) => void
  batchDeleteLimit?: number
  /** Changing the effective query/source dismisses stale action targets. */
  actionScope?: object
}) {
  const { translate: t, interactionMode } = useEidosFileUI()
  const undo = useEidosFileUndo()
  const [anchor, setAnchor] = useState<{
    current: { getBoundingClientRect(): DOMRect }
  } | null>(null)
  const anchorBounds = useRef<DOMRect>()
  const [actionRowIds, setActionRowIds] = useState<readonly string[]>([])
  const deleteLimitHintId = useId()
  const multiple = actionRowIds.length > 1
  const deleteLimitExceeded =
    batchDeleteLimit !== undefined && actionRowIds.length > batchDeleteLimit
  const capturedScope = useRef(actionScope)
  useEffect(() => setAnchor(null), [actionScope])
  const openAt = (x: number, y: number) => {
    capturedScope.current = actionScope
    const ids = getActionRowIds?.(row)
    setActionRowIds(
      ids?.includes(String(row._id)) ? [...new Set(ids)] : [String(row._id)]
    )
    // Virtualized rows can transform a fixed DOM anchor. Publish the viewport
    // bounds before opening so even a previously registered anchor reads them.
    const bounds = new DOMRect(x, y, 0, 0)
    anchorBounds.current = bounds
    setAnchor({
      current: {
        getBoundingClientRect: () => anchorBounds.current ?? bounds,
      },
    })
  }
  const dragging = useRef(false)
  const triggerRef = useRef<HTMLElement | null>(null)
  const fromKeyboard = useRef(false)
  const target = { ranges: null, rowId: String(row._id) }
  const open = anchor !== null
  const {
    actions,
    items: extensions,
    error,
  } = useEidosFileTableActions(target, open && !multiple)
  const close = () => setAnchor(null)
  const run = (action: () => void) => {
    close()
    if (capturedScope.current !== actionScope) return
    action()
  }
  const [openRecord, copyId, deleteRecord] = eidosFileRecordActions({
    rowId: row._id,
    count: multiple ? actionRowIds.length : 1,
    canDelete: multiple ? !!onDeleteRowIds && !deleteLimitExceeded : !!onDelete,
    onOpen: () => onOpen?.(row),
    onCopyId: (id) => {
      if (!navigator.clipboard?.writeText) {
        onError?.(new Error("Clipboard access is unavailable"))
        return
      }
      void navigator.clipboard
        .writeText(multiple ? actionRowIds.join("\n") : id)
        .catch((cause: unknown) => onError?.(cause))
    },
    onDelete: () => {
      fromKeyboard.current = false
      return multiple ? onDeleteRowIds?.(actionRowIds) : onDelete?.(row)
    },
    translate: t,
  })
  openRecord.disabled = !onOpen
  if (multiple) {
    copyId.title = t("Copy {count} record IDs", { count: actionRowIds.length })
    copyId.disabled = false
  }
  const closeAfterAction = (
    item: EidosFileCellAction
  ): EidosFileCellAction => ({
    ...item,
    run: () => run(item.run),
    children: item.children
      ? () => item.children!().map(closeAfterAction)
      : undefined,
  })
  const items = [
    ...(open && !multiple ? (extraActions?.() ?? []) : []),
    ...(!multiple ? [openRecord] : []),
    copyId,
    ...(!multiple ? extensions : []).map(
      (item): EidosFileCellAction => ({
        ...item,
        icon: item.icon ?? <Zap className="h-3.5 w-3.5" />,
        group: "extension",
        run: () => actions?.run(item.id, target),
      })
    ),
    deleteRecord,
  ].map(closeAfterAction)
  if (interactionMode === "mobile") return children
  return (
    <>
      {cloneElement(children, {
        onContextMenu: (event) => {
          children.props.onContextMenu?.(event)
          if (event.defaultPrevented) return
          event.preventDefault()
          event.stopPropagation()
          triggerRef.current = event.currentTarget
          fromKeyboard.current = false
          openAt(event.clientX, event.clientY)
        },
        onKeyDown: (event) => {
          children.props.onKeyDown?.(event)
          if (
            event.defaultPrevented ||
            !(
              event.key === "ContextMenu" ||
              (event.shiftKey && event.key === "F10")
            )
          )
            return
          event.preventDefault()
          event.stopPropagation()
          triggerRef.current =
            event.target instanceof HTMLElement
              ? event.target
              : event.currentTarget
          fromKeyboard.current = true
          const bounds = event.currentTarget.getBoundingClientRect()
          openAt(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)
        },
      })}
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (!next) close()
        }}
      >
        {anchor && <PopoverAnchor virtualRef={anchor} />}
        <PopoverContent
          data-eidos-file-record-menu=""
          role="menu"
          aria-describedby={deleteLimitExceeded ? deleteLimitHintId : undefined}
          aria-label={
            multiple
              ? t("Actions for {count} selected records", {
                  count: actionRowIds.length,
                })
              : t("Record actions")
          }
          align="start"
          sideOffset={2}
          className="max-h-[var(--radix-popover-content-available-height)] w-56 overflow-y-auto p-1 has-[[data-menu-reordering=true]]:w-[15.25rem]"
          onKeyDown={eidosFileMenuKeyDown}
          onEscapeKeyDown={(event) => {
            if (dragging.current) event.preventDefault()
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            if (fromKeyboard.current)
              triggerRef.current?.focus({ preventScroll: true })
            else undo?.onCloseAutoFocus(event)
          }}
        >
          <EidosFileCellActions
            items={items}
            open={open}
            onBlur={close}
            onDragStateChange={(value) => {
              dragging.current = value
            }}
          />
          {deleteLimitExceeded ? (
            <p
              id={deleteLimitHintId}
              className="px-2 pb-1 text-xs text-muted-foreground"
            >
              {t("Select {count} or fewer records to delete", {
                count: batchDeleteLimit,
              })}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="px-2 text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </PopoverContent>
      </Popover>
    </>
  )
}
