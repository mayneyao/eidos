// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { viewHtml } from "./sandbox"

beforeEach(() => {
  vi.stubGlobal("Uint8Array", new TextEncoder().encode("").constructor)
})

afterEach(() => {
  window.dispatchEvent(new Event("pagehide"))
  window.name = ""
  document.documentElement.removeAttribute("style")
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it("applies the host presentation before mounting and keeps theme updates working", async () => {
  vi.stubGlobal("CSS", { supports: () => true })
  window.name =
    "eidos-plugin-theme:" +
    JSON.stringify({
      "--eidos-background": "rgb(240, 244, 255)",
      "--eidos-foreground": "rgb(20, 25, 30)",
      "--eidos-color-scheme": "dark",
      "--eidos-accent": "url(https://untrusted.example/image)",
      "--unexpected": "red",
    })
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
    `export default function() {
    document.body.dataset.mountBackground = document.documentElement.style.getPropertyValue('--eidos-background');
    document.body.dataset.mountAppearance = document.documentElement.style.getPropertyValue('--eidos-color-scheme');
  }`,
    { kind: "page", route: "" }
  )
  document.body.innerHTML = '<div id="app"></div>'
  window.eval(
    html.slice(html.indexOf("<script>") + 8, html.indexOf("</script>"))
  )
  await vi.waitFor(() =>
    expect(document.body.dataset.mountBackground).toBe("rgb(240, 244, 255)")
  )
  expect(document.body.dataset.mountAppearance).toBe("dark")
  expect(
    document.documentElement.style.getPropertyValue("--eidos-accent")
  ).toBe("")
  expect(document.documentElement.style.getPropertyValue("--unexpected")).toBe(
    ""
  )
  window.dispatchEvent(
    new MessageEvent("message", {
      source: window,
      data: {
        protocol: "eidos-plugin",
        apiVersion: 1,
        observation: "host.theme",
        value: { "--eidos-background": "rgb(10, 15, 20)" },
      },
    })
  )
  expect(
    document.documentElement.style.getPropertyValue("--eidos-background")
  ).toBe("rgb(10, 15, 20)")
})

it("ignores a malformed initial theme and still mounts", async () => {
  window.name = "eidos-plugin-theme:invalid"
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
    `export default function(ctx, root) { root.textContent = 'Usable'; }`,
    { kind: "page", route: "" }
  )
  document.body.innerHTML = '<div id="app"></div>'
  window.eval(
    html.slice(html.indexOf("<script>") + 8, html.indexOf("</script>"))
  )
  await vi.waitFor(() =>
    expect(document.querySelector("#app")?.textContent).toBe("Usable")
  )
})

it("keeps the existing presentation without Lite's initial-theme opt-in", async () => {
  vi.stubGlobal("CSS", { supports: () => true })
  window.name = "another-host"
  document.documentElement.style.setProperty(
    "--eidos-background",
    "rgb(1, 2, 3)"
  )
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
    `export default function(ctx, root) {
    root.dataset.initialBackground = document.documentElement.style.getPropertyValue('--eidos-background');
    root.dataset.sidecar = String(Boolean(ctx.capabilities.sidecar));
  }`,
    { kind: "page", route: "" }
  )
  document.body.innerHTML = '<div id="app"></div>'
  window.eval(
    html.slice(html.indexOf("<script>") + 8, html.indexOf("</script>"))
  )
  await vi.waitFor(() =>
    expect(
      document.querySelector<HTMLElement>("#app")?.dataset.initialBackground
    ).toBe("rgb(1, 2, 3)")
  )
  expect(document.querySelector<HTMLElement>("#app")?.dataset.sidecar).toBe(
    "false"
  )
  window.dispatchEvent(
    new MessageEvent("message", {
      source: window,
      data: {
        protocol: "eidos-plugin",
        apiVersion: 1,
        observation: "host.theme",
        value: { "--eidos-background": "rgb(4, 5, 6)" },
      },
    })
  )
  expect(
    document.documentElement.style.getPropertyValue("--eidos-background")
  ).toBe("rgb(4, 5, 6)")
})
