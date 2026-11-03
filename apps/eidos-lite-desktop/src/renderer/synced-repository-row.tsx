import { useEffect, useRef, useState } from "react"
import { CloudDownload, Folder, MoreHorizontal } from "lucide-react"
import type {
  EidosSyncRepository,
  EidosSyncRepositoryManagement,
} from "../shared/contracts"
import { useEidosLiteI18n } from "./i18n"

export function SyncedRepositoryRow({
  repository,
  serverId,
  management,
  disabled,
  onOpen,
}: {
  repository: EidosSyncRepository
  serverId?: string
  management?: EidosSyncRepositoryManagement
  disabled: boolean
  onOpen(repository: EidosSyncRepository): void
}) {
  const { t } = useEidosLiteI18n()
  const [name, setName] = useState(repository.displayName)
  const [draft, setDraft] = useState(name)
  const [editing, setEditing] = useState(false)
  const [status, setStatus] = useState(repository.status ?? "active")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const menu = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    setName(repository.displayName)
    setStatus(repository.status ?? "active")
  }, [repository])
  useEffect(() => {
    if (status !== "deleting" || !management?.delete) return
    let active = true
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const next = await window.eidosLite.manageSyncRepository({
          serverId,
          name: repository.name,
          action: "status",
        })
        if (active && next) {
          setStatus(next)
          setError("")
        }
      } catch (cause) {
        if (active) setError(String(cause))
      }
      if (active) timer = setTimeout(() => void poll(), 3000)
    }
    timer = setTimeout(() => void poll(), 1000)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [status, management?.delete, serverId, repository.name])
  const manage = async (action: "rename" | "delete") => {
    setBusy(true)
    setError("")
    setNotice("")
    if (menu.current) menu.current.open = false
    try {
      const next = await window.eidosLite.manageSyncRepository({
        serverId,
        name: repository.name,
        action,
        ...(action === "rename" ? { displayName: draft } : {}),
      })
      if (!next) return
      setStatus(next)
      if (action === "rename") {
        setName(draft.trim().normalize("NFC"))
        setEditing(false)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="synced-repository-item">
      <div className="synced-repository-line">
        <button
          type="button"
          className="open-synced-row"
          disabled={disabled || busy || status !== "active" || editing}
          onClick={() => onOpen({ ...repository, displayName: name })}
        >
          <Folder aria-hidden="true" />
          <span>{name}</span>
          <CloudDownload aria-hidden="true" />
        </button>
        {status !== "deleted" ? (
          <details
            ref={menu}
            className="synced-repository-menu"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                event.currentTarget.open = false
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape" && menu.current) {
                menu.current.open = false
                menu.current.querySelector("summary")?.focus()
              }
            }}
          >
            <summary aria-label={t("Space actions")}>
              <MoreHorizontal aria-hidden="true" />
            </summary>
            <div className="synced-repository-actions">
              <button
                type="button"
                disabled={disabled || busy}
                onClick={() => {
                  if (menu.current) menu.current.open = false
                  void navigator.clipboard
                    .writeText(repository.remoteUrl)
                    .then(() => setNotice(t("Remote address copied")))
                    .catch((cause) => setError(String(cause)))
                }}
              >
                {t("Copy remote address")}
              </button>
              {management?.rename && status === "active" ? (
                <button
                  type="button"
                  disabled={disabled || busy}
                  onClick={() => {
                    if (menu.current) menu.current.open = false
                    setDraft(name)
                    setEditing(true)
                  }}
                >
                  {t("Rename remote Space")}
                </button>
              ) : null}
              {management?.delete ? (
                <button
                  type="button"
                  disabled={disabled || busy}
                  onClick={() => void manage("delete")}
                >
                  {t("Delete remote Space")}
                </button>
              ) : null}
            </div>
          </details>
        ) : null}
      </div>
      {editing ? (
        <form
          className="open-synced-password"
          onSubmit={(event) => {
            event.preventDefault()
            void manage("rename")
          }}
        >
          <label>
            {t("Remote display name")}
            <input
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              disabled={busy}
            />
          </label>
          <button
            type="submit"
            className="sync-text-action"
            disabled={busy || !draft.trim()}
          >
            {t("Save")}
          </button>
          <button
            type="button"
            className="sync-text-action"
            disabled={busy}
            onClick={() => setEditing(false)}
          >
            {t("Cancel")}
          </button>
          <p>
            {t(
              "Only the remote display name changes. The address and local folder stay the same."
            )}
          </p>
        </form>
      ) : null}
      {busy || status !== "active" || notice ? (
        <p role="status">
          {busy
            ? t("Working…")
            : status === "deleting"
              ? t("Deleting remote copy… Local files are kept.")
              : status === "deleted"
                ? t("Remote Space deleted. Local files are kept.")
                : notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert">
          {error} {t("Use the Space menu to try again.")}
        </p>
      ) : null}
    </div>
  )
}
