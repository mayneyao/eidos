import { runInNewContext } from "node:vm"
import { expect, it, vi } from "vitest"
import type { ViewContext } from "../../../packages/plugin-runtime/src/contracts"
import { fileViewScript } from "../src/file-view-script"

it("mounts an API 3.0 file View through the serialized canonical guest bootstrap", async () => {
  const root = {
    textContent: "",
    replaceChildren(node: { textContent: string }) {
      this.textContent = node.textContent
    },
  }
  const listeners = new Map<string, (event: unknown) => void>()
  const parent = {
    postMessage: vi.fn((request: { id: string; method: string }) => {
      queueMicrotask(() => {
        listeners.get("message")?.({
          source: parent,
          data: {
            protocol: "eidos-plugin",
            apiVersion: 1,
            id: request.id,
            result:
              request.method === "fs.readText"
                ? { text: "<gpx>controlled source</gpx>" }
                : null,
          },
        })
      })
    }),
  }
  const document = {
    getElementById: () => root,
    createElement: () => ({ setAttribute() {}, textContent: "" }),
  }
  const mount = vi.fn(async (ctx: ViewContext, node: HTMLElement) => {
    if (ctx.binding.kind !== "file") throw new Error("Expected file binding")
    const path = ctx.binding.file?.path
    if (!path || !ctx.capabilities.fs)
      throw new Error("Missing file capability")
    const text = await ctx.capabilities.fs.readText(path)
    node.textContent = [
      ctx.binding.kind,
      ctx.i18n.locale,
      ctx.i18n.t("plain"),
      text,
    ].join("|")
  })
  const script = fileViewScript("export default function() {}", {
    kind: "file",
    path: "files/ride.gpx",
    name: "ride.gpx",
    baseName: "ride",
    extension: ".gpx",
    mimeType: "application/gpx+xml",
    size: 28,
  })
  try {
    // Only Blob ESM transport is substituted. Execute the actual serialized
    // bootstrap and dependency functions, including i18n initialization and RPC.
    runInNewContext(
      script.replace("import(url)", "Promise.resolve({default: mount})"),
      {
        mount,
        document,
        window: {
          parent,
          document,
          addEventListener: (
            type: string,
            listener: (event: unknown) => void
          ) => listeners.set(type, listener),
          removeEventListener: (type: string) => listeners.delete(type),
        },
        URL: { createObjectURL: () => "blob:fixture", revokeObjectURL() {} },
        Blob,
        AbortController,
        crypto,
        setTimeout,
        clearTimeout,
        console,
      }
    )
    await vi.waitFor(() =>
      expect(root.textContent).toBe(
        "file|en|plain|<gpx>controlled source</gpx>"
      )
    )
    expect(mount).toHaveBeenCalledOnce()
  } finally {
    listeners.get("pagehide")?.({})
  }
})
