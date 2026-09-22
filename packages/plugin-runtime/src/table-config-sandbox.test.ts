// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest"
import { viewHtml } from "./sandbox"

afterEach(() => {
  window.dispatchEvent(new Event("pagehide"))
  document.body.replaceChildren()
  delete document.body.dataset.events
  delete document.body.dataset.ready
  vi.unstubAllGlobals()
})

it("keeps table and config subscriptions independent in the serialized guest", async () => {
  // jsdom replaces typed-array globals while Node's TextEncoder keeps its own realm.
  vi.stubGlobal("Uint8Array", new TextEncoder().encode("").constructor)
  const html = viewHtml(
    `export default function(ctx) {
    const table = ctx.binding.table;
    table.observe(() => { document.body.dataset.events += 'view;'; });
    const config = table.pluginConfig.observe(() => {
      document.body.dataset.events += 'config;';
      config.dispose();
    });
    document.body.dataset.ready = 'yes';
  }`,
    { kind: "table", tableId: "table", viewId: "view" }
  )
  document.body.innerHTML = '<div id="app"></div>'
  document.body.dataset.events = ""
  const script = html.slice(
    html.indexOf("<script>") + 8,
    html.indexOf("</script>")
  )
  window.eval(script)
  await Promise.resolve()
  expect(document.body.dataset.ready).toBe("yes")
  const invalidate = () =>
    window.dispatchEvent(
      new MessageEvent("message", {
        source: window,
        data: {
          protocol: "eidos-plugin",
          apiVersion: 1,
          observation: "host.table",
          value: null,
        },
      })
    )
  invalidate()
  invalidate()
  expect(document.body.dataset.events).toBe("view;config;view;")
})
