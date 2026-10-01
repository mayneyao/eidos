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

function harness() {
  vi.stubGlobal("Uint8Array", new TextEncoder().encode("").constructor)
  const requests: Array<{ method: string; params: unknown }> = []
  const send = (data: object) =>
    window.dispatchEvent(
      new MessageEvent("message", {
        source: window,
        data: { protocol: "eidos-plugin", apiVersion: 1, ...data },
      })
    )
  vi.spyOn(window, "postMessage").mockImplementation((raw) => {
    const request = raw as { id: string; method?: string; params: unknown }
    if (!request.method) return
    requests.push({ method: request.method, params: request.params })
    queueMicrotask(() => send({ id: request.id, result: { rating: 4 } }))
  })
  const mount = (html: string) => {
    document.body.innerHTML = '<div id="app"></div>'
    window.eval(
      html.slice(html.indexOf("<script>") + 8, html.indexOf("</script>"))
    )
  }
  return { requests, send, mount }
}

const calls = `
  if ('readProperties' in ctx.capabilities.fs || 'patchProperties' in ctx.capabilities.fs) throw Error('Obsolete filesystem API');
  const filemeta = ctx.capabilities.filemeta;
  const metadata = await filemeta.read('note.md', 'space.eidos.meta');
  await filemeta.patch('note.md', 'space.eidos.meta', { set: { rating: metadata.rating }, remove: ['old'] });
  document.body.dataset.done = 'true';
`
const args = [
  { path: "note.md", namespace: "space.eidos.meta" },
  {
    path: "note.md",
    namespace: "space.eidos.meta",
    patch: { set: { rating: 4 }, remove: ["old"] },
  },
]

it("transports View filemeta calls through the standalone namespace", async () => {
  const { requests, mount } = harness()
  mount(
    viewHtml(`export default async function(ctx) { ${calls} }`, {
      kind: "page",
      route: "",
    })
  )
  await vi.waitFor(() => expect(document.body.dataset.done).toBe("true"))
  expect(requests.filter((r) => r.method.startsWith("filemeta."))).toEqual([
    { method: "filemeta.read", params: args[0] },
    { method: "filemeta.patch", params: args[1] },
  ])
})

it("scopes Action filemeta calls to their invocation", async () => {
  const { requests, send, mount } = harness()
  mount(
    extensionHtml(
      `export default function(extension) {
        extension.capabilities.actions.register('tag', async ctx => { ${calls} });
      }`,
      ["tag"]
    )
  )
  await vi.waitFor(() =>
    expect(requests.some((r) => r.method === "extension.ready")).toBe(true)
  )
  send({
    observation: "action.run",
    value: {
      invocation: "run-tag",
      action: "tag",
      kind: "file",
      path: "note.md",
    },
  })
  await vi.waitFor(() =>
    expect(requests.some((r) => r.method === "action.complete")).toBe(true)
  )
  expect(document.body.dataset.done).toBe("true")
  expect(requests.filter((r) => r.method.startsWith("filemeta."))).toEqual([
    {
      method: "filemeta.read",
      params: { invocation: "run-tag", args: args[0] },
    },
    {
      method: "filemeta.patch",
      params: { invocation: "run-tag", args: args[1] },
    },
  ])
  expect(requests.find((r) => r.method === "action.complete")?.params).toEqual({
    invocation: "run-tag",
  })
})
