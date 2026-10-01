// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest"
import { viewHtml } from "./sandbox"

afterEach(() => {
  window.dispatchEvent(new Event("pagehide"))
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
it("provides explorer state only to the mounted contribution and disposes observers", async () => {
  vi.stubGlobal("Uint8Array", new TextEncoder().encode("").constructor)
  vi.spyOn(window, "postMessage").mockImplementation((value) => {
    queueMicrotask(() =>
      window.dispatchEvent(
        new MessageEvent("message", {
          source: window,
          data: {
            protocol: "eidos-plugin",
            apiVersion: 1,
            id: value.id,
            result: {},
          },
        })
      )
    )
  })
  const html = viewHtml(
    `export default function(ctx) {
    const explorer = ctx.capabilities.explorer;
    document.body.dataset.initial = explorer.read().rootDirectory;
    const snapshot = explorer.read(); snapshot.rootDirectory = 'tampered';
    document.body.dataset.unchanged = explorer.read().rootDirectory;
    const subscription = explorer.watch(state => { document.body.dataset.active = state.activePath; subscription.dispose() });
  }`,
    {
      kind: "page",
      route: "",
      explorer: {
        rootDirectory: "docs",
        activePath: null,
        sort: { by: "name", direction: "ascending" },
      },
    }
  )
  document.body.innerHTML = '<div id="app"></div>'
  window.eval(
    html.slice(html.indexOf("<script>") + 8, html.indexOf("</script>"))
  )
  await vi.waitFor(() => expect(document.body.dataset.initial).toBe("docs"))
  expect(document.body.dataset.unchanged).toBe("docs")
  const update = (activePath: string) =>
    window.dispatchEvent(
      new MessageEvent("message", {
        source: window,
        data: {
          protocol: "eidos-plugin",
          apiVersion: 1,
          observation: "host.explorer",
          value: {
            rootDirectory: "docs",
            activePath,
            sort: { by: "type", direction: "descending" },
          },
        },
      })
    )
  update("docs/note.md")
  update("docs/other.md")
  expect(document.body.dataset.active).toBe("docs/note.md")
})
