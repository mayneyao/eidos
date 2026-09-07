import {
  useEffect,
  useRef,
  useState,
  type RefObject,
  type ReactNode,
} from "react"
import { ArrowLeft, MoreHorizontal, Search } from "lucide-react"
import { useEidosLiteI18n } from "./i18n"

export function WorkspaceHeading({
  name,
  path,
  searching,
  searchRef,
  shortcut,
  ariaShortcut,
  onSearch,
  onBack,
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
  actions: { label: string; icon: ReactNode; disabled?: boolean; run(): void }[]
}) {
  const { t } = useEidosLiteI18n()
  const [menuOpen, setMenuOpen] = useState(false)
  const menu = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
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
        <>
          <button
            type="button"
            className="icon-button"
            onClick={onBack}
            aria-label={t("Back to files")}
            title={t("Back to files")}
          >
            <ArrowLeft size={14} />
          </button>
          <strong>{t("Search")}</strong>
          <span className="workspace-search-space-name" title={path}>
            {name}
          </span>
        </>
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
