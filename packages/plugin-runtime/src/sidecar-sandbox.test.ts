// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { viewHtml } from "./sandbox"

beforeEach(() => {
  vi.stubGlobal("Uint8Array", new TextEncoder().encode("").constructor)
})

afterEach(() => {
  window.dispatchEvent(new Event("pagehide"))
  document.body.replaceChildren()
  for (const name of ["data-done", "data-native", "data-native-reply"])
    document.body.removeAttribute(name)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it.each([false, true])(
  "serializes optional sidecar capabilities and disposes observers (enabled: %s)",
  async (enabled) => {
    const methods: string[] = []
    let observation = ""
    vi.spyOn(window, "postMessage").mockImplementation((value) => {
      if (value.method?.startsWith("sidecar.")) methods.push(value.method)
      if (value.method === "sidecar.observe") observation = value.params.id
      queueMicrotask(() => {
        if (value.method === "sidecar.send")
          window.dispatchEvent(
            new MessageEvent("message", {
              source: window,
              data: {
                protocol: "eidos-plugin",
                apiVersion: 1,
                observation,
                value: { type: "message", data: { answer: "中文" } },
              },
            })
          )
        window.dispatchEvent(
          new MessageEvent("message", {
            source: window,
            data: {
              protocol: "eidos-plugin",
              apiVersion: 1,
              id: value.id,
              result:
                value.method === "sidecar.status"
                  ? { available: true, running: false, command: "agent" }
                  : null,
            },
          })
        )
      })
    })
    const html = viewHtml(
      `export default async function(ctx) {
        const native = ctx.capabilities.sidecar;
        document.body.dataset.native = String(!!native);
        if (native) {
          const observer = await native.onEvent(event => {
            document.body.dataset.nativeReply = JSON.stringify(event);
          });
          await native.status();
          await native.start();
          await native.send({ type: 'ping' });
          await native.stop();
          observer.dispose();
        }
        document.body.dataset.done = 'true';
      }`,
      { kind: "page", route: "", sidecar: enabled }
    )
    document.body.innerHTML = '<div id="app"></div>'
    window.eval(
      html.slice(html.indexOf("<script>") + 8, html.indexOf("</script>"))
    )
    await vi.waitFor(() => expect(document.body.dataset.done).toBe("true"))
    expect(document.body.dataset.native).toBe(String(enabled))
    expect(methods).toEqual(
      enabled
        ? [
            "sidecar.observe",
            "sidecar.status",
            "sidecar.start",
            "sidecar.send",
            "sidecar.stop",
            "sidecar.unobserve",
          ]
        : []
    )
    if (enabled)
      expect(JSON.parse(document.body.dataset.nativeReply!)).toEqual({
        type: "message",
        data: { answer: "中文" },
      })
  }
)
