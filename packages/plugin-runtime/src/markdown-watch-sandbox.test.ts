// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest"
import { viewHtml } from "./sandbox"

afterEach(() => {
  window.dispatchEvent(new Event("pagehide"))
  document.body.replaceChildren()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it("delivers Markdown invalidations and stops after disposal", async () => {
  vi.stubGlobal("Uint8Array", new TextEncoder().encode("").constructor)
  const requests: Array<{
    id: string
    method: string
    params: { id?: string; folder?: string }
  }> = []
  vi.spyOn(window, "postMessage").mockImplementation((value) => {
    const request = value as (typeof requests)[number]
    requests.push(request)
    queueMicrotask(() =>
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
    )
  })
  const html = viewHtml(
    `export default async function(ctx) {
      let subscription;
      subscription = await ctx.ui.observeMarkdownFiles('journals', () => {
        document.body.dataset.events += 'change;';
        subscription.dispose();
      });
      document.body.dataset.ready = 'yes';
    }`,
    { kind: "page", route: "" }
  )
  document.body.innerHTML = '<div id="app"></div>'
  document.body.dataset.events = ""
  window.eval(
    html.slice(html.indexOf("<script>") + 8, html.indexOf("</script>"))
  )
  await vi.waitFor(() => expect(document.body.dataset.ready).toBe("yes"))
  const registration = requests.find(
    (request) => request.method === "ui.observeMarkdownFiles"
  )
  expect(registration?.params.folder).toBe("journals")
  const invalidate = () =>
    window.dispatchEvent(
      new MessageEvent("message", {
        source: window,
        data: {
          protocol: "eidos-plugin",
          apiVersion: 1,
          observation: registration!.params.id,
          value: null,
        },
      })
    )
  invalidate()
  invalidate()
  expect(document.body.dataset.events).toBe("change;")
  expect(requests).toContainEqual(
    expect.objectContaining({
      method: "ui.unobserveMarkdownFiles",
      params: { id: registration!.params.id },
    })
  )
})
