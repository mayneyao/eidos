import { expect, it, vi } from "vitest"
import { MobilePluginInstance, type NativeRequest } from "./host"

vi.mock("../../plugin-runtime/src/sandbox", () => ({
  viewHtml: () => "<html><head></head></html>",
}))

it("returns binary data in the shared guest RPC envelope", async () => {
  const data = btoa("<?xml version='1.0'?><gpx/>")
  const native: NativeRequest = async <T>() => data as T
  Object.defineProperty(HTMLIFrameElement.prototype, "sandbox", {
    configurable: true,
    value: { add: vi.fn() },
  })
  const instance = new MobilePluginInstance(
    {
      manifest: {
        id: "test.binary",
        name: "Binary",
        version: "1.0.0",
        apiVersion: 1,
      },
      modules: {},
    },
    native,
    {
      path: "tracks/test.gpx",
      view: {
        id: "binary",
        title: "Binary",
        kind: "file",
        entry: "main.js",
        access: "read",
      },
      notify: vi.fn(),
      navigate: vi.fn(),
      openFile: vi.fn(),
      confirm: async () => true,
    }
  )
  document.body.append(instance.frame)
  try {
    const send = vi.spyOn(instance.frame.contentWindow!, "postMessage")
    window.dispatchEvent(
      new MessageEvent("message", {
        source: instance.frame.contentWindow,
        data: {
          protocol: "eidos-plugin",
          apiVersion: 1,
          id: "binary",
          method: "fs.readBinary",
          params: { path: "test.gpx" },
        },
      })
    )
    await vi.waitFor(() => expect(send).toHaveBeenCalled())
    const response = send.mock.calls[0][0] as { result: { data: string } }
    expect(atob(response.result.data)).toBe("<?xml version='1.0'?><gpx/>")
  } finally {
    instance.dispose()
    instance.frame.remove()
  }
})

it("denies inherited desktop RPC additions before reaching the native mobile bridge", async () => {
  Object.defineProperty(HTMLIFrameElement.prototype, "sandbox", {
    configurable: true,
    value: { add: vi.fn() },
  })
  const native = vi.fn()
  const instance = new MobilePluginInstance(
    {
      manifest: {
        apiVersion: 1,
        id: "test.desktop-rpc",
        name: "Desktop RPC",
        version: "1.0.0",
      },
      modules: {},
    },
    native,
    {
      view: { id: "page", title: "Page", kind: "page", entry: "main.js" },
      notify: vi.fn(),
      navigate: vi.fn(),
      openFile: vi.fn(),
      confirm: async () => true,
    }
  )
  document.body.append(instance.frame)
  const send = vi.spyOn(instance.frame.contentWindow!, "postMessage")
  try {
    for (const method of [
      "sidecar.status",
      "sidecar.start",
      "sidecar.stop",
      "sidecar.send",
      "sidecar.observe",
      "sidecar.unobserve",
      "storage.readVersioned",
      "storage.compareAndWrite",
    ]) {
      send.mockClear()
      window.dispatchEvent(
        new MessageEvent("message", {
          source: instance.frame.contentWindow,
          data: {
            protocol: "eidos-plugin",
            apiVersion: 1,
            id: method,
            method,
            params: {},
          },
        })
      )
      await vi.waitFor(() => expect(send).toHaveBeenCalled())
      expect(send.mock.calls[0][0]).toMatchObject({
        id: method,
        error: { code: "PERMISSION_DENIED" },
      })
    }
    expect(native).not.toHaveBeenCalled()
  } finally {
    instance.dispose()
  }
})
