import type { Activate } from "@eidos.space/plugin-sdk"

const activate: Activate = (ctx) => {
  ctx.capabilities.actions.register("increment", async ({ capabilities }) => {
    const result = await capabilities.background!.request({
      command: "increment",
    })
    await capabilities.ui.notify(JSON.stringify(result))
  })
  ctx.capabilities.actions.register("stop", async ({ capabilities }) => {
    await capabilities.background!.stop()
    await capabilities.ui.notify("Background stopped")
  })
}
export default activate
