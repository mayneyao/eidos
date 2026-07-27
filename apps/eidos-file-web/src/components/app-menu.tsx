import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from "lucide-react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"

const DESKTOP_FLYOUT_QUERY =
  "(min-width: 48rem) and (hover: hover) and (pointer: fine)"

function useDesktopFlyout(): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window.matchMedia === "function"
      ? window.matchMedia(DESKTOP_FLYOUT_QUERY).matches
      : false
  )

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return
    const query = window.matchMedia(DESKTOP_FLYOUT_QUERY)
    const update = () => setMatches(query.matches)
    update()
    query.addEventListener("change", update)
    return () => query.removeEventListener("change", update)
  }, [])

  return matches
}

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
  const [flyoutPosition, setFlyoutPosition] = useState<{
    left: number
    top: number
  } | null>(null)
  const desktopFlyout = useDesktopFlyout()
  const rootRef = useRef<HTMLDivElement>(null)
  const rootPanelRef = useRef<HTMLDivElement>(null)
  const flyoutPanelRef = useRef<HTMLDivElement>(null)
  const submenuTriggerRefs = useRef(new Map<string, HTMLButtonElement>())
  const activeSubmenuItem = sections
    .flatMap((section) => section.items)
    .find((item) => item.id === activeSubmenuId && item.submenu)
  const displayedSections =
    !desktopFlyout && activeSubmenuItem ? activeSubmenuItem.submenu! : sections

  const focusFirstItem = (scope: HTMLElement | null) => {
    requestAnimationFrame(() =>
      scope
        ?.querySelector<HTMLButtonElement>(".app-menu-item:not(:disabled)")
        ?.focus()
    )
  }

  const openSubmenu = (itemId: string, moveFocus: boolean) => {
    setActiveSubmenuId(itemId)
    if (moveFocus) {
      requestAnimationFrame(() =>
        focusFirstItem(
          desktopFlyout ? flyoutPanelRef.current : rootPanelRef.current
        )
      )
    }
  }

  const closeSubmenu = (restoreFocus = false) => {
    const previousId = activeSubmenuId
    setActiveSubmenuId(null)
    setFlyoutPosition(null)
    if (restoreFocus && previousId) {
      requestAnimationFrame(() =>
        submenuTriggerRefs.current.get(previousId)?.focus()
      )
    }
  }

  useEffect(() => {
    if (open) focusFirstItem(rootPanelRef.current)
  }, [open])

  useEffect(() => {
    if (!open) return
    const closeMenu = () => {
      setOpen(false)
      setActiveSubmenuId(null)
      setFlyoutPosition(null)
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) closeMenu()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" && activeSubmenuId) {
        event.preventDefault()
        closeSubmenu(true)
      } else if (event.key === "Escape") {
        event.preventDefault()
        if (activeSubmenuId) closeSubmenu(true)
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

  useLayoutEffect(() => {
    if (!open || !desktopFlyout || !activeSubmenuId) {
      setFlyoutPosition(null)
      return
    }

    const updatePosition = () => {
      const root = rootRef.current
      const rootPanel = rootPanelRef.current
      const flyout = flyoutPanelRef.current
      const trigger = submenuTriggerRefs.current.get(activeSubmenuId)
      if (!root || !rootPanel || !flyout || !trigger) return

      const margin = 8
      const gap = 4
      const rootRect = root.getBoundingClientRect()
      const rootPanelRect = rootPanel.getBoundingClientRect()
      const triggerRect = trigger.getBoundingClientRect()
      const flyoutRect = flyout.getBoundingClientRect()
      const opensRight =
        rootPanelRect.right + gap + flyoutRect.width <=
        window.innerWidth - margin
      const viewportLeft = opensRight
        ? rootPanelRect.right + gap
        : Math.max(margin, rootPanelRect.left - gap - flyoutRect.width)
      const viewportTop = Math.min(
        Math.max(margin, triggerRect.top - 4),
        Math.max(margin, window.innerHeight - margin - flyoutRect.height)
      )
      setFlyoutPosition({
        left: viewportLeft - rootRect.left,
        top: viewportTop - rootRect.top,
      })
    }

    updatePosition()
    const rootPanel = rootPanelRef.current
    window.addEventListener("resize", updatePosition)
    window.addEventListener("scroll", updatePosition, true)
    rootPanel?.addEventListener("scroll", updatePosition)
    return () => {
      window.removeEventListener("resize", updatePosition)
      window.removeEventListener("scroll", updatePosition, true)
      rootPanel?.removeEventListener("scroll", updatePosition)
    }
  }, [activeSubmenuId, desktopFlyout, open])

  const renderSections = (menuSections: AppMenuSection[], inFlyout = false) =>
    menuSections.map((section, sectionIndex) => {
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
              ref={(node) => {
                if (!item.submenu || inFlyout) return
                if (node) submenuTriggerRefs.current.set(item.id, node)
                else submenuTriggerRefs.current.delete(item.id)
              }}
              className="app-menu-item"
              type="button"
              role={item.checked === undefined ? "menuitem" : "menuitemradio"}
              aria-checked={
                item.checked === undefined ? undefined : item.checked
              }
              aria-haspopup={item.submenu ? "menu" : undefined}
              aria-expanded={
                item.submenu ? activeSubmenuId === item.id : undefined
              }
              disabled={item.disabled}
              onPointerEnter={() => {
                if (!desktopFlyout || inFlyout) return
                if (item.submenu) openSubmenu(item.id, false)
                else if (activeSubmenuId) closeSubmenu()
              }}
              onFocus={() => {
                if (
                  desktopFlyout &&
                  !inFlyout &&
                  !item.submenu &&
                  activeSubmenuId
                ) {
                  closeSubmenu()
                }
              }}
              onKeyDown={(event) => {
                if (item.submenu && event.key === "ArrowRight") {
                  event.preventDefault()
                  openSubmenu(item.id, true)
                } else if (inFlyout && event.key === "ArrowLeft") {
                  event.preventDefault()
                  closeSubmenu(true)
                }
              }}
              onClick={() => {
                if (item.submenu) {
                  openSubmenu(item.id, true)
                  return
                }
                setOpen(false)
                setActiveSubmenuId(null)
                setFlyoutPosition(null)
                item.onSelect?.()
              }}
            >
              {showChecks ? (
                <span className="app-menu-check" aria-hidden="true">
                  {item.checked ? <Check size={13} /> : null}
                </span>
              ) : null}
              {item.icon ? <item.icon size={14} aria-hidden="true" /> : null}
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
    })

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
          ref={rootPanelRef}
          role="menu"
          aria-label={label}
        >
          {!desktopFlyout && activeSubmenuItem ? (
            <>
              <button
                className="app-menu-item app-menu-back"
                type="button"
                role="menuitem"
                onClick={() => closeSubmenu(true)}
              >
                <ChevronLeft size={14} aria-hidden="true" />
                <span className="app-menu-label">
                  {submenuBackLabel ?? label}
                </span>
              </button>
              <div className="app-menu-divider" role="separator" />
            </>
          ) : null}
          {renderSections(displayedSections)}
        </div>
      ) : null}
      {open && desktopFlyout && activeSubmenuItem ? (
        <div
          className="app-menu-panel app-menu-submenu-panel"
          ref={flyoutPanelRef}
          role="menu"
          aria-label={activeSubmenuItem.label}
          data-positioned={flyoutPosition ? "true" : "false"}
          style={
            flyoutPosition
              ? {
                  left: `${flyoutPosition.left}px`,
                  top: `${flyoutPosition.top}px`,
                }
              : undefined
          }
        >
          {renderSections(activeSubmenuItem.submenu!, true)}
        </div>
      ) : null}
    </div>
  )
}
