import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"

export interface AppMenuItem {
  id: string
  label: string
  icon?: LucideIcon
  hint?: string
  checked?: boolean
  disabled?: boolean
  submenu?: AppMenuSection[]
  onSelect?: () => void
}

export interface AppMenuSection {
  id: string
  label?: string
  items: AppMenuItem[]
}

interface AppMenuProps {
  label: string
  sections: AppMenuSection[]
  disabled?: boolean
  triggerIcon?: LucideIcon
  iconOnly?: boolean
  variant?: "default" | "menubar"
  submenuBackLabel?: string
  /** Panel edge aligned to the trigger: "start" (default) or "end". */
  align?: "start" | "end"
}

/**
 * Small dropdown menu in the visual language of the editor toolbar. Renders
 * items only while open so closed menus never duplicate accessible names of
 * actions that also exist on the page.
 */
export function AppMenu({
  label,
  sections,
  disabled,
  triggerIcon: TriggerIcon,
  iconOnly,
  variant = "default",
  submenuBackLabel,
  align,
}: AppMenuProps) {
  const [open, setOpen] = useState(false)
  const [activeSubmenuId, setActiveSubmenuId] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const activeSubmenuItem = sections
    .flatMap((section) => section.items)
    .find((item) => item.id === activeSubmenuId && item.submenu)
  const displayedSections = activeSubmenuItem?.submenu ?? sections

  useEffect(() => {
    if (!open) return
    rootRef.current
      ?.querySelector<HTMLButtonElement>(".app-menu-item:not(:disabled)")
      ?.focus()

    const closeMenu = () => {
      setOpen(false)
      setActiveSubmenuId(null)
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) closeMenu()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" && activeSubmenuId) {
        event.preventDefault()
        setActiveSubmenuId(null)
      } else if (event.key === "Escape") {
        event.preventDefault()
        if (activeSubmenuId) setActiveSubmenuId(null)
        else {
          closeMenu()
          rootRef.current
            ?.querySelector<HTMLButtonElement>(".app-menu-trigger")
            ?.focus()
        }
      }
    }
    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [activeSubmenuId, open])

  return (
    <div className={`app-menu app-menu-${variant}`} ref={rootRef}>
      <button
        className={`toolbar-button app-menu-trigger${iconOnly ? " app-menu-trigger-icon-only" : ""}`}
        type="button"
        aria-label={iconOnly ? label : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={disabled}
        title={iconOnly ? label : undefined}
        onClick={() => {
          if (open) setActiveSubmenuId(null)
          setOpen((current) => !current)
        }}
      >
        {TriggerIcon ? <TriggerIcon size={15} aria-hidden="true" /> : null}
        <span className={iconOnly ? "visually-hidden" : undefined}>
          {label}
        </span>
        {iconOnly || variant === "menubar" ? null : (
          <ChevronDown
            size={13}
            aria-hidden="true"
            className={open ? "is-open" : undefined}
          />
        )}
      </button>

      {open ? (
        <div
          className={`app-menu-panel${align === "end" ? " align-end" : ""}`}
          role="menu"
          aria-label={label}
        >
          {activeSubmenuItem ? (
            <>
              <button
                className="app-menu-item app-menu-back"
                type="button"
                role="menuitem"
                onClick={() => setActiveSubmenuId(null)}
              >
                <ChevronLeft size={14} aria-hidden="true" />
                <span className="app-menu-label">
                  {submenuBackLabel ?? label}
                </span>
              </button>
              <div className="app-menu-divider" role="separator" />
            </>
          ) : null}
          {displayedSections.map((section, sectionIndex) => {
            const showChecks = section.items.some(
              (item) => item.checked !== undefined
            )
            return (
              <div className="app-menu-section" key={section.id}>
                {sectionIndex > 0 ? (
                  <div className="app-menu-divider" role="separator" />
                ) : null}
                {section.label ? (
                  <p className="app-menu-heading">{section.label}</p>
                ) : null}
                {section.items.map((item) => (
                  <button
                    key={item.id}
                    className="app-menu-item"
                    type="button"
                    role={
                      item.checked === undefined ? "menuitem" : "menuitemradio"
                    }
                    aria-checked={
                      item.checked === undefined ? undefined : item.checked
                    }
                    aria-haspopup={item.submenu ? "menu" : undefined}
                    disabled={item.disabled}
                    onKeyDown={(event) => {
                      if (item.submenu && event.key === "ArrowRight") {
                        event.preventDefault()
                        setActiveSubmenuId(item.id)
                      }
                    }}
                    onClick={() => {
                      if (item.submenu) {
                        setActiveSubmenuId(item.id)
                        return
                      }
                      setOpen(false)
                      setActiveSubmenuId(null)
                      item.onSelect?.()
                    }}
                  >
                    {showChecks ? (
                      <span className="app-menu-check" aria-hidden="true">
                        {item.checked ? <Check size={13} /> : null}
                      </span>
                    ) : null}
                    {item.icon ? (
                      <item.icon size={14} aria-hidden="true" />
                    ) : null}
                    <span className="app-menu-label">{item.label}</span>
                    {item.submenu ? (
                      <ChevronRight
                        className="app-menu-submenu-chevron"
                        size={13}
                        aria-hidden="true"
                      />
                    ) : item.hint ? (
                      <span className="app-menu-hint" aria-hidden="true">
                        {item.hint}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
