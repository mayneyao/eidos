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
    ctx.capabilities.actions.registerTableProvider('smart', {
      async getItems({capabilities}) {
        if ('target' in capabilities || 'task' in capabilities || 'connections' in capabilities) throw Error('Run capabilities exposed during listing');
        const config = await capabilities.eidos.config.read(capabilities.eidos.table.tableId);
        return [{id:'one',title:config.value.title,targets:['view']}];
      },
      async run({capabilities}) {
        if ('preview' in capabilities.task || 'read' in capabilities.target || 'read' in capabilities.eidos.table) throw Error('Obsolete API exposed');
        await capabilities.eidos.table.readContext();
        await capabilities.target.readRows({offset:0,limit:1,fields:['title']});
        const result = await capabilities.task.declareOutputs([{readToken:'token',values:{title:'Done'}}]);
        if (result !== undefined) throw Error('Output declaration must return void');
        await capabilities.task.report({completed:0});
      }
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
  expect(requests).toEqual(
    expect.arrayContaining([
      { method: "table.readContext", params: { runId: "run", args: null } },
      {
        method: "table.target.readRows",
        params: {
          runId: "run",
          args: { offset: 0, limit: 1, fields: ["title"] },
        },
      },
      {
        method: "table.task.declareOutputs",
        params: {
          runId: "run",
          args: { rows: [{ readToken: "token", values: { title: "Done" } }] },
        },
      },
    ])
  )
})
