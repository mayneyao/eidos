// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { expect, it, vi } from "vitest"
import type { PluginListing, PluginRpcResult } from "../shared/plugins"
import type { PluginRequest } from "@eidos.space/plugin-runtime/rpc"

const loaded = vi.hoisted(() => ({ resources: 0, details: 0 }))
vi.mock("./plugin-resource", () => {
  loaded.resources++
  return {
    PluginResource: () => <div data-loaded-resource>Embedded resource</div>,
  }
})
vi.mock("./plugin-detail-view", () => {
  loaded.details++
  return {
    PluginDetailView: () => <div data-loaded-detail>Plugin details</div>,
  }
})

import { PluginEditor } from "./plugin-editor"
import { PluginManager } from "./plugin-manager"

it("defers rich plugin modules until a detail or embedded resource is requested", async () => {
  // Both hosts are imported by the Welcome entry. Their optional renderers
  // must stay unloaded even when the lightweight host modules are mounted.
  expect(loaded).toEqual({ resources: 0, details: 0 })
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const listing: PluginListing = {
    space: { plugins: {}, associations: {} },
    plugins: [
      {
        hash: "hash",
        enabled: false,
        manifest: {
          id: "example.lazy",
          name: "Example",
          version: "1.0.0",
          apiVersion: 1,
          requires: { pluginApi: "3.0.0" },
        },
      },
    ],
  }
  const pluginRequest = vi.fn(
    async (
      _ticket: string,
      request: PluginRequest
    ): Promise<PluginRpcResult> => ({
      response: {
        protocol: "eidos-plugin",
        apiVersion: 1,
        id: request.id,
        result: null,
      },
      ...(request.method === "resources.mount"
        ? {
            resource: {
              kind: "mount" as const,
              id: "resource",
              content: {
                kind: "text" as const,
                path: "note.txt",
                text: "Hello",
              },
            },
          }
        : {}),
    })
  )
  Object.assign(window, {
    eidosLite: {
      listPlugins: async () => listing,
      pluginMarketplace: async () => ({ plugins: [], cached: false }),
      onPluginEvent: () => () => {},
      onPluginInstallProgress: () => () => {},
      closePluginEditor: async () => {},
      pluginRequest,
    },
  })
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  const render = (selectedPluginId: string | null) => (
    <>
      <PluginEditor
        instance={{
          ticket: "ticket",
          url: "eidos-plugin://test/index.html",
          editor: {
            key: "example.lazy/file",
            label: "Example",
            pluginName: "Example",
          },
        }}
        onDraft={() => {}}
        onFallback={() => {}}
        onRetry={() => {}}
      />
      <PluginManager selectedPluginId={selectedPluginId} />
    </>
  )
  try {
    await act(async () => root.render(render(null)))
    expect(loaded).toEqual({ resources: 0, details: 0 })
    await act(async () => {
      root.render(render("example.lazy"))
      await vi.dynamicImportSettled()
    })
    expect(container.querySelector("[data-loaded-detail]")).not.toBeNull()
    expect(loaded).toEqual({ resources: 0, details: 1 })
    const source = container.querySelector("iframe")!.contentWindow!
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          source,
          data: {
            protocol: "eidos-plugin",
            apiVersion: 1,
            id: "resource",
            method: "resources.mount",
            params: { path: "note.txt" },
          },
        })
      )
      await vi.dynamicImportSettled()
    })
    expect(pluginRequest).toHaveBeenCalledOnce()
    expect(container.querySelector("[data-loaded-resource]")).not.toBeNull()
    expect(loaded).toEqual({ resources: 1, details: 1 })
  } finally {
    await act(async () => root.unmount())
    container.remove()
  }
})
