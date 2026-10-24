import { useEffect, useRef, useState } from "react"
import type { BluetoothPickerState } from "../shared/plugins"
import { useEidosLiteI18n } from "./i18n"

export function PluginBluetoothPicker() {
  const [state, setState] = useState<BluetoothPickerState | null>(null)
  useEffect(() => window.eidosLite.onBluetoothPicker(setState), [])
  return state ? <Picker key={state.id} state={state} /> : null
}

function Picker({ state }: { state: BluetoothPickerState }) {
  const { locale } = useEidosLiteI18n()
  const text = (en: string, zh: string) => (locale === "zh" ? zh : en)
  const dialog = useRef<HTMLDialogElement>(null)
  const scanStarted = useRef(false)
  const [selected, setSelected] = useState("")
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const act = async (action: "scan" | "cancel" | "select") => {
    setError("")
    if (action === "select") setSubmitting(true)
    try {
      await window.eidosLite.bluetoothPickerAction(state.id, action, selected)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSubmitting(false)
    }
  }
  useEffect(() => {
    const element = dialog.current!
    const previous = document.activeElement
    element.showModal()
    if (!scanStarted.current && !state.scanned && !state.scanning) {
      scanStarted.current = true
      void act("scan")
    }
    return () => {
      element.close()
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus()
    }
  }, [])
  const devices = state.devices
  const valid = state.devices.some((d) => d.id === selected)
  return (
    <dialog
      ref={dialog}
      className="bluetooth-picker"
      aria-labelledby="bluetooth-title"
      onCancel={(event) => {
        event.preventDefault()
        void act("cancel")
      }}
    >
      <header>
        <h2 id="bluetooth-title">
          {state.pluginName}{" "}
          {text("wants to connect to a Bluetooth device", "想要连接蓝牙设备")}
        </h2>
        {state.allServices && (
          <p className="text-muted-foreground">
            {text(
              "Allows reading, writing and notifications on the selected device.",
              "允许读取、写入和订阅所选设备。"
            )}
          </p>
        )}
        {state.networkOrigins.includes("*") && (
          <p className="text-muted-foreground">
            {text(
              "Also allows access to public HTTPS/WSS services.",
              "同时允许访问公网 HTTPS/WSS 服务。"
            )}
          </p>
        )}
      </header>
      <div
        className="bluetooth-devices"
        role="radiogroup"
        aria-label={text("Devices", "设备")}
        aria-busy={state.scanning}
      >
        {devices.map((device) => (
          <label key={device.id} className="bluetooth-device">
            <input
              type="radio"
              name="bluetooth-device"
              value={device.id}
              checked={selected === device.id}
              onChange={() => setSelected(device.id)}
            />
            <span>
              <strong>
                {device.name || text("Unnamed device", "未命名设备")}
              </strong>
              {(!device.name ||
                devices.filter((d) => d.name === device.name).length > 1) && (
                <small>{device.id}</small>
              )}
            </span>
          </label>
        ))}
        {!devices.length && (
          <p className="text-muted-foreground">
            {!state.scanning && state.scanned
              ? text(
                  "No devices found. Make sure your device is discoverable.",
                  "未发现设备，请确认设备可被发现。"
                )
              : ""}
          </p>
        )}
      </div>
      {(error || state.error) && <p role="alert">{error || state.error}</p>}
      <footer>
        <div className="bluetooth-scan">
          {state.scanning && (
            <span role="status">{text("Scanning…", "正在扫描…")}</span>
          )}
          {!state.scanning && (state.scanned || state.error) && (
            <button onClick={() => void act("scan")}>
              {text("Scan again", "重新扫描")}
            </button>
          )}
        </div>
        <div className="bluetooth-actions">
          <button onClick={() => void act("cancel")}>
            {text("Cancel", "取消")}
          </button>
          <button
            className="bluetooth-confirm"
            disabled={!valid || state.scanning || submitting}
            onClick={() => void act("select")}
          >
            {text("Connect", "连接")}
          </button>
        </div>
      </footer>
    </dialog>
  )
}
