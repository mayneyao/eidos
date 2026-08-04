import {
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  type HTMLAttributes,
  type ReactNode,
} from "react"
import type {
  EidosFileTableInfo,
  EidosFileViewInfo,
} from "@eidos.space/eidos-file"
import {
  ChevronLeft,
  ChevronRight,
  GripVertical,
  LayoutGrid,
  Puzzle,
  SquareKanban,
  Table2,
} from "lucide-react"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

import { useEidosFileUI } from "./context"
import { cn } from "./lib/cn"
import {
  createEidosFilePluginRegistry,
  type EidosFilePlugin,
  type EidosFileViewPluginContribution,
} from "./plugin"
import { Button } from "./ui/primitives"
import { SortableContainer } from "./ui/sortable"
import { useEidosFileTabStrip } from "./use-eidos-file-tab-strip"

export { exportEidosFileViewCsv } from "./eidos-file-csv-export"
export type {
  EidosFileViewCsvExport,
  ExportEidosFileViewCsvOptions,
} from "./eidos-file-csv-export"

export const EidosFileEditorRoot = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(function EidosFileEditorRoot({ className, ...props }, ref) {
  const { themeName } = useEidosFileUI()
  return (
    <div
      {...props}
      ref={ref}
      className={cn(
        "eidos-file-root relative flex h-full min-h-0 flex-col bg-background",
        className
      )}
      data-eidos-file-root=""
      data-theme={themeName}
    />
  )
})
EidosFileEditorRoot.displayName = "EidosFileEditorRoot"

export const EidosFileEditorWorkbar = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-eidos-file-workbar
    className={cn(
      "eidos-file-workbar eidos-shell-workbar flex shrink-0 items-end border-b bg-muted/15 px-2",
      className
    )}
    {...props}
  />
))
EidosFileEditorWorkbar.displayName = "EidosFileEditorWorkbar"

export const EidosFileEditorContent = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("relative min-h-0 flex-1", className)}
    {...props}
  />
))
EidosFileEditorContent.displayName = "EidosFileEditorContent"

export function EidosFileViewTypeIcon({
  type,
  className,
  viewTypes,
}: {
  type: string
  className?: string
  viewTypes?: Readonly<Record<string, EidosFileViewPluginContribution>>
}) {
  const PluginIcon = viewTypes?.[type]?.icon
  if (PluginIcon) return <PluginIcon className={className} />
  // Keep the historical icons readable for saved views even when the plugin
  // is not installed in this host.
  if (type === "gallery") return <LayoutGrid className={className} />
  if (type === "kanban") return <SquareKanban className={className} />
  if (!type || type === "grid") return <Table2 className={className} />
  return <Puzzle className={className} />
}

function EidosFileSortableTab({
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
  const transform = sortable.transform
    ? { ...sortable.transform, scaleX: 1, scaleY: 1 }
    : null
  return (
    <div
      ref={sortable.setNodeRef}
      data-eidos-file-sortable-tab={id}
      className={cn(
        "group/sortable-tab flex shrink-0 items-stretch",
        sortable.isDragging && "z-10 bg-background shadow-sm"
      )}
      style={{
        opacity: sortable.isDragging ? 0.72 : 1,
        transform: CSS.Transform.toString(transform),
        transition: sortable.transition,
      }}
    >
      {!disabled ? (
        <button
          ref={sortable.setActivatorNodeRef}
          type="button"
          data-eidos-file-reorder-handle
          className="flex w-5 shrink-0 cursor-grab items-center justify-center text-muted-foreground/50 outline-hidden hover:text-muted-foreground focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring active:cursor-grabbing"
          aria-label={label}
          {...sortable.attributes}
          {...sortable.listeners}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      ) : null}
      {children}
    </div>
  )
}

export function EidosFileViewTabStrip({
  views,
  activeViewId,
  disabled,
  plugins = [],
  afterTabs,
  onSelect,
  onReorder,
  renderTab,
}: {
  views: EidosFileViewInfo[]
  activeViewId?: string | null
  disabled?: boolean
  plugins?: readonly EidosFilePlugin[]
  afterTabs?: ReactNode
  onSelect: (viewId: string) => void
  onReorder?: (viewIds: string[]) => Promise<void> | void
  renderTab?: (view: EidosFileViewInfo, tab: ReactNode) => ReactNode
}) {
  const { translate: t } = useEidosFileUI()
  const pluginRegistry = useMemo(
    () => createEidosFilePluginRegistry(plugins),
    [plugins]
  )
  const {
    activeTabRef,
    canScrollBackward,
    canScrollForward,
    navigateTabs,
    scrollTabs,
    tabStopId,
    updateScrollState,
    viewportRef,
  } = useEidosFileTabStrip({ items: views, activeId: activeViewId, onSelect })

  return (
    <div
      data-eidos-file-view-tabs
      className="flex h-[var(--eidos-file-view-tab-height,2.25rem)] min-w-0 flex-1 items-stretch self-end"
    >
      {canScrollBackward ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-full w-6 shrink-0 text-muted-foreground"
          aria-label={t("Scroll Eidos File views backward")}
          disabled={disabled}
          onClick={() => scrollTabs(-1)}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
      ) : null}
      <div
        ref={viewportRef}
        data-eidos-file-view-tabs-viewport
        className="h-full min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={updateScrollState}
      >
        <SortableContainer
          items={views}
          orientation="horizontal"
          disabled={Boolean(disabled) || !onReorder}
          onReorder={(next) => onReorder?.(next.map((view) => view.id))}
          className="flex h-full min-w-max items-stretch"
          containerProps={{
            role: "tablist",
            "aria-label": t("Eidos File views"),
            "aria-orientation": "horizontal",
          }}
          renderItem={(view, index) => {
            const tab = (
              <button
                ref={view.id === activeViewId ? activeTabRef : undefined}
                type="button"
                role="tab"
                data-eidos-file-view-id={view.id}
                aria-selected={view.id === activeViewId}
                tabIndex={view.id === tabStopId ? 0 : -1}
                disabled={disabled}
                onClick={() => onSelect(view.id)}
                onKeyDown={(event) => navigateTabs(event, index)}
                className={cn(
                  "relative flex h-full max-w-48 shrink-0 items-center gap-1.5 px-3 text-[13px] text-muted-foreground outline-hidden hover:text-foreground focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-50",
                  view.id === activeViewId && "text-foreground"
                )}
              >
                <EidosFileViewTypeIcon
                  type={view.type}
                  className="h-3.5 w-3.5 shrink-0"
                  viewTypes={pluginRegistry.views}
                />
                <span className="truncate">{view.name}</span>
                {view.id === activeViewId ? (
                  <span className="absolute inset-x-2 bottom-0 h-0.5 bg-primary" />
                ) : null}
              </button>
            )
            return (
              <EidosFileSortableTab
                id={view.id}
                label={t("Reorder {name} view", { name: view.name })}
                disabled={Boolean(disabled) || !onReorder}
              >
                {renderTab ? renderTab(view, tab) : tab}
              </EidosFileSortableTab>
            )
          }}
        />
      </div>
      {canScrollForward ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-full w-6 shrink-0 text-muted-foreground"
          aria-label={t("Scroll Eidos File views forward")}
          disabled={disabled}
          onClick={() => scrollTabs(1)}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      ) : null}
      {afterTabs}
    </div>
  )
}

export function EidosFileSheetTabStrip({
  tables,
  activeTableId,
  disabled,
  status,
  createAction,
  onSelect,
  onReorder,
  renderTab,
}: {
  tables: EidosFileTableInfo[]
  activeTableId: string | null
  disabled?: boolean
  status?: ReactNode
  createAction?: ReactNode
  onSelect: (tableId: string) => void
  onReorder?: (tableIds: string[]) => Promise<void> | void
  renderTab?: (table: EidosFileTableInfo, tab: ReactNode) => ReactNode
}) {
  const { translate: t } = useEidosFileUI()
  const createActionRef = useRef<HTMLDivElement>(null)
  const lastTableId = tables.at(-1)?.id
  const {
    activeTabRef,
    canScrollBackward,
    canScrollForward,
    navigateTabs,
    scrollTabs,
    tabStopId,
    updateScrollState,
    viewportRef,
  } = useEidosFileTabStrip({ items: tables, activeId: activeTableId, onSelect })

  useEffect(() => {
    if (activeTableId !== lastTableId) return
    createActionRef.current?.scrollIntoView?.({
      block: "nearest",
      inline: "nearest",
    })
  }, [activeTableId, lastTableId, tables.length])

  return (
    <footer
      data-eidos-file-sheet-tabs
      className="eidos-shell-statusbar flex shrink-0 items-stretch border-t bg-muted/20"
    >
      {canScrollBackward ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-full w-6 shrink-0 rounded-none border-r text-muted-foreground"
          aria-label={t("Scroll Eidos File tables backward")}
          disabled={disabled}
          onClick={() => scrollTabs(-1)}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
      ) : null}
      <div
        ref={viewportRef}
        data-eidos-file-sheet-tabs-viewport
        className="flex min-w-0 flex-1 items-stretch overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={updateScrollState}
      >
        <SortableContainer
          items={tables}
          orientation="horizontal"
          disabled={Boolean(disabled) || !onReorder}
          onReorder={(next) => onReorder?.(next.map((table) => table.id))}
          className="flex shrink-0 items-stretch"
          containerProps={{
            role: "tablist",
            "aria-label": t("Eidos File tables"),
            "aria-orientation": "horizontal",
            "aria-keyshortcuts": "Control+PageUp Control+PageDown",
          }}
          renderItem={(table, index) => {
            const tab = (
              <button
                ref={table.id === activeTableId ? activeTabRef : undefined}
                key={table.id}
                type="button"
                role="tab"
                data-eidos-file-table-id={table.id}
                aria-selected={table.id === activeTableId}
                tabIndex={table.id === tabStopId ? 0 : -1}
                disabled={disabled}
                onClick={() => onSelect(table.id)}
                onKeyDown={(event) => navigateTabs(event, index)}
                className={cn(
                  "relative flex h-full max-w-48 shrink-0 items-center gap-1.5 px-3 text-[13px] text-muted-foreground outline-hidden hover:text-foreground focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-50",
                  table.id === activeTableId && "text-foreground"
                )}
              >
                <Table2 className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{table.name}</span>
                {table.id === activeTableId ? (
                  <span className="absolute inset-x-2 top-0 h-0.5 bg-primary" />
                ) : null}
              </button>
            )
            return (
              <EidosFileSortableTab
                id={table.id}
                label={t("Reorder {name} table", { name: table.name })}
                disabled={Boolean(disabled) || !onReorder}
              >
                {renderTab ? renderTab(table, tab) : tab}
              </EidosFileSortableTab>
            )
          }}
        />
        {createAction ? (
          <div
            ref={createActionRef}
            data-eidos-file-sheet-create-action
            className="flex shrink-0 items-stretch"
          >
            {createAction}
          </div>
        ) : null}
      </div>
      {canScrollForward ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-full w-6 shrink-0 rounded-none border-l text-muted-foreground"
          aria-label={t("Scroll Eidos File tables forward")}
          disabled={disabled}
          onClick={() => scrollTabs(1)}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      ) : null}
      {status ? (
        <div
          data-eidos-file-sheet-status
          className="flex shrink-0 items-center border-l px-2.5 text-[11px] text-muted-foreground"
        >
          {status}
        </div>
      ) : null}
    </footer>
  )
}
