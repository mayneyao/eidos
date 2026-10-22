import { CircleHelp, FileText, MessageSquare, RefreshCw } from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"

import type { EidosLiteUpdateStatus } from "../shared/contracts"
import { useEidosLiteI18n } from "./i18n"

export function SidebarHelp({
  onFeedback,
  onReleaseNotes,
  onCheckForUpdates,
  updateStatus,
}: {
  onFeedback(): void
  onReleaseNotes(): void
  onCheckForUpdates(): Promise<void> | void
  updateStatus?: EidosLiteUpdateStatus | null
}) {
  const { t } = useEidosLiteI18n()
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const [requestedCheck, setRequestedCheck] = useState(false)
  const [checking, setChecking] = useState(false)
  const [checkError, setCheckError] = useState<string | null>(null)
  const pendingCheck = useRef(false)
  const checkBusy = checking || updateStatus?.state === "checking"

  const checkForUpdates = async () => {
    if (pendingCheck.current || checkBusy) return
    pendingCheck.current = true
    setRequestedCheck(true)
    setChecking(true)
    setCheckError(null)
    try {
      await onCheckForUpdates()
    } catch (cause) {
      setCheckError(
        cause instanceof Error
          ? cause.message
          : t("Could not check for updates. Try again later.")
      )
    } finally {
      pendingCheck.current = false
      setChecking(false)
    }
  }
  const updateCopy = (() => {
    if (!requestedCheck) return null
    if (checkError) return checkError
    if (checkBusy) return t("Checking for updates…")
    if (updateStatus?.state === "unavailable")
      return t("Updates are available only in a packaged production build.")
    if (updateStatus?.state === "up-to-date") return t("You're up to date.")
    if (updateStatus?.state === "available")
      return t("Update {version} is available.", {
        version: updateStatus.version ?? "",
      })
    if (updateStatus?.state === "downloading")
      return t("Downloading update… {percent}%", {
        percent: Math.round(updateStatus.progressPercent ?? 0),
      })
    if (updateStatus?.state === "downloaded")
      return t("Version {version} is ready to install.", {
        version: updateStatus.version ?? "",
      })
    if (updateStatus?.state === "error")
      return t("Could not check for updates. Try again later.")
    return updateStatus
      ? t("Current version: {version}", {
          version: updateStatus.currentVersion,
        })
      : null
  })()

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
          <button
            type="button"
            role="menuitem"
            aria-disabled={checkBusy || undefined}
            aria-busy={checkBusy || undefined}
            onClick={() => void checkForUpdates()}
          >
            <RefreshCw
              className={checkBusy ? "spin" : undefined}
              aria-hidden="true"
            />
            {t(checkBusy ? "Checking for updates…" : "Check for updates")}
          </button>
          {updateCopy ? (
            <p
              className="space-context-menu-selection sidebar-help-update-status"
              role={
                checkError || updateStatus?.state === "error"
                  ? "alert"
                  : "status"
              }
            >
              {updateCopy}
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}
