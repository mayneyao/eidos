import { useEffect, useId, useRef, useState } from "react"
import { useEidosLiteI18n } from "./i18n"

export function SyncPasswordSettings() {
  const { t } = useEidosLiteI18n()
  const [status, setStatus] = useState<{
    available: boolean
    configured: boolean
  } | null>(null)
  const [editing, setEditing] = useState(false)
  const [password, setPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<"load" | "save" | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [saved, setSaved] = useState(false)
  const form = useRef<HTMLFormElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef(false)
  const requestRevision = useRef(0)
  const saving = useRef(false)
  const confirmationErrorId = useId()
  const mismatched = confirmation.length > 0 && password !== confirmation
  useEffect(() => {
    const refresh = () => setReloadKey((key) => key + 1)
    window.addEventListener("focus", refresh)
    return () => window.removeEventListener("focus", refresh)
  }, [])
  useEffect(() => {
    if (!editing && !busy && returnFocus.current) {
      trigger.current?.focus()
      returnFocus.current = false
    }
  }, [editing, busy])
  useEffect(() => {
    let active = true
    const revision = ++requestRevision.current
    setError(null)
    void window.eidosLite
      .getSyncPasswordSettings()
      .then((value) => {
        if (active && revision === requestRevision.current) setStatus(value)
      })
      .catch(() => {
        if (active && revision === requestRevision.current) setError("load")
      })
    return () => {
      active = false
    }
  }, [reloadKey])
  const clear = () => {
    form.current?.reset()
    setPassword("")
    setConfirmation("")
    returnFocus.current = true
    setEditing(false)
  }
  const save = async () => {
    if (saving.current || !password || password !== confirmation) return
    saving.current = true
    requestRevision.current += 1
    const bytes = new TextEncoder().encode(password)
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      await window.eidosLite.saveDefaultSyncPassword({ password: bytes })
      requestRevision.current += 1
      setStatus({ available: true, configured: true })
      setSaved(true)
      clear()
    } catch {
      setError("save")
    } finally {
      bytes.fill(0)
      saving.current = false
      setBusy(false)
    }
  }
  return (
    <div className="sync-password-settings">
      <div className="settings-row">
        <div className="settings-row-copy">
          <strong>{t("Sync password")}</strong>
          <small>
            {t(
              !status
                ? "Checking this device…"
                : !status.available
                  ? "Enter the password again after restarting."
                  : status.configured
                    ? "Saved on this device · End-to-end encryption"
                    : "Use the same sync password on your other devices."
            )}
          </small>
        </div>
        {status?.available ? (
          <button
            ref={trigger}
            type="button"
            className="settings-button settings-button-quiet"
            disabled={!status?.available || busy}
            aria-expanded={editing}
            onClick={() => {
              setSaved(false)
              if (editing) clear()
              else setEditing(true)
            }}
          >
            {t(
              status?.configured
                ? "Change for new Spaces"
                : "Set up sync password"
            )}
          </button>
        ) : null}
      </div>
      {editing ? (
        <form
          ref={form}
          className="sync-password-form"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <p>
            {t(
              status?.configured
                ? "New Spaces will use this password. Existing Spaces keep their current passwords."
                : "Use the same sync password on your other devices."
            )}
          </p>
          <label>
            {t("Sync password")}
            <input
              autoFocus
              type="password"
              autoComplete="new-password"
              required
              value={password}
              disabled={busy}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <label>
            {t("Confirm sync password")}
            <input
              type="password"
              autoComplete="new-password"
              required
              aria-invalid={mismatched || undefined}
              aria-describedby={mismatched ? confirmationErrorId : undefined}
              value={confirmation}
              disabled={busy}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </label>
          {mismatched ? (
            <p id={confirmationErrorId} role="status">
              {t("The passwords do not match.")}
            </p>
          ) : null}
          <p>
            {t(
              "Saved securely on this device. Keep a copy: Eidos cannot recover this password."
            )}
          </p>
          <div className="settings-row-actions">
            <button
              className="settings-button settings-button-primary"
              disabled={busy || !password || password !== confirmation}
            >
              {t(busy ? "Saving…" : "Save password")}
            </button>
            <button
              type="button"
              className="settings-button"
              disabled={busy}
              onClick={clear}
            >
              {t("Cancel")}
            </button>
          </div>
        </form>
      ) : null}
      {saved ? (
        <p className="sync-password-note" role="status">
          {t("Sync password saved for new Spaces.")}
        </p>
      ) : null}
      {error === "load" ? (
        <p className="sync-password-note" role="alert">
          {t("Could not read the saved sync password status.")}{" "}
          <button
            type="button"
            className="sync-text-action"
            onClick={() => setReloadKey((key) => key + 1)}
          >
            {t("Retry")}
          </button>
        </p>
      ) : error === "save" ? (
        <p className="sync-password-note" role="alert">
          {t(
            "Could not update the sync password. Check system secure storage and try again."
          )}
        </p>
      ) : null}
    </div>
  )
}
