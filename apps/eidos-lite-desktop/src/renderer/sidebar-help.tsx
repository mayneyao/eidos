import { CircleHelp, FileText, MessageSquare } from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"

import { useEidosLiteI18n } from "./i18n"

export function SidebarHelp({
  onFeedback,
  onReleaseNotes,
}: {
  onFeedback(): void
  onReleaseNotes(): void
}) {
  const { t } = useEidosLiteI18n()
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    menu.current?.querySelector<HTMLButtonElement>("button")?.focus()
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

  const activate = (action: () => void) => {
    setOpen(false)
    trigger.current?.focus()
    action()
  }

  return (
    <div
      ref={container}
      className="sidebar-help"
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
      <button
        ref={trigger}
        type="button"
        className="sidebar-settings-button"
        data-sidebar-action="help"
        aria-label={t("Help")}
        title={t("Help")}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault()
            setOpen(true)
          }
        }}
      >
        <CircleHelp aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={menu}
          id={menuId}
          className="space-context-menu sidebar-help-menu"
          role="menu"
          aria-label={t("Help")}
          onKeyDown={(event) => {
            const buttons = Array.from(
              event.currentTarget.querySelectorAll<HTMLButtonElement>("button")
            )
            const index = buttons.indexOf(
              document.activeElement as HTMLButtonElement
            )
            let next: number
            if (event.key === "ArrowDown") next = (index + 1) % buttons.length
            else if (event.key === "ArrowUp")
              next = (index - 1 + buttons.length) % buttons.length
            else if (event.key === "Home") next = 0
            else if (event.key === "End") next = buttons.length - 1
            else return
            event.preventDefault()
            event.stopPropagation()
            buttons[next]?.focus()
          }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => activate(onFeedback)}
          >
            <MessageSquare aria-hidden="true" />
            {t("Send feedback")}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => activate(onReleaseNotes)}
          >
            <FileText aria-hidden="true" />
            {t("Release notes")}
          </button>
        </div>
      )}
    </div>
  )
}
