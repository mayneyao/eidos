import { expect, it, vi } from "vitest"
import {
  joinAbortSignals,
  MobilePluginInstance,
  type NativeRequest,
} from "./host"

vi.mock("../../plugin-runtime/src/sandbox", () => ({
  viewHtml: () => "<html><head></head></html>",
}))

it("combines guest abort signals on WebViews without AbortSignal.any", () => {
  const first = new AbortController(),
    second = new AbortController()
  const joined = joinAbortSignals([first.signal, second.signal])
  const listener = vi.fn()
  joined.addEventListener("abort", listener)
  second.abort("second")
  first.abort("first")
  expect(listener).toHaveBeenCalledTimes(1)
  expect(joined.reason).toBe("second")
  expect(joinAbortSignals([first.signal, second.signal]).reason).toBe("first")
  expect(joinAbortSignals([]).aborted).toBe(false)
})

it("returns file text and binary data in the shared guest RPC envelopes", async () => {
  const text = "<?xml version='1.0'?><gpx/>"
  const data = btoa(text)
  const native: NativeRequest = async <T>(method: string) =>
    (method === "readText" ? { text, digest: "gpx" } : data) as T
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
    for (const method of ["fs.readBinary", "fs.readText"])
      window.dispatchEvent(
        new MessageEvent("message", {
          source: instance.frame.contentWindow,
          data: {
            protocol: "eidos-plugin",
            apiVersion: 1,
            id: method,
            method,
            params: { path: "test.gpx" },
          },
        })
      )
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2))
    expect(send.mock.calls.map(([response]) => response.result)).toEqual(
      expect.arrayContaining([{ data }, { text }])
    )
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

it("accepts the main target and rejects the sidebar before opening a file", async () => {
  Object.defineProperty(HTMLIFrameElement.prototype, "sandbox", {
    configurable: true,
    value: { add: vi.fn() },
  })
  const openFile = vi.fn()
  const instance = new MobilePluginInstance(
    {
      manifest: {
        apiVersion: 1,
        id: "test.file-target",
        name: "File target",
        version: "1.0.0",
        workspace: { files: true },
      },
      modules: {},
    },
    vi.fn(),
    {
      view: { id: "page", title: "Page", kind: "page", entry: "main.js" },
      notify: vi.fn(),
      navigate: vi.fn(),
      openFile,
      confirm: async () => true,
    }
  )
  document.body.append(instance.frame)
  const send = vi.spyOn(instance.frame.contentWindow!, "postMessage")
  try {
    for (const target of ["main", "sidebar"]) {
      window.dispatchEvent(
        new MessageEvent("message", {
          source: instance.frame.contentWindow,
          data: {
            protocol: "eidos-plugin",
            apiVersion: 1,
            id: target,
            method: "ui.openFile",
            params: { relativePath: "notes/Research.md", target },
          },
        })
      )
    }
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2))
    expect(send.mock.calls.map(([response]) => response)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "main", result: null }),
        expect.objectContaining({
          id: "sidebar",
          error: expect.objectContaining({ code: "PERMISSION_DENIED" }),
        }),
      ])
    )
    expect(openFile.mock.calls).toEqual([["notes/Research.md"]])
  } finally {
    instance.dispose()
    instance.frame.remove()
  }
})

it("binds a versioned working copy to one file and protects other Space files", async () => {
  Object.defineProperty(HTMLIFrameElement.prototype, "sandbox", {
    configurable: true,
    value: { add: vi.fn() },
  })
  let disk = { text: "\uFEFForiginal", digest: "initial" }
  const native = vi.fn((method: string, params?: Record<string, unknown>) => {
    if (method === "readText") return Promise.resolve(disk)
    if (method === "saveDocument") {
      if (params?.expectedDigest !== disk.digest)
        return Promise.resolve({ status: "conflict" })
      disk = { text: String(params.text), digest: "saved-digest" }
      return Promise.resolve({ status: "saved", digest: disk.digest })
    }
    throw new Error(method)
  })
  const instance = new MobilePluginInstance(
    {
      manifest: {
        apiVersion: 1,
        id: "test.document",
        name: "Document",
        version: "1.0.0",
        workspace: { files: { read: true } },
      },
      modules: {},
    },
    native as NativeRequest,
    {
      path: "notes/test.canvas",
      view: {
        id: "editor",
        title: "Editor",
        kind: "file",
        entry: "main.js",
        access: "write",
        capabilities: ["document"],
      },
      notify: vi.fn(),
      navigate: vi.fn(),
      openFile: vi.fn(),
      confirm: async () => true,
    }
  )
  document.body.append(instance.frame)
  const send = vi.spyOn(instance.frame.contentWindow!, "postMessage")
  let sequence = 0
  async function rpc(method: string, params: unknown = null) {
    const id = String(++sequence)
    window.dispatchEvent(
      new MessageEvent("message", {
        source: instance.frame.contentWindow,
        data: { protocol: "eidos-plugin", apiVersion: 1, id, method, params },
      })
    )
    return vi.waitFor(() => {
      const response = send.mock.calls.find(([value]) => value?.id === id)?.[0]
      expect(response).toBeDefined()
      return response
    })
  }
  try {
    const initial = (await rpc("document.observe", { id: "snapshot" })).result
    expect(initial).toMatchObject({
      text: "original",
      dirty: false,
      conflicted: false,
      bom: true,
      encoding: "utf-8",
      version: expect.any(String),
    })
    expect(
      (await rpc("document.edit", { text: "stale", expectedVersion: "old" }))
        .result.status
    ).toBe("stale")
    const edit = (
      await rpc("document.edit", {
        text: "draft",
        expectedVersion: initial.version,
      })
    ).result
    expect(edit.snapshot).toMatchObject({ text: "draft", dirty: true })
    expect(
      send.mock.calls.some(
        ([response]) =>
          response.observation === "snapshot" && response.value.text === "draft"
      )
    ).toBe(true)
    expect((await rpc("document.undo")).result.text).toBe("original")
    expect((await rpc("document.redo")).result.text).toBe("draft")
    expect(
      (await rpc("fs.writeText", { path: "notes/other.md", content: "other" }))
        .error.code
    ).toBe("PERMISSION_DENIED")
    expect(
      (
        await rpc("fs.writeText", {
          path: "notes/test.canvas",
          content: "bypass",
        })
      ).error.code
    ).toBe("BUSY")
    expect((await rpc("document.save")).result.status).toBe("saved")
    expect(native).toHaveBeenCalledWith("saveDocument", {
      path: "notes/test.canvas",
      text: "\uFEFFdraft",
      expectedDigest: "initial",
    })
    expect(instance.hasUnsavedDocument).toBe(false)

    const saved = (await rpc("document.read")).result
    await rpc("document.edit", {
      text: "second draft",
      expectedVersion: saved.version,
    })
    disk = { text: "external edit", digest: "external" }
    const conflict = (await rpc("document.save")).result
    expect(conflict).toMatchObject({
      status: "conflict",
      snapshot: { text: "second draft", dirty: true, conflicted: true },
    })
    expect(disk.text).toBe("external edit")
  } finally {
    instance.dispose()
  }
})
