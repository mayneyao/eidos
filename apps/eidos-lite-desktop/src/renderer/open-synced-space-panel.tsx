import { useEffect, useRef, useState } from "react"
import { CloudDownload, Folder, RefreshCw, X } from "lucide-react"
import appLogo from "../../assets/logo.svg"
import type {
  EidosCustomSyncServer,
  EidosSyncRepository,
  EidosSyncProgress,
  EidosSyncStatus,
  SpaceSnapshot,
} from "../shared/contracts"
import { supportsEncryptedSync } from "../shared/sync-encryption"
import { useEidosLiteI18n } from "./i18n"
import {
  IndeterminateSyncProgress,
  SyncTransferStatus,
} from "./sync-connect-shared"

export function OpenSyncedSpacePanel({
  variant = "dialog",
  platform,
  onClose,
  onClone,
}: {
  variant?: "dialog" | "inspector"
  platform: string
  onClose(): void
  onClone?(snapshot: SpaceSnapshot): void
}) {
  const { t } = useEidosLiteI18n()
  const [servers, setServers] = useState<EidosCustomSyncServer[]>([])
  const [server, setServer] = useState("official")
  const [status, setStatus] = useState<EidosSyncStatus | null>(null)
  const [repositories, setRepositories] = useState<
    EidosSyncRepository[] | null
  >(null)
  const [selected, setSelected] = useState<EidosSyncRepository | null>(null)
  const [password, setPassword] = useState("")
  const [defaultPassword, setDefaultPassword] = useState(false)
  const [busy, setBusy] = useState<"loading" | "sign-in" | "clone" | null>(null)
  const [error, setError] = useState("")
  const [reload, setReload] = useState(0)
  const revision = useRef(0)
  const cloneActive = useRef(false)
  const [cloneProgress, setCloneProgress] = useState<EidosSyncProgress | null>(
    null
  )
  const cloning = busy === "clone"

  useEffect(() => {
    if (!window.eidosLite.onSyncProgress) return
    return window.eidosLite.onSyncProgress((progress) => {
      if (cloneActive.current && progress.operation === "clone")
        setCloneProgress(progress)
    })
  }, [])

  useEffect(() => {
    let active = true
    const refresh = () => {
      void window.eidosLite
        .listCustomSyncServers()
        .then((value) => {
          if (active) setServers(value)
        })
        .catch((cause) => {
          if (active) setError(String(cause))
        })
      void window.eidosLite
        .getSyncPasswordSettings()
        .then((value) => {
          if (active) setDefaultPassword(value.configured)
        })
        .catch(() => {
          if (active) setDefaultPassword(false)
        })
    }
    refresh()
    window.addEventListener("focus", refresh)
    return () => {
      active = false
      window.removeEventListener("focus", refresh)
    }
  }, [])

  useEffect(() => {
    const request = ++revision.current
    let active = true
    const current = () => active && revision.current === request
    setStatus(null)
    setRepositories(null)
    setSelected(null)
    setPassword("")
    setError("")
    setBusy("loading")
    void (async () => {
      try {
        const value = await window.eidosLite.getSyncStatus(
          server === "official"
            ? { provider: "official" }
            : { provider: "custom", serverId: server }
        )
        if (!current()) return
        setStatus(value)
        if (!value.canClone) return
        const list =
          server === "official"
            ? await window.eidosLite.listSyncRepositories()
            : await window.eidosLite.listCustomSyncRepositories(server)
        if (current()) setRepositories(list.repositories)
      } catch (cause) {
        if (current())
          setError(cause instanceof Error ? cause.message : String(cause))
      } finally {
        if (current()) setBusy(null)
      }
    })()
    return () => {
      active = false
      revision.current += 1
    }
  }, [server, reload])

  const signIn = async () => {
    if (busy) return
    setError("")
    setBusy("sign-in")
    try {
      await window.eidosLite.beginSyncSignIn()
      setReload((value) => value + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setBusy(null)
    }
  }
  const open = async (repository: EidosSyncRepository) => {
    if (busy) return
    if (repository.encryption && !supportsEncryptedSync(platform)) {
      setError(t("Encrypted cloud sync is not available on this platform yet."))
      return
    }
    if (repository.encryption && !password && !defaultPassword) {
      setSelected(repository)
      return
    }
    const bytes = password ? new TextEncoder().encode(password) : undefined
    const request = revision.current
    setSelected(repository)
    setPassword("")
    setError("")
    setCloneProgress(null)
    cloneActive.current = true
    setBusy("clone")
    try {
      const result = await window.eidosLite.cloneSyncRepository(
        repository.remoteUrl,
        repository.displayName,
        bytes ? { password: bytes } : undefined,
        server === "official"
          ? undefined
          : { provider: "custom", serverId: server }
      )
      if (revision.current !== request) return
      if (result.ok) {
        if (result.snapshot) onClone?.(result.snapshot)
      } else {
        setError(t(result.failure.message))
        if (result.failure.code === "encryption-locked") setSelected(repository)
      }
    } catch (cause) {
      if (revision.current === request)
        setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      cloneActive.current = false
      bytes?.fill(0)
      if (revision.current === request) setBusy(null)
    }
  }
  const officialSignedOut =
    server === "official" && status?.account.state === "signed-out"
  return (
    <div
      className={
        variant === "dialog" ? "sync-dialog-backdrop" : "sync-inspector-host"
      }
      role="presentation"
    >
      <aside
        className={`sync-dialog open-synced-space-panel${variant === "inspector" ? " sync-dialog-inspector" : ""}`}
        role={variant === "dialog" ? "dialog" : "complementary"}
        aria-modal={variant === "dialog" ? "true" : undefined}
        aria-label={t("Open Synced Space")}
      >
        <header>
          <div>
            <img className="sync-dialog-mark" src={appLogo} alt="" />
            <strong>{t("Open Synced Space")}</strong>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label={t("Close Eidos Sync")}
          >
            <X />
          </button>
        </header>
        <main className="open-synced-space-content">
          <div className="open-synced-server">
            <span>{t("Server")}</span>
            <button
              type="button"
              className="sync-text-action open-synced-manage"
              onClick={() =>
                void window.eidosLite.openSettingsDestination("account-sync")
              }
            >
              {t("Manage servers")}
            </button>
            <select
              aria-label={t("Server")}
              value={server}
              disabled={cloning || busy === "sign-in"}
              onChange={(event) => setServer(event.target.value)}
            >
              <option value="official">Eidos Sync</option>
              {servers.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          {error ? (
            <div className="open-synced-error" role="alert">
              {error}
              <button
                type="button"
                className="sync-text-action"
                disabled={!!busy}
                onClick={() => setReload((value) => value + 1)}
              >
                {t("Try again")}
              </button>
            </div>
          ) : null}
          {busy === "loading" ? (
            <div className="open-synced-progress" role="status">
              <IndeterminateSyncProgress label={t("Transfer progress")} />
              <p>{t("Loading your synced Spaces…")}</p>
            </div>
          ) : null}
          {officialSignedOut && !error ? (
            <div className="open-synced-action">
              <span>{t("Sign in to use Sync")}</span>
              <button
                type="button"
                className="primary-action"
                disabled={!!busy}
                onClick={() => void signIn()}
              >
                {t(
                  busy === "sign-in" ? "Waiting for your browser…" : "Sign in"
                )}
              </button>
            </div>
          ) : null}
          {status && !status.canClone && !officialSignedOut && !error ? (
            <div className="open-synced-error" role="status">
              {t(status.blocker?.message ?? "Sync access required")}
              <button
                type="button"
                className="sync-text-action"
                onClick={() =>
                  void window.eidosLite.openSettingsDestination("account-sync")
                }
              >
                {t("Open settings")}
              </button>
            </div>
          ) : null}
          {repositories && !cloning ? (
            <section
              className="open-synced-list"
              aria-label={t("Your synced Spaces")}
            >
              <div className="open-synced-list-heading">
                <strong>{t("Your synced Spaces")}</strong>
                <button
                  type="button"
                  className="icon-button"
                  disabled={!!busy}
                  aria-label={t("Refresh")}
                  onClick={() => setReload((value) => value + 1)}
                >
                  <RefreshCw />
                </button>
              </div>
              {repositories.length === 0 ? (
                <p className="open-synced-empty">
                  {t("No synced Spaces on this server yet.")}
                </p>
              ) : (
                repositories.map((repository) => (
                  <button
                    type="button"
                    className="open-synced-row"
                    key={repository.remoteUrl}
                    disabled={!!busy}
                    onClick={() => void open(repository)}
                  >
                    <Folder aria-hidden="true" />
                    <span>{repository.displayName}</span>
                    <CloudDownload aria-hidden="true" />
                  </button>
                ))
              )}
            </section>
          ) : null}
          {selected &&
          !cloning &&
          selected.encryption &&
          (!defaultPassword || error) ? (
            <form
              className="open-synced-password"
              onSubmit={(event) => {
                event.preventDefault()
                void open(selected)
              }}
            >
              <label>
                {t("Sync password")}
                <input
                  autoFocus
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <button
                type="submit"
                className="primary-action"
                disabled={!password}
              >
                {t("Open Space")}
              </button>
              <button
                type="button"
                className="sync-text-action"
                onClick={() => {
                  setSelected(null)
                  setPassword("")
                  setError("")
                }}
              >
                {t("Cancel")}
              </button>
            </form>
          ) : null}
          {cloning ? (
            <div className="open-synced-progress" role="status">
              <p>{t("Opening a synced Space")}</p>
              {cloneProgress?.state === "active" ? (
                <SyncTransferStatus progress={cloneProgress} />
              ) : (
                <IndeterminateSyncProgress label={t("Transfer progress")} />
              )}
            </div>
          ) : null}
        </main>
      </aside>
    </div>
  )
}
