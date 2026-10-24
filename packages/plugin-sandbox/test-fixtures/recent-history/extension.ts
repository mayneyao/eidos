import type { Activate } from "@eidos.space/plugin-sdk"
const activate: Activate = (ctx) => {
  ctx.capabilities.actions.register("open", async ({ capabilities }) => {
    await capabilities.ui.navigate!("history", "/")
  })
}
export default activate
