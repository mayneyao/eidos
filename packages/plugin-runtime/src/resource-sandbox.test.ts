// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest"
import { viewHtml, sandboxCsp } from "./sandbox"
afterEach(() => {
  window.dispatchEvent(new Event("pagehide"))
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
it.each([false, true])(
  "exposes the presentation mode to a file view (embedded=%s)",
  async (embedded) => {
    vi.stubGlobal("Uint8Array", new TextEncoder().encode("").constructor)
    vi.spyOn(window, "postMessage").mockImplementation(() => {})
    document.body.innerHTML = '<div id="app"></div>'
    const html = viewHtml(
      "export default function(ctx, root) { root.textContent = ctx.presentation.mode; }",
      {
        kind: "file",
        path: "route.gpx",
        name: "route.gpx",
        baseName: "route",
        extension: ".gpx",
        size: 0,
        embedded,
      }
    )
    window.eval(
      html.slice(html.indexOf("<script>") + 8, html.indexOf("</script>"))
    )
    await vi.waitFor(() =>
      expect(document.querySelector("#app")?.textContent).toBe(
        embedded ? "embedded" : "standalone"
      )
    )
  }
)
it("mounts through the host, measures the container and disposes its layout observers", async () => {
  vi.stubGlobal("Uint8Array", new TextEncoder().encode("").constructor)
  document.body.innerHTML = '<div id="app"></div>'
  // jsdom has no native Popover API. Model its open-popover query explicitly.
  const menu = document.createElement("div")
  menu.getBoundingClientRect = () =>
    ({ left: 20, top: 30, width: 168, height: 110 }) as DOMRect
  const query = document.querySelectorAll.bind(document)
  vi.spyOn(document, "querySelectorAll").mockImplementation((selector) =>
    selector === ":popover-open"
      ? ([menu] as unknown as NodeListOf<Element>)
      : query(selector)
  )
  const disconnect = vi.fn()
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect = disconnect
    }
  )
  const requests = vi.spyOn(window, "postMessage").mockImplementation(() => {})
  const html = viewHtml(
    `export default async function(ctx, root) {
    root.style.pointerEvents = 'none';
    const handle = await ctx.capabilities.ui.resources.mount(root, { kind: 'file', path: 'notes.md' });
    window.addEventListener('test-dispose', () => handle.dispose(), { once: true });
  }`,
    {
      kind: "document",
      file: {
        path: "main.dashboard",
        name: "main.dashboard",
        baseName: "main",
        extension: ".dashboard",
        size: 0,
      },
      resources: true,
    }
  )
  window.eval(
    html.slice(html.indexOf("<script>") + 8, html.indexOf("</script>"))
  )
  await vi.waitFor(() =>
    expect(
      requests.mock.calls.some(([r]) => r.method === "resources.mount")
    ).toBe(true)
  )
  const request = requests.mock.calls.find(
    ([r]) => r.method === "resources.mount"
  )![0]
  expect(request.params.source).toEqual({ kind: "file", path: "notes.md" })
  window.dispatchEvent(
    new MessageEvent("message", {
      source: window,
      data: {
        protocol: "eidos-plugin",
        apiVersion: 1,
        id: request.id,
        result: null,
      },
    })
  )
  await vi.waitFor(() =>
    expect(
      requests.mock.calls.some(([r]) => r.method === "resources.layout")
    ).toBe(true)
  )
  window.dispatchEvent(new Event("test-dispose"))
  expect(
    requests.mock.calls.find(([r]) => r.method === "resources.layout")![0]
      .params.rect.occlusions
  ).toEqual([{ x: 20, y: 30, width: 168, height: 110 }])
  expect(
    requests.mock.calls.find(([r]) => r.method === "resources.layout")![0]
      .params.rect.interactive
  ).toBe(false)
  expect(disconnect).toHaveBeenCalled()
  expect(
    requests.mock.calls.some(([r]) => r.method === "resources.dispose")
  ).toBe(true)
  expect(sandboxCsp()).toContain("frame-src 'none'")
})
