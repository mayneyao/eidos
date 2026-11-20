// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest"
import { viewHtml } from "./sandbox"

afterEach(() => {
  window.dispatchEvent(new Event("pagehide"))
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it.each([true, false])(
  "exposes sidebar navigation only when the host opts in (%s)",
  async (enabled) => {
    vi.stubGlobal("Uint8Array", new TextEncoder().encode("").constructor)
    const post = vi
      .spyOn(window, "postMessage")
      .mockImplementation((request) => {
        queueMicrotask(() =>
          window.dispatchEvent(
            new MessageEvent("message", {
              source: window,
              data: { ...request, result: null },
            })
          )
        )
      })
    const html = viewHtml(
      `export default async function(ctx, root) {
      const { ui } = ctx.capabilities;
      if (ui.openFileInSidebar) await ui.openFileInSidebar("notes/Source.md");
      root.textContent = typeof ui.openFileInSidebar;
    }`,
      {
        kind: "page",
        route: "",
        ...(enabled ? { openFileInSidebar: true } : {}),
      }
    )
    document.body.innerHTML = '<div id="app"></div>'
    window.eval(
      html.slice(html.indexOf("<script>") + 8, html.indexOf("</script>"))
    )
    await vi.waitFor(() =>
      expect(document.querySelector("#app")?.textContent).toBe(
        enabled ? "function" : "undefined"
      )
    )
    const sidebar = post.mock.calls
      .map(([request]) => request)
      .filter((request) => request.method === "ui.openFileInSidebar")
    expect(sidebar.map((request) => request.params)).toEqual(
      enabled ? [{ relativePath: "notes/Source.md" }] : []
    )
  }
)
