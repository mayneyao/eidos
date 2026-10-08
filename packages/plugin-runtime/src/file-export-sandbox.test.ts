// @vitest-environment jsdom
import { readFileSync } from "node:fs"
import path from "node:path"
import { afterEach, expect, it, vi } from "vitest"
import { viewHtml } from "./sandbox"

afterEach(() => {
  window.dispatchEvent(new Event("pagehide"))
  document.body.replaceChildren()
  delete document.body.dataset.export
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it.each(["Lite", "Serve"])(
  "serializes PNG bytes and resolves host export results in the actual %s bootstrap",
  async (host) => {
    vi.stubGlobal("Uint8Array", new TextEncoder().encode("").constructor)
    document.body.innerHTML = '<div id="app"></div>'
    const request = vi.spyOn(window, "postMessage").mockImplementation(() => {})
    const mount = `async function(ctx) {
    const bytes = new Uint8Array(40000); bytes[0] = 255; bytes[39999] = 1;
    const result = await ctx.capabilities.ui.exportFile({ name: 'chart.png', mimeType: 'image/png', data: bytes });
    document.body.dataset.export = result.status;
  }`
    if (host === "Lite") {
      const html = viewHtml(`export default ${mount}`, {
        kind: "page",
        route: "",
        exportFile: true,
      })
      window.eval(
        html.slice(html.indexOf("<script>") + 8, html.indexOf("</script>"))
      )
    } else {
      const source = readFileSync(
        path.resolve(
          __dirname,
          "../../../crates/eidos-runtime-host/src/plugin_store.rs"
        ),
        "utf8"
      )
      const bootstrap = source.match(
        /const BOOTSTRAP_JS: &str = r#"([\s\S]*?)"#;/
      )![1]
      window.eval(
        `${bootstrap}\nbootstrap(${mount}, { tableId: 'table', viewId: 'view' });`
      )
    }
    await vi.waitFor(() =>
      expect(
        request.mock.calls.some(
          ([message]) => message.method === "ui.exportFile"
        )
      ).toBe(true)
    )
    const message = request.mock.calls.find(
      ([value]) => value.method === "ui.exportFile"
    )![0]
    expect(message.params.name).toBe("chart.png")
    const bytes = atob(message.params.data)
    expect(bytes.length).toBe(40000)
    expect(bytes.charCodeAt(0)).toBe(255)
    expect(bytes.charCodeAt(39999)).toBe(1)
    window.dispatchEvent(
      new MessageEvent("message", {
        source: window,
        data: {
          protocol: "eidos-plugin",
          apiVersion: 1,
          id: message.id,
          result: { status: "cancelled" },
        },
      })
    )
    await vi.waitFor(() =>
      expect(document.body.dataset.export).toBe("cancelled")
    )
  }
)

it("omits file export when the host does not provide it", async () => {
  const html = viewHtml(
    `export default function(ctx) {
    document.body.dataset.export = String('exportFile' in ctx.capabilities.ui);
  }`,
    { kind: "page", route: "" }
  )
  document.body.innerHTML = '<div id="app"></div>'
  window.eval(
    html.slice(html.indexOf("<script>") + 8, html.indexOf("</script>"))
  )
  await vi.waitFor(() => expect(document.body.dataset.export).toBe("false"))
})
