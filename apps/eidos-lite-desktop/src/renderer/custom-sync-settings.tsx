import { useEffect, useState } from "react"
import type { EidosCustomSyncServer } from "../shared/contracts"
import { hasSparkFeature } from "../shared/spark"
import { useEidosLiteI18n } from "./i18n"

/** Server profiles are device-wide; connecting a Space remains in Sync. */
export function CustomSyncSettings() {
  const { t } = useEidosLiteI18n()
  const [servers, setServers] = useState<EidosCustomSyncServer[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<EidosCustomSyncServer | "new" | null>(
    null
  )
  const [removing, setRemoving] = useState<EidosCustomSyncServer | null>(null)
  const [name, setName] = useState("")
  const [origin, setOrigin] = useState("")
  const [token, setToken] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [savedServer, setSavedServer] = useState<EidosCustomSyncServer | null>(
    null
  )

  const load = async () => {
    try {
      setServers(await window.eidosLite.listCustomSyncServers())
      setError("")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    void load()
  }, [])

  const edit = (server: EidosCustomSyncServer | "new") => {
    setEditing(server)
    setName(server === "new" ? "" : server.name)
    setOrigin(server === "new" ? "" : server.origin)
    setToken("")
    setError("")
    setSavedServer(null)
  }
  const save = async () => {
    if (!editing) return
    setBusy(true)
    setError("")
    try {
      const spark = await window.eidosLite.getSparkStatus()
      if (!hasSparkFeature(spark, "custom-graft-sync")) {
        throw new Error(
          t(
            "Activate Spark on this computer to sync through your own server. Your local files and LAN sync remain available."
          )
        )
      }
      const saved = await window.eidosLite.saveCustomSyncServer({
        ...(editing === "new" ? {} : { id: editing.id }),
        name,
        origin,
        ...(token ? { token } : {}),
      })
      setToken("")
      setServers((current) => [
        ...current.filter((server) => server.id !== saved.id),
        saved,
      ])
      setEditing(null)
      setSavedServer(saved)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }
  const remove = async () => {
    if (!removing) return
    setBusy(true)
    setError("")
    try {
      await window.eidosLite.removeCustomSyncServer(removing.id)
      setRemoving(null)
      setSavedServer(null)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="settings-custom-servers" data-settings-custom-servers>
      <div className="settings-row">
        <div className="settings-row-copy">
          <strong>{t("Custom servers")}</strong>
          <small>
            {t(
              "Saved on this computer. Choose a server for each Space in Sync. Custom servers require Spark."
            )}
          </small>
        </div>
        {!editing && !removing ? (
          <button
            type="button"
            className="settings-button"
            onClick={() => edit("new")}
          >
            {t("Add server")}
          </button>
        ) : null}
      </div>
      {loading ? (
        <p className="settings-service-notice" role="status">
          {t("Loading servers…")}
        </p>
      ) : null}
      {savedServer && !editing && !removing ? (
        <div className="settings-custom-server-success" role="status">
          <strong>
            {savedServer.name} · {t("Connection saved with system encryption")}
          </strong>
          <small>{t("Choose a saved server for this Space.")}</small>
        </div>
      ) : null}
      {!editing &&
        !removing &&
        servers.map((server) => (
          <div className="settings-row" key={server.id}>
            <div className="settings-row-copy">
              <strong>{server.name}</strong>
              <small className="settings-path">{server.origin}</small>
            </div>
            <div className="settings-row-actions">
              <button
                type="button"
                className="settings-button settings-button-quiet"
                onClick={() => edit(server)}
              >
                {t("Edit")}
              </button>
              <button
                type="button"
                className="settings-button settings-button-quiet"
                onClick={() => setRemoving(server)}
              >
                {t("Remove")}
              </button>
            </div>
          </div>
        ))}
      {editing ? (
        <div className="settings-custom-server-form">
          <strong>
            {t(
              editing === "new" ? "Add a custom server" : "Edit custom server"
            )}
          </strong>
          <label>
            {t("Server name")}
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            {t("Server address")}
            <input
              type="url"
              value={origin}
              disabled={editing !== "new"}
              onChange={(event) => setOrigin(event.target.value)}
            />
          </label>
          {editing !== "new" ? (
            <small>
              {t(
                "Add a separate server to change its address. Existing connections keep their server identity."
              )}
            </small>
          ) : null}
          <label>
            {t("Access token")}
            <input
              type="password"
              autoComplete="off"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder={
                editing === "new"
                  ? undefined
                  : t("Leave blank to keep the current token")
              }
            />
          </label>
          <small>
            {t(
              "Stored securely on this computer. This token is separate from your Space sync password."
            )}
          </small>
          <div className="settings-row-actions">
            <button
              type="button"
              className="settings-button"
              disabled={
                busy ||
                !name.trim() ||
                !origin.trim() ||
                (editing === "new" && !token)
              }
              onClick={() => void save()}
            >
              {t(busy ? "Testing…" : "Test and save")}
            </button>
            <button
              type="button"
              className="settings-button settings-button-quiet"
              disabled={busy}
              onClick={() => {
                setEditing(null)
                setToken("")
                setError("")
              }}
            >
              {t("Cancel")}
            </button>
          </div>
          <small>
            {t("Saving a server does not connect or upload any Space.")}
          </small>
        </div>
      ) : null}
      {removing ? (
        <div className="settings-custom-server-form">
          <strong>{t("Remove {name}?", { name: removing.name })}</strong>
          <small>
            {t(
              "Spaces using this server will need its credentials again to sync. Local files and history remain available."
            )}
          </small>
          <div className="settings-row-actions">
            <button
              type="button"
              className="settings-button"
              disabled={busy}
              onClick={() => void remove()}
            >
              {t("Remove server")}
            </button>
            <button
              type="button"
              className="settings-button settings-button-quiet"
              disabled={busy}
              onClick={() => setRemoving(null)}
            >
              {t("Cancel")}
            </button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p className="settings-service-notice" role="alert">
          {t(error)}
        </p>
      ) : null}
    </div>
  )
}
