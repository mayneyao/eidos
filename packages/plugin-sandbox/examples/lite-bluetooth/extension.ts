import type { Activate } from "@eidos.space/plugin-sdk"
import { labels, parseState } from "./status"
const activate: Activate = (ctx) => {
  ctx.capabilities.actions.register("open-panel", async ({ capabilities }) => {
    if (!capabilities.ui.navigate) throw new Error("当前宿主不支持打开插件面板")
    await capabilities.ui.navigate("battery", "/")
  })
  ctx.capabilities.actions.register("connect", async ({ capabilities }) => {
    const background = capabilities.background!
    const device = await background.requestDevice()
    await capabilities.ui.notify(
      "正在连接 " + (device.name || "蓝牙设备") + "，并检查电量服务…"
    )
    const result = await background.request({
      command: "connect",
      id: device.id,
    })
    const state = parseState(result)
    await capabilities.ui.notify(
      state.phase === "connected"
        ? (state.name || "设备") + " 已连接 · 电量 " + state.percent + "%"
        : "连接失败：" + (state.error || labels[state.phase])
    )
  })
  ctx.capabilities.actions.register("status", async ({ capabilities }) => {
    const state = parseState(
      await capabilities.background!.request({ command: "status" })
    )
    await capabilities.ui.notify(
      (state.name || "蓝牙设备") +
        " · " +
        labels[state.phase] +
        (state.phase === "connected" && state.percent !== null
          ? " · " + state.percent + "%"
          : "") +
        (state.error ? "：" + state.error : "")
    )
  })
  ctx.capabilities.actions.register("stop", async ({ capabilities }) => {
    await capabilities.background!.stop()
    await capabilities.ui.notify("已断开连接，后台已停止，设备授权已撤销。")
  })
}
export default activate
