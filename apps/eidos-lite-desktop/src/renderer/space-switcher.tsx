import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import {
  Check,
  ChevronDown,
  CloudDownload,
  FolderOpen,
  FolderPlus,
} from "lucide-react"
import type { RecentSpaceEntry } from "../shared/contracts"
import { useEidosLiteI18n } from "./i18n"

export function SpaceSwitcher({
  name,
  currentId,
  recents,
  disabled,
  onOpen,
  onNew,
  onRecent,
  onClone,
}: {
  name?: string
  currentId?: string
  recents: RecentSpaceEntry[]
  disabled?: boolean
  onOpen(): void
  onNew(): void
  onRecent(id: string): void
  onClone(): void
}) {
  const { t } = useEidosLiteI18n()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const container = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const byPath = new Map<string, RecentSpaceEntry>()
  for (const recent of recents) {
    if (!byPath.has(recent.path) || recent.id === currentId)
      byPath.set(recent.path, recent)
  }
  const uniqueRecents = [...byPath.values()]
  const term = query.trim().toLocaleLowerCase()
  const matchingRecents = uniqueRecents.filter((recent) =>
    `${recent.name}\n${recent.path}`.toLocaleLowerCase().includes(term)
  )
  useEffect(() => {
    if (!open) return
    const outside = (event: Event) => {
      if (
        event.target instanceof Node &&
        !container.current?.contains(event.target) &&
        !menu.current?.contains(event.target)
      )
        setOpen(false)
    }
    document.addEventListener("pointerdown", outside, true)
    document.addEventListener("focusin", outside)
    const close = () => setOpen(false)
    window.addEventListener("resize", close)
    if (search.current) search.current.focus()
    else
      menu.current
        ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
        ?.focus()
    return () => {
      document.removeEventListener("pointerdown", outside, true)
      document.removeEventListener("focusin", outside)
      window.removeEventListener("resize", close)
    }
  }, [open])
  const choose = (action: () => void) => {
    setOpen(false)
    trigger.current?.focus()
    action()
  }
  return (
    <div
      className="space-switcher"
      ref={container}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault()
          event.stopPropagation()
          setOpen(false)
          trigger.current?.focus()
        }
      }}
    >
      <button
        type="button"
        className="space-switcher-trigger"
        ref={trigger}
        disabled={disabled}
        aria-expanded={open}
        aria-label={t("Switch Space")}
        onClick={() => {
          const bounds = trigger.current!.getBoundingClientRect()
          setPosition({
            top: bounds.bottom + 4,
            left: Math.max(8, Math.min(bounds.left, window.innerWidth - 312)),
          })
          setQuery("")
          setOpen(!open)
        }}
      >
        <span>{name ?? t("Choose a Space")}</span>
        <ChevronDown />
      </button>
      {open &&
        // Escape the sidebar's paint containment and overflow clipping.
        createPortal(
          <div
            className="space-switcher-menu"
            ref={menu}
            style={{
              top: position.top,
              left: position.left,
              maxHeight: `min(32rem, ${Math.max(0, window.innerHeight - position.top - 12)}px)`,
            }}
            role="group"
            aria-label={t("Switch Space")}
          >
            {uniqueRecents.length > 0 && (
              <>
                <small>{t("Recent Spaces")}</small>
                <input
                  ref={search}
                  className="space-switcher-search"
                  type="search"
                  aria-label={t("Search Spaces")}
                  placeholder={t("Search Spaces")}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <div className="space-switcher-recents">
                  {matchingRecents.map((recent) => (
                    <button
                      type="button"
                      key={recent.id}
                      disabled={!recent.available || recent.id === currentId}
                      onClick={() => choose(() => onRecent(recent.id))}
                    >
                      <FolderOpen />
                      <span title={recent.path}>
                        <span className="space-switcher-name">
                          {recent.name}
                        </span>
                        <small>
                          {recent.available
                            ? recent.path
                            : t("Folder unavailable")}
                        </small>
                      </span>
                      {recent.id === currentId && <Check />}
                    </button>
                  ))}
                  {matchingRecents.length === 0 && (
                    <p className="space-switcher-empty" role="status">
                      {t("No matching Spaces")}
                    </p>
                  )}
                </div>
              </>
            )}
            <div className="space-switcher-actions">
              <button type="button" onClick={() => choose(onOpen)}>
                <FolderOpen />
                {t("Open Space")}
              </button>
              <button type="button" onClick={() => choose(onNew)}>
                <FolderPlus />
                {t("New Space")}
              </button>
              <button type="button" onClick={() => choose(onClone)}>
                <CloudDownload />
                {t("Open Synced Space")}
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
