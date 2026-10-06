import { useEidosFileUI } from "./context"
import {
  Plus,
  Search,
  Table2,
  Puzzle,
  ChevronDown,
  Check,
  GripVertical,
} from "lucide-react"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { SortableContainer } from "./ui/sortable"
import {
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
  type ElementType,
} from "react"
import { Popover, PopoverContent, PopoverTrigger } from "./ui/adaptive-popover"

export function MobileNewViewButton({
  options,
  disabled,
  onCreate,
}: {
  options: {
    type: string
    name: string
    pluginName?: string
    icon?: ElementType
    disabled?: boolean
  }[]
  disabled?: boolean
  onCreate(type: string): Promise<void>
}) {
  const t = useEidosFileUI().translate
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const pending = useRef(false)
  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        if (pending.current) return
        setOpen(value)
        setError("")
      }}
    >
      <PopoverTrigger asChild>
        <button
          aria-label={t("New view")}
          title={t("New view")}
          disabled={disabled || busy}
          className="mobile-create-view"
        >
          <Plus size={20} />
          <span>{t("New view")}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent aria-label={t("New view")}>
        <div className="eidos-mobile-view-config" aria-busy={busy}>
          {error && <p role="alert">{error}</p>}
          {[false, true].map((plugin) => {
            const entries = options.filter(
              (option) => option.type.startsWith("plugin:") === plugin
            )
            if (!entries.length) return null
            const title = plugin ? t("Plugin views") : t("Built-in views")
            return (
              <section
                key={title}
                aria-label={title}
                className="eidos-mobile-view-group"
              >
                <h3>{title}</h3>
                {entries.map(
                  ({
                    type,
                    name,
                    pluginName,
                    icon: Icon = plugin ? Puzzle : Table2,
                    disabled: unavailable,
                  }) => (
                    <button
                      key={type}
                      type="button"
                      data-create-view={type}
                      disabled={disabled || busy || unavailable}
                      className="flex w-full items-center gap-3 text-left"
                      onClick={async () => {
                        if (pending.current) return
                        pending.current = true
                        setBusy(true)
                        setError("")
                        try {
                          await onCreate(type)
                          setOpen(false)
                        } catch (cause) {
                          setError(
                            cause instanceof Error
                              ? cause.message
                              : String(cause)
                          )
                        } finally {
                          pending.current = false
                          setBusy(false)
                        }
                      }}
                    >
                      <Icon size={20} aria-hidden="true" />
                      <span className="flex min-w-0 flex-col">
                        <span>{name}</span>
                        {plugin && pluginName && (
                          <span className="text-xs text-muted-foreground">
                            {t("From {plugin}", { plugin: pluginName ?? "" })}
                          </span>
                        )}
                      </span>
                    </button>
                  )
                )}
              </section>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function MobileViewStrip({
  activeId,
  children,
}: {
  activeId?: string
  children: ReactNode
}) {
  const t = useEidosFileUI().translate
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const strip = ref.current
    const active = strip?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!strip || !active) return
    const reveal = () => {
      const bounds = strip.getBoundingClientRect()
      const selected = active.getBoundingClientRect()
      if (selected.right > bounds.right)
        strip.scrollLeft += selected.right - bounds.right
      else if (selected.left < bounds.left)
        strip.scrollLeft += selected.left - bounds.left
    }
    reveal()
    const resize = new ResizeObserver(reveal)
    resize.observe(strip)
    resize.observe(active)
    return () => resize.disconnect()
  }, [activeId])
  return (
    <div
      ref={ref}
      className="mobile-view-tabs"
      role="group"
      aria-label={t("Views")}
    >
      {children}
    </div>
  )
}

type MobileChoice = {
  id: string
  name: string
  type?: string
  icon?: ElementType
}

function MobileSortableChoice({
  item,
  selected,
  disabled,
  sortable,
  onSelect,
}: {
  item: MobileChoice
  selected: boolean
  disabled: boolean
  sortable: boolean
  onSelect(id: string): void
}) {
  const t = useEidosFileUI().translate
  const drag = useSortable({ id: item.id, disabled: disabled || !sortable })
  const Icon = item.icon ?? (item.type?.startsWith("plugin:") ? Puzzle : Table2)
  return (
    <div
      ref={drag.setNodeRef}
      className="mobile-sortable-choice"
      data-selected={selected}
      data-dragging={drag.isDragging}
      style={{
        transform: CSS.Transform.toString(
          drag.transform ? { ...drag.transform, x: 0 } : null
        ),
        transition: drag.transition,
        position: "relative",
        zIndex: drag.isDragging ? 1 : undefined,
      }}
    >
      {sortable && (
        <button
          ref={drag.setActivatorNodeRef}
          className="mobile-choice-handle"
          aria-label={t("Reorder: {name}", { name: item.name })}
          disabled={disabled}
          {...drag.attributes}
          {...drag.listeners}
        >
          <GripVertical size={20} aria-hidden="true" />
        </button>
      )}
      <button
        className="mobile-choice-select"
        aria-pressed={selected}
        disabled={disabled}
        onClick={() => onSelect(item.id)}
      >
        <Icon size={20} aria-hidden="true" />
        <span>{item.name}</span>
        {selected && <Check size={18} aria-hidden="true" />}
      </button>
    </div>
  )
}

function MobileOrderedChoices({
  items,
  activeId,
  disabled,
  onSelect,
  onReorder,
}: {
  items: MobileChoice[]
  activeId?: string
  disabled?: boolean
  onSelect(id: string): void
  onReorder?(ids: string[]): Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const pending = useRef(false)
  return (
    <>
      {error && <p role="alert">{error}</p>}
      <SortableContainer
        items={items}
        disabled={disabled || busy || !onReorder}
        onReorder={async (next) => {
          if (!onReorder || pending.current) return
          pending.current = true
          setBusy(true)
          setError("")
          try {
            await onReorder(next.map((item) => item.id))
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause))
            throw cause
          } finally {
            pending.current = false
            setBusy(false)
          }
        }}
        renderItem={(item) => (
          <MobileSortableChoice
            item={item}
            selected={item.id === activeId}
            disabled={Boolean(disabled || busy)}
            sortable={Boolean(onReorder && items.length > 1)}
            onSelect={onSelect}
          />
        )}
      />
    </>
  )
}

export function MobileViewSwitcher({
  views,
  activeId,
  disabled,
  onSelect,
  onReorder,
  children,
}: {
  views: MobileChoice[]
  activeId?: string
  disabled?: boolean
  onSelect(id: string): void
  onReorder?(ids: string[]): Promise<void>
  children: ReactNode
}) {
  const t = useEidosFileUI().translate
  const [open, setOpen] = useState(false)
  const current = views.find((view) => view.id === activeId)
  // Also close after creating a view in the nested creation page.
  useLayoutEffect(() => setOpen(false), [activeId])
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="mobile-view-switcher"
          aria-label={t("Switch view: {name}", {
            name: current?.name ?? t("Default grid"),
          })}
        >
          <span>{current?.name ?? t("Default grid")}</span>
          <ChevronDown size={16} aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent aria-label={t("Views")}>
        <div className="mobile-view-picker">
          <div role="group" aria-label={t("Switch view")}>
            {views.length ? (
              <MobileOrderedChoices
                items={views}
                activeId={activeId}
                disabled={disabled}
                onReorder={onReorder}
                onSelect={(id) => {
                  onSelect(id)
                  setOpen(false)
                }}
              />
            ) : (
              <p>{t("Default grid")}</p>
            )}
          </div>
          {children}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function MobileTableSwitcher({
  tables,
  activeId,
  disabled,
  onReorder,
}: {
  tables: { id: string; name: string }[]
  activeId?: string
  disabled?: boolean
  onReorder?(ids: string[]): Promise<void>
}) {
  const t = useEidosFileUI().translate
  const [open, setOpen] = useState(false)
  const name =
    tables.find((table) => table.id === activeId)?.name ?? t("Tables")
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="mobile-table-switcher"
          aria-label={t("Switch table: {name}", { name })}
          disabled={disabled}
        >
          <span>{name}</span>
          <ChevronDown size={16} aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent aria-label={t("Tables")}>
        <div className="mobile-view-picker">
          <div role="group" aria-label={t("Switch table")}>
            <MobileOrderedChoices
              items={tables}
              activeId={activeId}
              disabled={disabled}
              onReorder={onReorder}
              onSelect={(id) => {
                window.eidosSelectTable?.(id)
                setOpen(false)
              }}
            />
          </div>
          <button
            className="mobile-create-view"
            disabled={disabled}
            onClick={() => {
              setOpen(false)
              window.eidosManageTables?.("create")
            }}
          >
            <Plus size={20} />
            <span>{t("New table")}</span>
          </button>
          <button
            disabled={disabled || !activeId}
            onClick={() => {
              setOpen(false)
              window.eidosManageTables?.("edit")
            }}
          >
            <Table2 size={20} />
            <span>{t("Table settings")}</span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function MobileNewRecordButton(props: ComponentProps<"button">) {
  const t = useEidosFileUI().translate
  return (
    <button
      {...props}
      className={`mobile-new-record ${props.className ?? ""}`}
      aria-label={t("New record")}
      title={t("New record")}
    >
      <Plus size={20} />
    </button>
  )
}

export function MobileRecordSearch({
  value,
  onChange,
}: {
  value: string
  onChange(value: string): void
}) {
  const t = useEidosFileUI().translate
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button aria-label={t("Search records")} data-active={!!value}>
          <Search size={20} />
        </button>
      </PopoverTrigger>
      <PopoverContent aria-label={t("Search records")}>
        <form
          className="eidos-mobile-search"
          onSubmit={(event) => {
            event.preventDefault()
            setOpen(false)
          }}
        >
          <input
            aria-label={t("Search records")}
            placeholder={t("Search records")}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            enterKeyHint="search"
          />
          <div className="flex justify-between gap-2">
            <button
              type="button"
              disabled={!value}
              onClick={() => onChange("")}
            >
              {t("Clear search")}
            </button>
            <button type="submit">{t("View results")}</button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}
