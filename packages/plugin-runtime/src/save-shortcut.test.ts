// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest"
import { viewHtml } from "./sandbox"

afterEach(() => {
  window.dispatchEvent(new Event("pagehide"))
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it.each([false, true])(
  "saves exactly once with a plugin save handler=%s, including host forwarding",
  async (handled) => {
    vi.stubGlobal("Uint8Array", new TextEncoder().encode("").constructor)
    document.body.innerHTML = '<div id="app" tabindex="0"></div>'
    const requests = vi
      .spyOn(window, "postMessage")
      .mockImplementation((message) => {
        queueMicrotask(() =>
          window.dispatchEvent(
            new MessageEvent("message", {
              source: window,
              data: {
                protocol: "eidos-plugin",
                apiVersion: 1,
                id: message.id,
                result: {},
              },
            })
          )
        )
      })
    const html = viewHtml(
      `export default function(ctx, root) {
    ${handled ? 'root.addEventListener("keydown", event => { if (event.key === "s") { event.preventDefault(); ctx.capabilities.document.save(); } });' : ""}
  }`,
      { kind: "document" }
    )
    window.eval(
      html.slice(html.indexOf("<script>") + 8, html.indexOf("</script>"))
    )
    await new Promise((resolve) => setTimeout(resolve, 0))
    document.getElementById("app")!.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "s",
        metaKey: true,
        bubbles: true,
        cancelable: true,
      })
    )
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(
      requests.mock.calls.filter(([m]) => m.method === "document.save")
    ).toHaveLength(1)
    window.dispatchEvent(
      new MessageEvent("message", {
        source: window,
        data: {
          protocol: "eidos-plugin",
          apiVersion: 1,
          observation: "host.save",
        },
      })
    )
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(
      requests.mock.calls.filter(([m]) => m.method === "document.save")
    ).toHaveLength(2)
  }
)
