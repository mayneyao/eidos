import { useEffect, useRef, useState } from "react"
import type { EidosLiteApi } from "../shared/contracts"
import { useEidosLiteI18n } from "./i18n"

type Status = Awaited<ReturnType<EidosLiteApi["peerSync"]>>
type Action = Parameters<EidosLiteApi["peerSync"]>[0]

const ACTIVITY_LABELS: Record<
  "syncing" | "completed" | "review" | "failed",
  string
> = {
  syncing: "Transferring",
  completed: "Last transfer finished",
  review:
    "The last sync had conflicts. Resolve them here, then sync again from the phone.",
  failed: "The last transfer did not finish. Retry from the phone.",
}

const TRANSFER_STAGES = {
  receiving: "Receiving device changes",
  merging: "Reviewing and merging versions",
  sending: "Sending data to device",
}

function transferSize(bytes: number, locale: string) {
  const unit =
    bytes >= 1024 ** 3 ? 3 : bytes >= 1024 ** 2 ? 2 : bytes >= 1024 ? 1 : 0
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: unit ? 1 : 0 }).format(bytes / 1024 ** unit)} ${["B", "KiB", "MiB", "GiB"][unit]}`
}

function usePeerStatus(global: boolean) {
  const revision = useRef(0)
  const acting = useRef(false)
  const [status, setStatus] = useState<Status>({ running: false, devices: [] })
  const [code, setCode] = useState<{ value: string; qr: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  useEffect(() => {
    if (typeof window.eidosLite.peerSync !== "function") return
    let active = true
    let pending = false
    const poll = async () => {
      if (pending || acting.current) return
      pending = true
      const requested = revision.current
      try {
        const next = await window.eidosLite.peerSync(
          global ? "devices-status" : "status"
        )
        if (active && requested === revision.current) setStatus(next)
      } catch (error) {
        if (active)
          setError(error instanceof Error ? error.message : String(error))
      } finally {
        pending = false
      }
    }
    void poll()
    const timer = setInterval(() => void poll(), 2000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [global])
  const run = async (action: Action, id?: string) => {
    if (acting.current) return
    acting.current = true
    revision.current += 1
    setBusy(true)
    setError("")
    try {
      const next = await window.eidosLite.peerSync(action, id)
      setStatus(next)
      if (next.invitation && next.qr)
        setCode({ value: next.invitation, qr: next.qr })
      if (
        ["devices-stop", "devices-approve", "devices-reject"].includes(action)
      )
        setCode(null)
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    } finally {
      acting.current = false
      setBusy(false)
    }
  }
  return { status, code, busy, error, run }
}

export function PeerSyncPanel({
  standalone = false,
}: {
  standalone?: boolean
}) {
  const { t, locale } = useEidosLiteI18n()
  const { status, busy, error, run } = usePeerStatus(false)
  const activity = status.activity
  return (
    <section
      className="peer-sync-panel p-4 text-sm"
      data-standalone={standalone || undefined}
      aria-label={t("LAN sync for this Space")}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <strong>{t("LAN sync")}</strong>
          <p className="mt-1 text-muted-foreground">
            {t("Share this Space with paired devices")}
          </p>
        </div>
        <button
          type="button"
          className="settings-switch"
          role="switch"
          aria-label={t("Turn on LAN sync for this Space")}
          aria-checked={status.running}
          disabled={busy || !status.serviceRunning}
          onClick={() => void run(status.running ? "stop" : "start")}
        >
          <span />
        </button>
      </div>
      <p className="my-4 text-muted-foreground">
        {!status.serviceRunning
          ? t("Turn on the LAN service in Settings → Devices first.")
          : status.running
            ? t(
                "Shared. Paired devices can still sync after you switch Spaces or close this window."
              )
            : t("Stored on this computer only. No devices can reach it.")}
      </p>
      {status.running && (
        <div className="border-t border-border py-3" role="status">
          {activity ? (
            <>
              <p>
                {activity.device ?? t("A paired device")} ·{" "}
                {t(ACTIVITY_LABELS[activity.state])}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(activity.updatedAt).toLocaleString(locale)}
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">
              {t("Waiting for a device to sync")}
            </p>
          )}
        </div>
      )}
      {status.running && (
        <section
          className="border-t border-border py-3"
          aria-label={t("Device transfers")}
        >
          <h3 className="font-medium">{t("Device transfers")}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {t(
              "Payload transferred for this Space since sharing was enabled. Amounts are measured on this computer."
            )}
          </p>
          {status.devices.length === 0 && (
            <p className="py-4 text-muted-foreground">
              {t("Connect a device to start transferring this Space.")}
            </p>
          )}
          <ul className="mt-2 list-none divide-y divide-border p-0">
            {status.devices.map((device) => {
              const detail = status.transfers?.find(
                (item) => item.id === device.id
              )
              return (
                <li key={device.id} className="py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <strong className="min-w-0 break-words font-medium">
                      {device.name}
                    </strong>
                    <span
                      className={
                        detail?.error
                          ? "text-xs text-destructive"
                          : "text-xs text-muted-foreground"
                      }
                    >
                      {detail?.error
                        ? t("Transfer interrupted")
                        : detail?.activeRequests
                          ? t(TRANSFER_STAGES[detail.stage])
                          : detail
                            ? t("No transfer in progress")
                            : t("No transfers for this Space yet")}
                    </span>
                  </div>
                  {detail && (
                    <>
                      <dl className="my-3 grid grid-cols-2 gap-4 text-xs">
                        <div>
                          <dt className="text-muted-foreground">
                            {t("Received on this computer")}
                          </dt>
                          <dd className="m-0 mt-1 text-sm tabular-nums">
                            ↓ {transferSize(detail.receivedBytes, locale)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">
                            {t("Sent to device")}
                          </dt>
                          <dd className="m-0 mt-1 text-sm tabular-nums">
                            ↑ {transferSize(detail.sentBytes, locale)}
                          </dd>
                        </div>
                      </dl>
                      {!detail.activeRequests && (
                        <p className="text-xs text-muted-foreground">
                          {t("Last activity · {time}", {
                            time: new Date(detail.updatedAt).toLocaleString(
                              locale
                            ),
                          })}
                        </p>
                      )}
                      {detail.error && (
                        <details className="mt-2 text-xs text-destructive">
                          <summary className="cursor-pointer">
                            {t("Error details")}
                          </summary>
                          <p className="mt-2 whitespace-pre-wrap break-words">
                            {t(detail.error)}
                          </p>
                        </details>
                      )}
                    </>
                  )}
                </li>
              )
            })}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            {t(
              "Start or retry sync from your device. File application finishes on that device."
            )}
          </p>
        </section>
      )}
      <button
        className="mt-2"
        onClick={() => void window.eidosLite.openSettingsDestination("devices")}
      >
        {status.devices.length ? t("Manage devices") : t("Connect a device")} ↗
      </button>
      {error && (
        <p role="alert" className="mt-3 text-destructive">
          {error}
        </p>
      )}
    </section>
  )
}

export function DevicesSettings() {
  const { t, locale } = useEidosLiteI18n()
  const { status, code, busy, error, run } = usePeerStatus(true)
  const [removing, setRemoving] = useState<string | null>(null)
  return (
    <section aria-labelledby="settings-devices">
      <h2 id="settings-devices">{t("Devices")}</h2>
      {status.deviceName && (
        <p className="mb-2 text-sm">
          {t("This computer · {name}", { name: status.deviceName })}
        </p>
      )}
      <p className="mb-6 text-muted-foreground">
        {t(
          "Connect your devices on the same local network. Pair once to reach the Spaces this computer shares. No cloud account needed."
        )}
      </p>
      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-row-copy">
            <strong>{t("LAN service")}</strong>
            <p>
              {status.running
                ? t("On · Available while Eidos Lite is running")
                : t("Off · Paired devices are kept")}
            </p>
          </div>
          <button
            type="button"
            className="settings-switch"
            role="switch"
            aria-label={t("LAN service")}
            aria-checked={status.running}
            disabled={busy}
            onClick={() =>
              void run(status.running ? "devices-stop" : "devices-start")
            }
          >
            <span />
          </button>
        </div>
        <div className="settings-row flex-wrap" data-device-pairing>
          <div className="settings-row-copy">
            <strong>{t("Connect a new device")}</strong>
            <p>{t("Scan the code on your phone, then approve it here.")}</p>
          </div>
          <button
            disabled={busy || !status.running}
            onClick={() => void run("devices-invite")}
          >
            {t("Show pairing code")}
          </button>
          {code && (
            <div className="flex basis-full flex-wrap items-start gap-4">
              <img
                width={200}
                height={200}
                src={code.qr}
                alt={t("Pairing QR code")}
              />
              <div>
                <p>{t("Open Sync on your phone and scan the code.")}</p>
                <p className="my-2 text-muted-foreground">
                  {t(
                    "Valid for five minutes. Approve only devices you recognize."
                  )}
                </p>
                <button
                  onClick={() => void navigator.clipboard.writeText(code.value)}
                >
                  {t("Copy pairing code")}
                </button>
              </div>
            </div>
          )}
          {status.pending && (
            <div className="basis-full" role="status">
              <p>
                {t(
                  "Allow “{name}” to connect? It can read and write the Spaces you share.",
                  { name: status.pending }
                )}
              </p>
              <div className="mt-3 flex gap-3">
                <button
                  disabled={busy}
                  onClick={() => void run("devices-approve")}
                >
                  {t("Allow pairing")}
                </button>
                <button
                  disabled={busy}
                  onClick={() => void run("devices-reject")}
                >
                  {t("Reject")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <h3 className="mb-3 mt-8">{t("Paired devices")}</h3>
      {status.devices.length === 0 ? (
        <p className="text-muted-foreground">
          {t("No devices connected yet.")}
        </p>
      ) : (
        <div className="settings-group">
          {status.devices.map((device) => (
            <div className="settings-row" key={device.id}>
              <div className="settings-row-copy">
                <strong>{device.name}</strong>
                <p>
                  {device.lastSeenAt
                    ? t("Last contact · {time}", {
                        time: new Date(device.lastSeenAt).toLocaleString(
                          locale
                        ),
                      })
                    : t("Paired · No transfers yet")}
                </p>
              </div>
              {removing === device.id ? (
                <div className="flex gap-2">
                  <button
                    disabled={busy}
                    onClick={() => {
                      void run("devices-revoke", device.id)
                      setRemoving(null)
                    }}
                  >
                    {t("Confirm remove")}
                  </button>
                  <button onClick={() => setRemoving(null)}>
                    {t("Cancel")}
                  </button>
                </div>
              ) : (
                <button disabled={busy} onClick={() => setRemoving(device.id)}>
                  {t("Remove access")}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <h3 className="mb-3 mt-8">{t("Spaces shared over LAN")}</h3>
      <p className="mb-3 text-muted-foreground">
        {t(
          "Turn sharing on or off in each Space's Sync panel. Turning off the LAN service stops LAN sync for every Space."
        )}
      </p>
      {status.spaces?.length ? (
        <ul className="settings-group list-none p-0">
          {status.spaces.map((space) => (
            <li className="settings-row" key={space.id}>
              <div className="settings-row-copy">
                <strong>{space.name}</strong>
              </div>
              <button
                disabled={busy}
                onClick={() => void run("devices-open-space", space.id)}
              >
                {t("Open")}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">
          {t("No Spaces are shared yet.")}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-destructive">
          {error}
        </p>
      )}
    </section>
  )
}
