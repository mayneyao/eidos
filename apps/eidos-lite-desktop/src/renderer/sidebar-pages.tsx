import { useEffect, useRef, useState } from "react"
import {
  FileText,
  GripVertical,
  MoreHorizontal,
  Pin,
  PinOff,
} from "lucide-react"
import { useEidosLiteI18n } from "./i18n"
import { PluginIcon, type PluginIconDefinition } from "./plugin-icon"

export function SidebarPages({
  pages,
  spaceId,
  activePage,
  disabled,
  onPage,
}: {
  pages: { key: string; title: string; icon?: PluginIconDefinition }[]
  spaceId: string
  activePage?: string | null
  disabled?: boolean
  onPage(key: string): void
}) {
  const { t } = useEidosLiteI18n()
  const storageKey = `eidos-lite:pinned-pages:${spaceId}`
  const [pinned, setPinned] = useState<string[]>(() => {
    try {
      const value: unknown = JSON.parse(
        localStorage.getItem(storageKey) ?? "[]"
      )
      return Array.isArray(value)
        ? value.filter((key): key is string => typeof key === "string")
        : []
    } catch {
      return []
    }
  })
  const orderKey = `eidos-lite:page-order:${spaceId}`
  const [order, setOrder] = useState<string[]>(() => {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(orderKey) ?? "[]")
      return Array.isArray(value)
        ? value.filter((key): key is string => typeof key === "string")
        : []
    } catch {
      return []
    }
  })
  const [dragging, setDragging] = useState<string | null>(null)
  const keyboardOrder = useRef<string[] | null>(null)
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !container.current?.contains(event.target)
      )
        setOpen(false)
    }
    document.addEventListener("pointerdown", outside, true)
    return () => document.removeEventListener("pointerdown", outside, true)
  }, [open])
  const byKey = new Map(pages.map((page) => [page.key, page]))
  const ordered = [
    ...new Set([...order, ...pages.map((page) => page.key)]),
  ].flatMap((key) => {
    const page = byKey.get(key)
    return page ? [page] : []
  })
  const activePins = pinned.filter((key) => byKey.has(key)).slice(0, 3)
  const visibleKeys = new Set(
    [...activePins, ...ordered.map((page) => page.key)]
      .filter((key, index, keys) => keys.indexOf(key) === index)
      .slice(0, 3)
  )
  const visible = ordered.filter((page) => visibleKeys.has(page.key))
  function saveOrder(next: string[]) {
    setOrder(next)
    try {
      localStorage.setItem(orderKey, JSON.stringify(next))
    } catch {
      /* Session-only fallback. */
    }
  }
  function move(source: string, target: string) {
    const next = ordered.map((page) => page.key)
    const from = next.indexOf(source),
      to = next.indexOf(target)
    if (from < 0 || to < 0 || from === to) return
    next.splice(from, 1)
    next.splice(to, 0, source)
    saveOrder(next)
  }
  function toggle(key: string) {
    if (!pinned.includes(key) && activePins.length >= 3) return
    const next = pinned.includes(key)
      ? pinned.filter((item) => item !== key)
      : [...pinned, key]
    setPinned(next)
    try {
      localStorage.setItem(storageKey, JSON.stringify(next))
    } catch {
      /* Keep the session usable when storage is unavailable. */
    }
  }
  return (
    <nav
      ref={container}
      className="sidebar-pages"
      aria-label={t("Plugin contributions")}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault()
          event.stopPropagation()
          setOpen(false)
          trigger.current?.focus()
        }
      }}
    >
      {visible.map((page) => (
        <button
          key={page.key}
          type="button"
          className="sidebar-page-button"
          title={page.title}
          aria-label={page.title}
          disabled={disabled}
          aria-current={activePage === page.key ? "page" : undefined}
          onClick={() => onPage(page.key)}
        >
          {page.icon ? (
            <PluginIcon icon={page.icon} />
          ) : (
            <FileText aria-hidden="true" />
          )}
          <span>{page.title}</span>
        </button>
      ))}
      {pages.length > 3 && (
        <button
          ref={trigger}
          type="button"
          className="icon-button"
          title={t("Pages")}
          aria-label={t("Pages")}
          aria-expanded={open}
          disabled={disabled}
          onClick={() => setOpen((value) => !value)}
        >
          <MoreHorizontal aria-hidden="true" />
        </button>
      )}
      {open && (
        <div
          className="sidebar-pages-popover"
          role="group"
          aria-label={t("Pages")}
        >
          {ordered.map((page, index) => (
            <div
              className="sidebar-pages-choice"
              key={page.key}
              data-dragging={dragging === page.key || undefined}
              onDragOver={(event) => {
                if (dragging && !disabled) event.preventDefault()
              }}
              onDrop={(event) => {
                event.preventDefault()
                if (dragging && !disabled) move(dragging, page.key)
                setDragging(null)
              }}
            >
              <button
                type="button"
                className="sidebar-page-drag"
                draggable={!disabled}
                disabled={disabled}
                aria-label={`${t("Reorder page")}: ${page.title}`}
                aria-pressed={dragging === page.key}
                title={t("Drag to reorder; Space to pick up, arrows to move")}
                onDragStart={(event) => {
                  setDragging(page.key)
                  event.dataTransfer.effectAllowed = "move"
                  event.dataTransfer.setData("text/plain", page.key)
                }}
                onDragEnd={() => setDragging(null)}
                onKeyDown={(event) => {
                  if (event.key === " " || event.key === "Enter") {
                    event.preventDefault()
                    if (dragging === page.key) {
                      setDragging(null)
                      keyboardOrder.current = null
                    } else {
                      keyboardOrder.current = ordered.map((item) => item.key)
                      setDragging(page.key)
                    }
                  } else if (
                    dragging === page.key &&
                    (event.key === "ArrowUp" || event.key === "ArrowDown")
                  ) {
                    event.preventDefault()
                    const target =
                      ordered[index + (event.key === "ArrowUp" ? -1 : 1)]
                    if (target) move(page.key, target.key)
                  } else if (dragging === page.key && event.key === "Escape") {
                    event.preventDefault()
                    event.stopPropagation()
                    if (keyboardOrder.current) saveOrder(keyboardOrder.current)
                    keyboardOrder.current = null
                    setDragging(null)
                  }
                }}
              >
                <GripVertical aria-hidden="true" />
              </button>
              <button
                className="sidebar-page-open"
                disabled={disabled}
                type="button"
                title={page.title}
                aria-current={activePage === page.key ? "page" : undefined}
                onClick={() => {
                  setOpen(false)
                  onPage(page.key)
                }}
              >
                <FileText aria-hidden="true" />
                <span>{page.title}</span>
              </button>
              <button
                type="button"
                aria-label={`${t(pinned.includes(page.key) ? "Unpin page" : "Pin page")}: ${page.title}`}
                title={t(
                  pinned.includes(page.key)
                    ? "Unpin page"
                    : activePins.length >= 3
                      ? "Up to three pages can be pinned"
                      : "Pin page"
                )}
                aria-pressed={pinned.includes(page.key)}
                disabled={
                  disabled ||
                  (!pinned.includes(page.key) && activePins.length >= 3)
                }
                onClick={() => toggle(page.key)}
              >
                {pinned.includes(page.key) ? (
                  <PinOff aria-hidden="true" />
                ) : (
                  <Pin aria-hidden="true" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </nav>
  )
}
