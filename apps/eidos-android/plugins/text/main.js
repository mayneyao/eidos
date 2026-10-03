/** @type {import('../../../../packages/plugin-sdk/src/index').Mount} */
export default async function mount(ctx, root) {
  if (!ctx.capabilities.document) throw new Error("A text document is required")
  const snapshot = await ctx.capabilities.document.read()
  if (ctx.signal.aborted) return
  const text = document.createElement("pre")
  text.style.cssText =
    "white-space:pre-wrap;overflow-wrap:anywhere;font:14px/1.6 monospace;margin:0;padding:16px"
  text.textContent = snapshot.text
  root.replaceChildren(text)
  return {
    dispose() {
      root.replaceChildren()
    },
  }
}
