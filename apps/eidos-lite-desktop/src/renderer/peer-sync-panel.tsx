import { useEffect, useState } from "react"
import type { EidosLiteApi } from "../shared/contracts"

type Status = Awaited<ReturnType<EidosLiteApi["peerSync"]>>
export function PeerSyncPanel() {
  const [status, setStatus] = useState<Status>({ running: false, devices: [] })
  const [code, setCode] = useState<{ value: string; qr: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const run = async (
    action: Parameters<EidosLiteApi["peerSync"]>[0],
    id?: string
  ) => {
    setBusy(true)
    setError("")
    try {
      const next = await window.eidosLite.peerSync(action, id)
      setStatus(next)
      if (next.invitation && next.qr)
        setCode({ value: next.invitation, qr: next.qr })
      if (action === "stop" || action === "approve" || action === "reject")
        setCode(null)
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    let active = true
    const poll = () => {
      void window.eidosLite
        .peerSync("status")
        .then((value) => {
          if (active) setStatus(value)
        })
        .catch(() => {})
    }
    poll()
    const timer = setInterval(poll, 2000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [])
  return (
    <details className="peer-sync-panel border-b border-border p-3 text-sm">
      <summary className="cursor-pointer">设备直连 · 同一 Wi-Fi</summary>
      <p className="my-2 text-muted-foreground">
        开放此 Space
        的设备同步，无需云端账号。设备配对一次后，可访问本机已开启设备同步的
        Space。
      </p>
      <div className="flex gap-3">
        <button disabled={busy} onClick={() => void run("start")}>
          {status.running ? "配对另一台设备" : "开启设备同步"}
        </button>
        {status.running && (
          <button disabled={busy} onClick={() => void run("stop")}>
            停止
          </button>
        )}
      </div>
      {code && (
        <div className="my-3">
          <img width={240} height={240} src={code.qr} alt="设备配对二维码" />
          <p>手机扫描二维码，或复制配对码。五分钟内有效。</p>
          <button
            onClick={() => void navigator.clipboard.writeText(code.value)}
          >
            复制配对码
          </button>
        </div>
      )}
      {status.pending && (
        <div className="my-3">
          <p>
            信任「{status.pending}」？此设备将能读写本机已开启设备同步的 Space。
          </p>
          <button disabled={busy} onClick={() => void run("approve")}>
            允许配对
          </button>
          <button
            className="ml-3"
            disabled={busy}
            onClick={() => void run("reject")}
          >
            拒绝
          </button>
        </div>
      )}
      {status.devices.map((device) => (
        <div className="mt-2 flex justify-between" key={device.id}>
          <span>{device.name}</span>
          <button disabled={busy} onClick={() => void run("revoke", device.id)}>
            移除设备
          </button>
        </div>
      ))}
      {error && (
        <p role="alert" className="mt-2 text-destructive">
          {error}
        </p>
      )}
    </details>
  )
}
