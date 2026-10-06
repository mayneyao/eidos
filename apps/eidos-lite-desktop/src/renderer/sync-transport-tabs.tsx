import { useEffect, useId, useState, type ReactNode } from "react"
import { PeerSyncPanel } from "./peer-sync-panel"

/** Keep both transports mounted so switching does not discard pairing or setup. */
export function SyncTransportTabs({
  children,
  enabled = true,
  reviewRequired = false,
  reviewLabel,
}: {
  children: ReactNode
  enabled?: boolean
  reviewRequired?: boolean
  reviewLabel?: string
}) {
  const id = useId()
  const [selected, setSelected] = useState<"device" | "cloud">("cloud")
  const current = selected
  useEffect(() => {
    if (reviewRequired) setSelected("cloud")
  }, [reviewRequired])
  if (!enabled) return <>{children}</>
  return (
    <>
      <div className="sync-transport-tabs" role="tablist" aria-label="同步方式">
        {(["cloud", "device"] as const).map((transport) => (
          <button
            key={transport}
            type="button"
            role="tab"
            id={`${id}-${transport}-tab`}
            aria-controls={`${id}-${transport}-panel`}
            aria-selected={current === transport}
            tabIndex={current === transport ? 0 : -1}
            onClick={() => setSelected(transport)}
            onKeyDown={(event) => {
              if (
                !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              )
                return
              event.preventDefault()
              const next =
                event.key === "Home"
                  ? "cloud"
                  : event.key === "End"
                    ? "device"
                    : transport === "device"
                      ? "cloud"
                      : "device"
              setSelected(next)
              document.getElementById(`${id}-${next}-tab`)?.focus()
            }}
          >
            {transport === "device" ? "局域网同步" : (reviewLabel ?? "云同步")}
          </button>
        ))}
      </div>
      <section
        className="sync-transport-device"
        role="tabpanel"
        id={`${id}-device-panel`}
        aria-labelledby={`${id}-device-tab`}
        hidden={current !== "device"}
      >
        <PeerSyncPanel standalone />
      </section>
      <section
        className="sync-transport-cloud"
        role="tabpanel"
        id={`${id}-cloud-panel`}
        aria-labelledby={`${id}-cloud-tab`}
        hidden={current !== "cloud"}
      >
        {children}
      </section>
    </>
  )
}
