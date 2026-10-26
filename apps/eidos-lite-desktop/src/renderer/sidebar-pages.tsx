import { useEffect, useLayoutEffect, useRef, useState } from "react"
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
  const [previewOrder, setPreviewOrder] = useState<string[] | null>(null)
  const rows = useRef(new Map<string, HTMLDivElement>())
  const previousPositions = useRef(new Map<string, number>())
  const animations = useRef(new Map<string, Animation>())
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
    ...new Set([...(previewOrder ?? order), ...pages.map((page) => page.key)]),
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
  useLayoutEffect(() => {
    for (const [key, row] of rows.current) {
      animations.current.get(key)?.cancel()
      const top = row.getBoundingClientRect().top
      const previous = previousPositions.current.get(key)
      if (
        previous !== undefined &&
        previous !== top &&
        row.animate &&
        !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      ) {
        animations.current.set(
          key,
          row.animate(
            [
              { transform: `translateY(${previous - top}px)` },
              { transform: "translateY(0)" },
            ],
            { duration: 160, easing: "cubic-bezier(0.2, 0, 0, 1)" }
          )
        )
      }
    }
    previousPositions.current.clear()
    if (keyboardOrder.current && dragging) {
      rows.current
        .get(dragging)
        ?.querySelector<HTMLButtonElement>(".sidebar-page-drag")
        ?.focus({ preventScroll: true })
    }
  }, [order, previewOrder])
  useEffect(
    () => () => {
      for (const animation of animations.current.values()) animation.cancel()
    },
    []
  )
  function capturePositions() {
    previousPositions.current = new Map(
      [...rows.current].map(([key, row]) => [
        key,
        row.getBoundingClientRect().top,
      ])
    )
  }
  function move(source: string, target: string, preview = false) {
    const next = ordered.map((page) => page.key)
    const from = next.indexOf(source),
      to = next.indexOf(target)
    if (from < 0 || to < 0 || from === to) return next
    next.splice(from, 1)
    next.splice(to, 0, source)
    capturePositions()
    if (preview) setPreviewOrder(next)
    else saveOrder(next)
    return next
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
        if (dragging) return
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
              ref={(element) => {
                if (element) rows.current.set(page.key, element)
                else rows.current.delete(page.key)
              }}
              data-current={activePage === page.key || undefined}
              data-dragging={dragging === page.key || undefined}
              onDragOver={(event) => {
                if (!dragging || disabled) return
                event.preventDefault()
                event.dataTransfer.dropEffect = "move"
                const from = ordered.findIndex((item) => item.key === dragging)
                const rect = event.currentTarget.getBoundingClientRect()
                const midpoint = rect.top + rect.height / 2
                if (
                  (from < index && event.clientY >= midpoint) ||
                  (from > index && event.clientY <= midpoint)
                )
                  move(dragging, page.key, true)
              }}
              onDrop={(event) => {
                event.preventDefault()
                if (dragging && !disabled)
                  saveOrder(previewOrder ?? move(dragging, page.key, true))
                setPreviewOrder(null)
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
                  keyboardOrder.current = null
                  setPreviewOrder(null)
                  event.dataTransfer.effectAllowed = "move"
                  event.dataTransfer.setData("text/plain", page.key)
                }}
                onDragEnd={() => {
                  capturePositions()
                  setPreviewOrder(null)
                  setDragging(null)
                }}
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
                    if (keyboardOrder.current) {
                      capturePositions()
                      saveOrder(keyboardOrder.current)
                    }
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
                {page.icon ? (
                  <PluginIcon icon={page.icon} />
                ) : (
                  <FileText aria-hidden="true" />
                )}
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
