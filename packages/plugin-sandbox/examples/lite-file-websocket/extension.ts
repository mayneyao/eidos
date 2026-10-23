import type { Activate } from "@eidos.space/plugin-sdk"
const activate: Activate = (ctx) => {
  ctx.capabilities.actions.register("stop", async ({ capabilities }) => {
    await capabilities.background!.stop()
    await capabilities.ui.notify("Shared WebSocket stopped")
  })
}
export default activate
