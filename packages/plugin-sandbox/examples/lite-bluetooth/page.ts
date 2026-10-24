import type { Mount, Disposable } from "@eidos.space/plugin-sdk"
import { labels, parseState, type BatteryState } from "./status"

const mount: Mount = (ctx, root) => {
  const background = ctx.capabilities.background!
  let subscription: Disposable | undefined
  let generation = 0
  let busy = false
  let disposed = false
  let state: BatteryState = {
    phase: "idle",
    id: null,
    name: null,
    percent: null,
    error: null,
  }
  let failedAt = ""
  root.innerHTML = `<style>
    .battery-panel { max-width: 520px; margin: 40px auto; padding: 24px; font: 14px/1.6 system-ui; color: var(--foreground, inherit); }
    .battery-panel h1 { font-size: 20px; margin: 0 0 24px; }
    .battery-panel h2 { font-size: 17px; margin: 0; }
    .battery-panel p { margin: 8px 0; }
    .battery-panel .muted { opacity: .65; font-size: 13px; }
    .battery-panel .value { font-size: 48px; font-weight: 600; margin: 20px 0; }
    .battery-panel .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 24px; }
    .battery-panel button { font: inherit; padding: 7px 14px; border: 1px solid var(--border, #8885); border-radius: 6px; color: inherit; background: transparent; cursor: pointer; }
    .battery-panel button:disabled { opacity: .45; cursor: default; }
    .battery-panel .primary { background: var(--primary, #247080); color: var(--primary-foreground, white); }
    .battery-panel details { margin-top: 16px; overflow-wrap: anywhere; }
    .battery-panel [hidden] { display: none; }
  </style><section class="battery-panel">
    <h1>蓝牙电量</h1>
    <h2 data-device>选择设备</h2>
    <p data-status role="status" aria-live="polite"></p>
    <p class="value" data-value hidden></p>
    <p data-help class="muted"></p>
    <details data-details hidden><summary>错误详情</summary><p data-error></p></details>
    <div class="actions">
      <button class="primary" data-choose>选择设备</button>
      <button data-retry hidden>重试连接</button>
      <button data-read hidden>刷新电量</button>
      <button data-stop hidden>断开连接</button>
      <button data-resume>恢复后台状态</button>
    </div>
    <p class="muted">支持提供标准电量服务的低功耗蓝牙设备。关闭页面后连接继续保持。</p>
  </section>`
  const element = <T extends HTMLElement>(name: string) =>
    root.querySelector<T>("[data-" + name + "]")!
  const render = () => {
    if (disposed) return
    element("device").textContent =
      state.name || (state.id ? "未命名设备" : "选择设备")
    element("status").textContent = labels[state.phase]
    element("value").hidden =
      state.phase !== "connected" || state.percent === null
    element("value").textContent = state.percent + "%"
    element("details").hidden = !state.error
    element("error").textContent = state.error
    element("help").textContent =
      state.phase === "failed"
        ? failedAt === "services"
          ? "无法使用设备的标准电量服务。请确认设备支持 Battery Service，或选择其他设备。"
          : "请确认设备在附近、可连接，且未被其他应用占用，然后重试。"
        : state.phase === "disconnected"
          ? "设备连接已断开，电量不再更新。可以重试连接或选择其他设备。"
          : busy
            ? "请稍候；连接结果会显示在这里。"
            : state.phase === "connected"
              ? "电量读取成功，连接由后台保持。"
              : "点击选择设备开始连接。"
    element<HTMLButtonElement>("choose").disabled = busy
    element("choose").textContent = state.id ? "换个设备" : "选择设备"
    element("retry").hidden =
      !state.id || !["failed", "disconnected"].includes(state.phase)
    element<HTMLButtonElement>("retry").disabled = busy
    element("read").hidden = state.phase !== "connected"
    element<HTMLButtonElement>("read").disabled = busy
    element("stop").hidden =
      state.phase === "idle" ||
      state.phase === "stopped" ||
      state.phase === "selecting"
    element("stop").textContent = busy ? "取消连接" : "断开连接"
    element<HTMLButtonElement>("resume").disabled = busy
    element("resume").hidden = state.phase === "connected" || busy
  }
  const receive = (value: unknown) => {
    if (disposed) return
    if (value && typeof value === "object" && "failedAt" in value)
      failedAt = String(value.failedAt)
    state = parseState(value)
    render()
  }
  const subscribe = async (run: number) => {
    subscription?.dispose()
    const next = await background.onMessage((value) => {
      if (run === generation) receive(value)
    })
    if (run !== generation || disposed) next.dispose()
    else subscription = next
  }
  const execute = async (operation: (run: number) => Promise<void>) => {
    if (busy) return
    busy = true
    const run = ++generation
    render()
    try {
      await operation(run)
    } catch (error) {
      if (run === generation && !disposed) {
        const message = String(error)
        state = {
          ...state,
          phase: message.includes("selection cancelled") ? "idle" : "failed",
          error: message.includes("selection cancelled") ? null : message,
        }
      }
    } finally {
      if (run === generation) {
        busy = false
        render()
      }
    }
  }
  const connect = async (run: number) => {
    if (run !== generation) return
    state = { ...state, phase: "connecting", percent: null, error: null }
    failedAt = ""
    render()
    await subscribe(run)
    if (run !== generation) return
    const result = await background.request({
      command: "connect",
      id: state.id,
    })
    if (run === generation) receive(result)
  }
  element("choose").onclick = () =>
    void execute(async (run) => {
      const previous = state
      state = { ...state, phase: "selecting", error: null }
      render()
      let device: { id: string; name?: string }
      try {
        device = await background.requestDevice()
      } catch (error) {
        if (String(error).includes("selection cancelled")) {
          state = previous
          if (
            previous.phase === "connected" ||
            previous.phase === "disconnected"
          )
            await subscribe(run)
          return
        }
        throw error
      }
      if (run !== generation) return
      state = { ...state, id: device.id, name: device.name ?? null }
      await connect(run)
    })
  element("retry").onclick = () => void execute(connect)
  element("read").onclick = () =>
    void execute(async (run) => {
      await subscribe(run)
      const result = await background.request({ command: "read" })
      if (run === generation) receive(result)
    })
  element("resume").onclick = () =>
    void execute(async (run) => {
      await subscribe(run)
      const result = await background.request({ command: "status" })
      if (run === generation) receive(result)
    })
  element("stop").onclick = () => {
    element<HTMLButtonElement>("stop").disabled = true
    ++generation
    busy = true
    subscription?.dispose()
    subscription = undefined
    render()
    void background
      .stop()
      .then(() => {
        state = { ...state, phase: "stopped", percent: null, error: null }
      })
      .catch((error) => {
        state = { ...state, phase: "failed", error: String(error) }
      })
      .finally(() => {
        busy = false
        element<HTMLButtonElement>("stop").disabled = false
        render()
      })
  }
  render()
  ctx.subscriptions.add({
    dispose: () => {
      disposed = true
      ++generation
      subscription?.dispose()
    },
  })
}
export default mount
