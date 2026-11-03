import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import type {
  EidosCustomSyncServer,
  EidosSyncPreflight,
  EidosSyncProgress,
  EidosSyncStatus,
} from "../shared/contracts"
import { hasSparkFeature, type SparkStatus } from "../shared/spark"
import { useEidosLiteI18n } from "./i18n"
import {
  SyncFileScope,
  SyncServerSelect,
  SyncConnectProgress,
} from "./sync-connect-shared"

/** Choose a saved server and connect the current Space. */
export function CustomSyncSetup({
  onBack,
  onConnected,
  progress,
  switchFrom,
  switchFromOfficial,
  initialServerId,
  footerTarget,
}: {
  onBack(): void
  onConnected(status: EidosSyncStatus): void
  progress?: EidosSyncProgress | null
  switchFrom?: string
  switchFromOfficial?: boolean
  initialServerId?: string
  footerTarget?: HTMLElement | null
}) {
  const { t } = useEidosLiteI18n()
  const [spark, setSpark] = useState<SparkStatus | null>(null)
  const [servers, setServers] = useState<EidosCustomSyncServer[]>([])
  const [selected, setSelected] = useState("")
  const [password, setPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [preflight, setPreflight] = useState<EidosSyncPreflight | null>(null)
  const [preview, setPreview] = useState<EidosSyncStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [passwordStep, setPasswordStep] = useState(false)
  const initialSelectionDone = useRef(false)

  useEffect(() => {
    let active = true
    setError("")
    const load = () => {
      void Promise.all([
        window.eidosLite.getSparkStatus(),
        window.eidosLite.listCustomSyncServers(),
      ])
        .then(([nextSpark, nextServers]) => {
          if (!active) return
          setSpark(nextSpark)
          setServers(nextServers)
        })
        .catch(() => {
          if (active) setError(t("Could not load custom server settings."))
        })
    }
    load()
    window.addEventListener("focus", load)
    return () => {
      active = false
      window.removeEventListener("focus", load)
    }
  }, [t, loadAttempt])

  useEffect(() => {
    if (
      selected &&
      selected !== "official" &&
      !servers.some((server) => server.id === selected)
    ) {
      setSelected("")
      setPreview(null)
      setPreflight(null)
    }
  }, [selected, servers])

  useEffect(() => {
    if (!selected) return
    let active = true
    const refresh = () => {
      void window.eidosLite
        .getSyncStatus(
          selected === "official"
            ? { provider: "official" }
            : { provider: "custom", serverId: selected }
        )
        .then((status) => {
          if (active) setPreview(status)
        })
        .catch(() => undefined)
    }
    window.addEventListener("focus", refresh)
    return () => {
      active = false
      window.removeEventListener("focus", refresh)
    }
  }, [selected])

  const run = async (operation: () => Promise<void>) => {
    setBusy(true)
    setError("")
    try {
      await operation()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }
  const selectServer = async (server: EidosCustomSyncServer) => {
    setSelected(server.id)
    setPreview(null)
    setPreflight(null)
    if (switchFrom && new URL(switchFrom).origin === server.origin) {
      setSelected("")
      throw new Error(t("This Space already uses this server."))
    }
    try {
      const result = await window.eidosLite.getSyncStatus({
        provider: "custom",
        serverId: server.id,
      })
      if (result.canEnable)
        setPreflight(await window.eidosLite.getSyncPreflight())
      setPreview(result)
    } catch (cause) {
      setSelected("")
      throw cause
    }
  }
  const selectOfficial = async () => {
    setSelected("official")
    setPreview(null)
    setPreflight(null)
    try {
      const result = await window.eidosLite.getSyncStatus({
        provider: "official",
      })
      if (result.canEnable)
        setPreflight(await window.eidosLite.getSyncPreflight())
      setPreview(result)
    } catch (cause) {
      setSelected("")
      throw cause
    }
  }
  const enabled = spark && hasSparkFeature(spark, "custom-graft-sync")
  useEffect(() => {
    if (initialSelectionDone.current || !spark || !initialServerId) return
    const server = servers.find((item) => item.id === initialServerId)
    if (!server) return
    initialSelectionDone.current = true
    void run(() => selectServer(server))
    // Only select the caller's initial choice once; later changes are user-controlled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spark, servers, initialServerId])

  const footer =
    preview?.canEnable &&
    (selected === "official" || enabled) &&
    !(busy && progress?.state === "active") ? (
      <div className="sync-connection-actions">
        {switchFrom ? (
          <p className="sync-setup-note" role="status">
            {t(
              "A new encrypted copy will be uploaded. If the upload fails, the previous connection is restored. Local files and the previous cloud copy are kept."
            )}
          </p>
        ) : null}
        {!passwordStep &&
        preview.deviceUnlockAvailable &&
        !preview.defaultPasswordConfigured ? (
          <button
            type="button"
            className="primary-action"
            onClick={() =>
              void window.eidosLite.openSettingsDestination("account-sync")
            }
          >
            {t("Set up sync password")}
          </button>
        ) : (
          <button
            className="primary-action"
            disabled={
              busy ||
              !preflight ||
              preflight.blockerCount > 0 ||
              (passwordStep && (!password || password !== confirmation))
            }
            onClick={() =>
              void run(async () => {
                if (!passwordStep && !preview.defaultPasswordConfigured) {
                  setPasswordStep(true)
                  return
                }
                const preflight = await window.eidosLite.getSyncPreflight()
                if (preflight.blockerCount)
                  throw new Error(
                    t("Resolve blocked files before enabling Sync.")
                  )
                const bytes = passwordStep
                  ? new TextEncoder().encode(password)
                  : undefined
                try {
                  const approval = {
                    manifestId: preflight.manifestId,
                    ...(switchFrom ? { switchFrom } : {}),
                  }
                  const encryption = bytes
                    ? {
                        password: bytes,
                        ...(preview.deviceUnlockAvailable
                          ? { remember: true }
                          : {}),
                      }
                    : undefined
                  const response =
                    selected === "official"
                      ? await window.eidosLite.enableSync(approval, encryption)
                      : await window.eidosLite.enableSync(
                          approval,
                          encryption,
                          { provider: "custom", serverId: selected }
                        )
                  setPassword("")
                  setConfirmation("")
                  if (!response.ok) throw new Error(t(response.failure.message))
                  onConnected(response.status)
                } finally {
                  bytes?.fill(0)
                }
              })
            }
          >
            {t(
              passwordStep || preview.defaultPasswordConfigured
                ? switchFrom
                  ? "Switch server"
                  : "Connect"
                : "Set a sync password"
            )}
          </button>
        )}
        {passwordStep ? (
          <button
            type="button"
            className="sync-text-action"
            onClick={() => {
              setPasswordStep(false)
              setPassword("")
              setConfirmation("")
            }}
          >
            {t("Back")}
          </button>
        ) : null}
      </div>
    ) : null

  return (
    <div
      className="custom-sync-setup sync-dialog-body"
      data-sync-connection-setup="true"
      data-sync-introduction={!passwordStep && !switchFrom ? "true" : undefined}
    >
      {busy && progress?.state === "active" ? (
        <SyncConnectProgress
          progress={progress}
          serverName={
            selected === "official"
              ? "Eidos Sync"
              : (servers.find((server) => server.id === selected)?.name ??
                t("Custom server"))
          }
        />
      ) : null}
      <div hidden={busy && progress?.state === "active"}>
        {passwordStep ? (
          <div className="custom-sync-title">
            <h2>{t("Set a sync password")}</h2>
          </div>
        ) : switchFrom ? (
          <div className="custom-sync-title">
            <h2>{t("Switch server for this Space")}</h2>
            <button type="button" className="sync-text-action" onClick={onBack}>
              {t("Back to sync")}
            </button>
          </div>
        ) : null}
        {!spark && !error ? (
          <p role="status">{t("Checking Spark…")}</p>
        ) : !spark ? (
          <div className="custom-sync-load-error">
            <p className="custom-sync-error" role="alert">
              {error}
            </p>
            <button
              className="sync-inspector-link"
              onClick={() => setLoadAttempt((attempt) => attempt + 1)}
            >
              {t("Try again")}
            </button>
          </div>
        ) : !enabled && selected !== "official" ? (
          <section className="custom-sync-spark">
            <strong>{t("Custom servers are included with Spark")}</strong>
          </section>
        ) : null}
        <section className="custom-sync-form" aria-label={t("Custom server")}>
          {!passwordStep ? (
            <SyncServerSelect
              value={selected}
              disabled={busy}
              onChange={(value) => {
                if (value === "official") {
                  if (switchFrom) void run(selectOfficial)
                  else onBack()
                  return
                }
                const server = servers.find((item) => item.id === value)
                if (server) void run(() => selectServer(server))
                else {
                  setSelected("")
                  setPreview(null)
                }
              }}
            >
              {!selected ? (
                <option value="" disabled>
                  {t("Choose a server")}
                </option>
              ) : null}
              {!switchFrom || !switchFromOfficial ? (
                <option value="official">Eidos Sync</option>
              ) : null}
              {servers.map((server) => (
                <option key={server.id} value={server.id}>
                  {server.name}
                </option>
              ))}
            </SyncServerSelect>
          ) : null}
          {!selected ? (
            <p>
              {t(
                servers.length
                  ? "Choose a saved server for this Space."
                  : "Add a server in Account & Services, then return here to connect this Space."
              )}
            </p>
          ) : selected !== "official" && !enabled ? (
            null
          ) : preview ? (
            <>
              {preview.canEnable ? (
                <>
                  {passwordStep ? (
                    <>
                      <label>
                        {t("Sync password")}
                        <input
                          type="password"
                          autoComplete="new-password"
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                        />
                      </label>
                      <label>
                        {t("Confirm sync password")}
                        <input
                          type="password"
                          autoComplete="new-password"
                          value={confirmation}
                          onChange={(event) =>
                            setConfirmation(event.target.value)
                          }
                        />
                      </label>
                    </>
                  ) : null}
                  {!passwordStep ? (
                    <SyncFileScope
                      preflight={preflight}
                      refreshing={busy}
                      compact
                      onRefresh={() =>
                        void run(async () =>
                          setPreflight(
                            await window.eidosLite.getSyncPreflight()
                          )
                        )
                      }
                    />
                  ) : null}
                  {passwordStep ? (
                    <p>
                      {t(
                        preview.deviceUnlockAvailable
                          ? "Saved securely on this device. Keep a copy: Eidos cannot recover this password."
                          : "Enter the password again after restarting."
                      )}
                    </p>
                  ) : null}
                </>
              ) : (
                <p role="status">
                  {t(
                    preview.blocker?.message ?? "Custom server is unavailable."
                  )}
                </p>
              )}
            </>
          ) : (
            <p role="status">{t("Checking server…")}</p>
          )}
        </section>
        {!passwordStep ? (
          <button
            type="button"
            className="sync-text-action"
            onClick={() =>
              void window.eidosLite.openSettingsDestination("account-sync")
            }
          >
            {t("Manage servers")}
          </button>
        ) : null}
        {spark && error ? (
          <p className="custom-sync-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      {footerTarget === undefined
        ? footer
        : footerTarget
          ? createPortal(footer, footerTarget)
          : null}
    </div>
  )
}
