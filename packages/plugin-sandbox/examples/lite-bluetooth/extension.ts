import type { Activate } from "@eidos.space/plugin-sdk"
const activate: Activate = (ctx) => {
  ctx.capabilities.actions.register("connect", async ({ capabilities }) => {
    const background = capabilities.background!
    const device = await background.requestDevice()
    const result = await background.request({
      command: "connect",
      id: device.id,
    })
    await capabilities.ui.notify(JSON.stringify(result))
  })
  ctx.capabilities.actions.register("status", async ({ capabilities }) => {
    await capabilities.ui.notify(
      JSON.stringify(
        await capabilities.background!.request({ command: "status" })
      )
    )
  })
  ctx.capabilities.actions.register("stop", async ({ capabilities }) => {
    await capabilities.background!.stop()
    await capabilities.ui.notify(
      "Disconnected; background and device grant stopped."
    )
  })
}
export default activate
