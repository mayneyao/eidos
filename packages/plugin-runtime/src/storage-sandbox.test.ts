// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest"
import { viewHtml } from "./sandbox"

afterEach(() => {
  window.dispatchEvent(new Event("pagehide"))
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it("forwards opaque storage tokens and binary bytes without collapsing an empty object into absence", async () => {
  vi.stubGlobal("Uint8Array", new TextEncoder().encode("").constructor)
  const calls: { method: string; params: unknown }[] = []
  vi.spyOn(window, "postMessage").mockImplementation((value) => {
    calls.push(value)
    let result: unknown = {}
    if (value.method === "storage.readVersioned")
      result =
        value.params.key === "empty"
          ? { data: "", version: "empty-token" }
          : { data: null, version: null }
    if (value.method === "storage.compareAndWrite")
      result = { applied: false, version: "newer-token" }
    queueMicrotask(() =>
      window.dispatchEvent(
        new MessageEvent("message", {
          source: window,
          data: {
            protocol: "eidos-plugin",
            apiVersion: 1,
            id: value.id,
            result,
          },
        })
      )
    )
  })
  const html = viewHtml(
    `export default async function(ctx,root){
    const empty=await ctx.capabilities.storage.readVersioned('empty');
    const missing=await ctx.capabilities.storage.readVersioned('missing');
    const written=await ctx.capabilities.storage.compareAndWrite('empty',empty.version,new Uint8Array([0,255,1]));
    root.dataset.result=JSON.stringify({empty:empty.data.length,version:empty.version,missing:missing.data,missingVersion:missing.version,written});
  }`,
    { kind: "page", route: "" }
  )
  document.body.innerHTML = '<div id="app"></div>'
  window.eval(
    html.slice(html.indexOf("<script>") + 8, html.indexOf("</script>"))
  )
  await vi.waitFor(() =>
    expect(
      document.querySelector<HTMLElement>("#app")?.dataset.result
    ).toBeTruthy()
  )
  expect(
    JSON.parse(document.querySelector<HTMLElement>("#app")!.dataset.result!)
  ).toEqual({
    empty: 0,
    version: "empty-token",
    missing: null,
    missingVersion: null,
    written: { applied: false, version: "newer-token" },
  })
  expect(
    calls.find((c) => c.method === "storage.compareAndWrite")?.params
  ).toEqual({ key: "empty", expectedVersion: "empty-token", data: "AP8B" })
})
