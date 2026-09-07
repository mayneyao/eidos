import {
  useEffect,
  useRef,
  useState,
  type RefObject,
  type ReactNode,
} from "react"
import { X, MoreHorizontal, Search } from "lucide-react"
import { useEidosLiteI18n } from "./i18n"
import type { TextSearchOptions } from "../shared/text-search"

export function WorkspaceHeading({
  name,
  path,
  searching,
  searchRef,
  shortcut,
  ariaShortcut,
  onSearch,
  onBack,
  query,
  onQueryChange,
  focusToken,
  options = {},
  onOptionsChange,
  actions,
}: {
  name: string
  path: string
  searching: boolean
  searchRef: RefObject<HTMLButtonElement>
  shortcut: string
  ariaShortcut?: string
  onSearch(): void
  onBack(): void
  query: string
  onQueryChange(query: string): void
  focusToken: number
  options?: TextSearchOptions
  onOptionsChange?: (options: TextSearchOptions) => void
  actions: {
    label: string
    icon: ReactNode
    disabled?: boolean
    shortcut?: string
    ariaShortcut?: string
    run(): void
  }[]
}) {
  const { t } = useEidosLiteI18n()
  const [menuOpen, setMenuOpen] = useState(false)
  const menu = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!searching) return
    input.current?.focus({ preventScroll: true })
    input.current?.select()
  }, [searching, focusToken])
  useEffect(() => {
    if (!menuOpen) return
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menu.current?.contains(event.target))
        setMenuOpen(false)
    }
    document.addEventListener("pointerdown", closeOutside, true)
    return () => document.removeEventListener("pointerdown", closeOutside, true)
  }, [menuOpen])
  useEffect(() => setMenuOpen(false), [searching])
  return (
    <div className="space-heading">
      {searching ? (
        <div
          className="workspace-heading-search"
          role="search"
          onKeyDown={(event) => {
            if (event.key === "Escape" && !event.nativeEvent.isComposing) {
              event.preventDefault()
              event.stopPropagation()
              onBack()
            }
          }}
        >
          <div className="workspace-heading-search-field">
            <input
              ref={input}
              type="text"
              value={query}
              maxLength={512}
              aria-label={t("Search saved text")}
              placeholder={t("Search saved text")}
              onChange={(event) => onQueryChange(event.target.value)}
            />
            <div className="workspace-search-modes">
              {(
                [
                  ["caseSensitive", "Aa", "Match case"],
                  ["wholeWord", "ab", "Match whole word"],
                  ["regex", ".*", "Use regular expression"],
                ] as const
              ).map(([key, label, title]) => (
                <button
                  key={key}
                  type="button"
                  aria-label={t(title)}
                  title={t(title)}
                  aria-pressed={!!options[key]}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() =>
                    onOptionsChange?.({ ...options, [key]: !options[key] })
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onBack}
            aria-label={t("Close search")}
            title={`${t("Close search")} (Esc)`}
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <>
          <strong title={path}>{name}</strong>
          <button
            ref={searchRef}
            type="button"
            className="icon-button"
            onClick={onSearch}
            aria-label={t("Search Space text")}
            aria-keyshortcuts={ariaShortcut}
            title={
              shortcut
                ? `${t("Search Space text")} (${shortcut})`
                : t("Search Space text")
            }
          >
            <Search size={14} />
          </button>
          <div
            className="workspace-heading-menu"
            ref={menu}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget))
                setMenuOpen(false)
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape" && menuOpen) {
                event.preventDefault()
                event.stopPropagation()
                setMenuOpen(false)
                trigger.current?.focus({ preventScroll: true })
              }
            }}
          >
            <button
              ref={trigger}
              type="button"
              className="icon-button"
              aria-label={t("Space file actions")}
              title={t("Space file actions")}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <MoreHorizontal size={14} />
            </button>
            {menuOpen ? (
              <div
                className="workspace-heading-menu-content"
                role="group"
                aria-label={t("Space file actions")}
              >
                {actions.map((action) => (
                  <button
                    type="button"
                    key={action.label}
                    disabled={action.disabled}
                    aria-keyshortcuts={action.ariaShortcut}
                    title={
                      action.shortcut
                        ? `${action.label} (${action.shortcut})`
                        : action.label
                    }
                    onClick={() => {
                      setMenuOpen(false)
                      trigger.current?.focus({ preventScroll: true })
                      action.run()
                    }}
                  >
                    {action.icon}
                    {action.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  )
}
