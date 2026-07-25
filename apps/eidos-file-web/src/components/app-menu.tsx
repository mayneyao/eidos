import { Check, ChevronDown, type LucideIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"

export interface AppMenuItem {
  id: string
  label: string
  icon?: LucideIcon
  hint?: string
  checked?: boolean
  disabled?: boolean
  onSelect: () => void
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
  /** Panel edge aligned to the trigger: "start" (default) or "end". */
  align?: "start" | "end"
}

/**
 * Small dropdown menu in the visual language of the editor toolbar. Renders
 * items only while open so closed menus never duplicate accessible names of
 * actions that also exist on the page.
 */
export function AppMenu({ label, sections, disabled, align }: AppMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    rootRef.current
      ?.querySelector<HTMLButtonElement>(".app-menu-item:not(:disabled)")
      ?.focus()

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      setOpen(false)
      rootRef.current
        ?.querySelector<HTMLButtonElement>(".app-menu-trigger")
        ?.focus()
    }
    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [open])

  return (
    <div className="app-menu" ref={rootRef}>
      <button
        className="toolbar-button app-menu-trigger"
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{label}</span>
        <ChevronDown
          size={13}
          aria-hidden="true"
          className={open ? "is-open" : undefined}
        />
      </button>

      {open ? (
        <div
          className={`app-menu-panel${align === "end" ? " align-end" : ""}`}
          role="menu"
          aria-label={label}
        >
          {sections.map((section, sectionIndex) => (
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
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={() => {
                    setOpen(false)
                    item.onSelect()
                  }}
                >
                  <span className="app-menu-check" aria-hidden="true">
                    {item.checked ? <Check size={13} /> : null}
                  </span>
                  {item.icon ? (
                    <item.icon size={14} aria-hidden="true" />
                  ) : null}
                  <span className="app-menu-label">{item.label}</span>
                  {item.hint ? (
                    <span className="app-menu-hint" aria-hidden="true">
                      {item.hint}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
