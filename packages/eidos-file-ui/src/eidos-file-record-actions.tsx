import {
  cloneElement,
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
}: {
  children: ReactElement<HTMLAttributes<HTMLElement>>
  row: EidosFileRow
  onOpen?: (row: EidosFileRow) => void
  onDelete?: (row: EidosFileRow) => void
  onError?: (error: unknown) => void
  extraActions?: () => EidosFileCellAction[]
}) {
  const { translate: t, interactionMode } = useEidosFileUI()
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null)
  // Virtualized rows use transforms/containment, which change the containing
  // block of a DOM fixed anchor. Pointer coordinates are already viewport-based.
  const anchorRef = useRef({
    getBoundingClientRect: () => new DOMRect(),
  })
  anchorRef.current = {
    getBoundingClientRect: () =>
      new DOMRect(point?.x ?? 0, point?.y ?? 0, 0, 0),
  }
  const dragging = useRef(false)
  const triggerRef = useRef<HTMLElement | null>(null)
  const fromKeyboard = useRef(false)
  const target = { ranges: null, rowId: String(row._id) }
  const open = point !== null
  const {
    actions,
    items: extensions,
    error,
  } = useEidosFileTableActions(target, open)
  const close = () => setPoint(null)
  const run = (action: () => void) => {
    close()
    action()
  }
  const [openRecord, copyId, deleteRecord] = eidosFileRecordActions({
    rowId: row._id,
    canDelete: !!onDelete,
    onOpen: () => onOpen?.(row),
    onCopyId: (id) => {
      if (!navigator.clipboard?.writeText) {
        onError?.(new Error("Clipboard access is unavailable"))
        return
      }
      void navigator.clipboard
        .writeText(id)
        .catch((cause: unknown) => onError?.(cause))
    },
    onDelete: () => onDelete?.(row),
    translate: t,
  })
  openRecord.disabled = !onOpen
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
    ...(open ? (extraActions?.() ?? []) : []),
    openRecord,
    copyId,
    ...extensions.map(
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
          setPoint({ x: event.clientX, y: event.clientY })
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
          setPoint({
            x: bounds.left + bounds.width / 2,
            y: bounds.top + bounds.height / 2,
          })
        },
      })}
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (!next) close()
        }}
      >
        <PopoverAnchor virtualRef={anchorRef} />
        <PopoverContent
          data-eidos-file-record-menu=""
          role="menu"
          aria-label={t("Record actions")}
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
