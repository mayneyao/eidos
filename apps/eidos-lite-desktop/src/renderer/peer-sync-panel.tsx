import { useEffect, useRef, useState } from "react"
import type { EidosLiteApi } from "../shared/contracts"

type Status = Awaited<ReturnType<EidosLiteApi["peerSync"]>>
type Action = Parameters<EidosLiteApi["peerSync"]>[0]
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
  const { status, busy, error, run } = usePeerStatus(false)
  return (
    <section
      className="peer-sync-panel p-4 text-sm"
      data-standalone={standalone || undefined}
      aria-label="当前 Space 的局域网同步"
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <strong>局域网同步</strong>
          <p className="mt-1 text-muted-foreground">向已配对设备开放此 Space</p>
        </div>
        <button
          type="button"
          className="settings-switch"
          role="switch"
          aria-label="开启此 Space 的局域网同步"
          aria-checked={status.running}
          disabled={busy || !status.serviceRunning}
          onClick={() => void run(status.running ? "stop" : "start")}
        >
          <span />
        </button>
      </div>
      <p className="my-4 text-muted-foreground">
        {!status.serviceRunning
          ? "先在设置 → 设备中开启局域网服务。"
          : status.running
            ? "已开放。切换 Space 或关闭编辑窗口后，仍可同步。"
            : "仅保存在本机，尚未向设备开放。"}
      </p>
      {status.running && (
        <div className="border-t border-border py-3" role="status">
          {status.activity ? (
            <>
              <p>
                {status.activity.device} ·{" "}
                {
                  {
                    syncing: "正在传输",
                    completed: "最近传输已结束",
                    review: "上次同步遇到冲突",
                    failed: "传输未完成，请重试",
                  }[status.activity.state]
                }
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(status.activity.updatedAt).toLocaleString()}
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">等待局域网同步</p>
          )}
        </div>
      )}
      <button
        className="mt-2"
        onClick={() => void window.eidosLite.openSettingsDestination("devices")}
      >
        {status.devices.length ? "管理设备 ↗" : "连接设备 ↗"}
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
  const { status, code, busy, error, run } = usePeerStatus(true)
  const [removing, setRemoving] = useState<string | null>(null)
  return (
    <section aria-labelledby="settings-devices">
      <h2 id="settings-devices">设备</h2>
      {status.deviceName && (
        <p className="mb-2 text-sm">本机 · {status.deviceName}</p>
      )}
      <p className="mb-6 text-muted-foreground">
        在同一局域网连接你的设备。配对一次，即可访问本机已开放的
        Spaces，无需云端账号。
      </p>
      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-row-copy">
            <strong>局域网服务</strong>
            <p>
              {status.running
                ? "已开启 · Eidos Lite 运行期间可连接"
                : "已关闭 · 已配对设备仍会保留"}
            </p>
          </div>
          <button
            type="button"
            className="settings-switch"
            role="switch"
            aria-label="局域网服务"
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
            <strong>连接新设备</strong>
            <p>手机扫码后，在这里确认配对。</p>
          </div>
          <button
            disabled={busy || !status.running}
            onClick={() => void run("devices-invite")}
          >
            显示配对码
          </button>
          {code && (
            <div className="flex basis-full flex-wrap items-start gap-4">
              <img
                width={200}
                height={200}
                src={code.qr}
                alt="设备配对二维码"
              />
              <div>
                <p>手机打开「同步」，扫描二维码。</p>
                <p className="my-2 text-muted-foreground">
                  五分钟内有效。只允许你认识的设备。
                </p>
                <button
                  onClick={() => void navigator.clipboard.writeText(code.value)}
                >
                  复制配对码
                </button>
              </div>
            </div>
          )}
          {status.pending && (
            <div className="basis-full" role="status">
              <p>允许「{status.pending}」连接？它将能读写已开放的 Spaces。</p>
              <div className="mt-3 flex gap-3">
                <button
                  disabled={busy}
                  onClick={() => void run("devices-approve")}
                >
                  允许配对
                </button>
                <button
                  disabled={busy}
                  onClick={() => void run("devices-reject")}
                >
                  拒绝
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <h3 className="mb-3 mt-8">已配对设备</h3>
      {status.devices.length === 0 ? (
        <p className="text-muted-foreground">尚未连接设备。</p>
      ) : (
        <div className="settings-group">
          {status.devices.map((device) => (
            <div className="settings-row" key={device.id}>
              <div className="settings-row-copy">
                <strong>{device.name}</strong>
                <p>
                  {device.lastSeenAt
                    ? "最近通信 · " +
                      new Date(device.lastSeenAt).toLocaleString()
                    : "已配对 · 尚无通信记录"}
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
                    确认移除
                  </button>
                  <button onClick={() => setRemoving(null)}>取消</button>
                </div>
              ) : (
                <button disabled={busy} onClick={() => setRemoving(device.id)}>
                  移除授权
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <h3 className="mb-3 mt-8">已开放的 Spaces</h3>
      <p className="mb-3 text-muted-foreground">
        在各 Space 的同步侧边栏开启或关闭。停止局域网服务会关闭所有 Space
        的局域网同步。
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
                打开 Space
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">尚未开放 Space。</p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-destructive">
          {error}
        </p>
      )}
    </section>
  )
}
