// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest"
import { extensionHtml } from "./extension-sandbox"
import { viewHtml } from "./sandbox"

afterEach(() => {
  window.dispatchEvent(new Event("pagehide"))
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function guest() {
  vi.stubGlobal("Uint8Array", new TextEncoder().encode("").constructor)
  const send = (data: object) =>
    window.dispatchEvent(
      new MessageEvent("message", {
        source: window,
        data: { protocol: "eidos-plugin", apiVersion: 1, ...data },
      })
    )
  const post = vi.spyOn(window, "postMessage").mockImplementation((request) => {
    queueMicrotask(() => send({ id: request.id, result: null }))
  })
  const mount = (html: string) => {
    document.body.innerHTML = '<div id="app"></div>'
    window.eval(
      html.slice(html.indexOf("<script>") + 8, html.indexOf("</script>"))
    )
  }
  const requests = (method: string) =>
    post.mock.calls
      .map(([request]) => request)
      .filter((r) => r.method === method)
  return { send, mount, requests }
}

it.each([true, false])(
  "advertises supported openFile targets and forwards the options (%s)",
  async (enabled) => {
    const { mount, requests } = guest()
    mount(
      viewHtml(
        `export default async function(ctx, root) {
      const { ui } = ctx.capabilities;
      await ui.openFile("notes/Main.md");
      await ui.openFile("notes/Explicit.md", { target: "main" });
      if (ui.openFileTargets.includes("sidebar"))
        await ui.openFile("notes/Source.md", { target: "sidebar" });
      root.textContent = ui.openFileTargets.join(",");
    }`,
        {
          kind: "page",
          route: "",
          sidebarFileOpen: enabled,
        }
      )
    )
    await vi.waitFor(() =>
      expect(document.querySelector("#app")?.textContent).toBe(
        enabled ? "main,sidebar" : "main"
      )
    )
    expect(requests("ui.openFile").map((request) => request.params)).toEqual([
      { relativePath: "notes/Main.md" },
      { relativePath: "notes/Explicit.md", target: "main" },
      ...(enabled
        ? [{ relativePath: "notes/Source.md", target: "sidebar" }]
        : []),
    ])
  }
)

it("forwards a sidebar target within the active action invocation", async () => {
  const { mount, send, requests } = guest()
  mount(
    extensionHtml(
      `export default function(extension) {
      extension.capabilities.actions.register("open", async ({ capabilities: { ui } }) => {
        if (ui.openFileTargets.includes("sidebar"))
          await ui.openFile("notes/Source.md", { target: "sidebar" });
      });
    }`,
      ["open"]
    )
  )
  await vi.waitFor(() => expect(requests("extension.ready")).toHaveLength(1))
  send({
    observation: "action.run",
    value: {
      invocation: "run-open",
      action: "open",
      kind: "workspace",
      sidebarFileOpen: true,
    },
  })
  await vi.waitFor(() => expect(requests("action.complete")).toHaveLength(1))
  expect(requests("ui.openFile").map((request) => request.params)).toEqual([
    {
      invocation: "run-open",
      args: { relativePath: "notes/Source.md", target: "sidebar" },
    },
  ])
})
