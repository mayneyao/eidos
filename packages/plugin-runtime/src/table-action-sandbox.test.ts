// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest"
import { extensionHtml } from "./extension-sandbox"

afterEach(() => {
  window.dispatchEvent(new Event("pagehide"))
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it("activates and transports dynamic table menu and scoped run requests", async () => {
  vi.stubGlobal("Uint8Array", new TextEncoder().encode("").constructor)
  const requests: Array<{ method: string; params: Record<string, unknown> }> =
    []
  const send = (data: unknown) =>
    window.dispatchEvent(
      new MessageEvent("message", {
        source: window,
        data: { protocol: "eidos-plugin", apiVersion: 1, ...(data as object) },
      })
    )
  vi.spyOn(window, "postMessage").mockImplementation((raw) => {
    const message = raw as {
      method?: string
      id: string
      params: Record<string, unknown>
    }
    if (!message.method) return
    requests.push({ method: message.method, params: message.params })
    queueMicrotask(() =>
      send({
        id: message.id,
        result:
          message.method === "table.pluginConfig.read"
            ? { value: { title: "Classify" }, version: "v1" }
            : null,
      })
    )
  })
  const html = extensionHtml(
    `export default function(ctx) {
    ctx.actions.registerTableProvider('smart', {
      async getItems({table}) { const config = await table.pluginConfig.read(); return [{id:'one',title:config.value.title,targets:['view']}]; },
      async run(ctx) { await ctx.task.report({completed:0}); }
    });
  }`,
    ["smart"]
  )
  document.body.innerHTML = '<div id="app"></div>'
  window.eval(
    html.slice(html.indexOf("<script>") + 8, html.indexOf("</script>"))
  )
  await vi.waitFor(() =>
    expect(requests.some((r) => r.method === "table.actions.ready")).toBe(true)
  )
  send({
    observation: "host.tableAction",
    value: {
      id: "list",
      operation: "list",
      provider: "smart",
      tableId: "table",
      viewId: "grid",
      count: 4,
    },
  })
  await vi.waitFor(() =>
    expect(
      requests.find((r) => r.method === "table.actions.result")?.params
    ).toEqual({
      runId: "list",
      items: [{ id: "one", title: "Classify", targets: ["view"] }],
    })
  )
  send({
    observation: "host.tableAction",
    value: {
      id: "run",
      operation: "run",
      provider: "smart",
      itemId: "one",
      tableId: "table",
      viewId: "grid",
      count: 4,
    },
  })
  await vi.waitFor(() =>
    expect(
      requests.some(
        (r) => r.method === "table.task.report" && r.params.runId === "run"
      )
    ).toBe(true)
  )
})
