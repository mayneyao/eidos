// @vitest-environment jsdom
import { act, StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, expect, it, vi } from "vitest"
import { PluginEditor } from "./plugin-editor"
import { textDraftLifecycle } from "./text-draft-lifecycle"
import type { PluginRequest } from "@eidos.space/plugin-runtime/rpc"

afterEach(() => {
  document.body.replaceChildren()
  textDraftLifecycle.release()
})
it("routes common connections without a data adapter and preserves invocation identity", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const request = vi.fn(async (_ticket: string, message: PluginRequest) => ({
    response: {
      protocol: "eidos-plugin",
      apiVersion: 1,
      id: message.id,
      result: null,
    },
  }))
  const connection = vi.fn().mockResolvedValue(true)
  Object.assign(window, {
    eidosLite: {
      onPluginEvent: () => () => {},
      pluginRequest: request,
      pluginConnection: connection,
      closePluginEditor: vi.fn(async () => {}),
    },
  })
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  await act(async () =>
    root.render(
      <PluginEditor
        instance={{
          ticket: "ticket",
          url: "eidos-plugin://test/index.html",
          editor: {
            key: "test.plugin/page",
            label: "Page",
            pluginName: "Plugin",
          },
        }}
        onDraft={() => {}}
        onFallback={() => {}}
        onRetry={() => {}}
      />
    )
  )
  const source = container.querySelector("iframe")!.contentWindow!
  const response = vi.spyOn(source, "postMessage")
  const send = async (id: string, method: string, params: unknown) =>
    act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          source,
          data: { protocol: "eidos-plugin", apiVersion: 1, id, method, params },
        })
      )
    })
  await send("1", "eidos.connection.status", { connection: "model" })
  expect(connection).toHaveBeenCalledWith(
    "ticket",
    "model",
    "status",
    undefined,
    undefined
  )
  expect(response).toHaveBeenCalledWith(
    expect.objectContaining({ id: "1", result: true }),
    "*"
  )
  connection.mockResolvedValueOnce({ configured: true })
  await send("2", "eidos.connection.status", { connection: "model" })
  expect(response).toHaveBeenCalledWith(
    expect.objectContaining({ id: "2", result: true }),
    "*"
  )
  await send("3", "eidos.connection.request", {
    invocation: "run-1",
    args: { connection: "model", body: { prompt: "Hello" } },
  })
  expect(connection).toHaveBeenLastCalledWith(
    "ticket",
    "model",
    "request",
    { prompt: "Hello" },
    "run-1"
  )
  const calls = connection.mock.calls.length
  request.mockResolvedValueOnce({
    response: {
      protocol: "eidos-plugin",
      apiVersion: 1,
      id: "4",
      error: { code: "PERMISSION_DENIED", message: "Expired" },
    },
  } as never)
  await send("4", "eidos.connection.request", {
    invocation: "run-1",
    args: { connection: "model", body: {} },
  })
  expect(connection.mock.calls).toHaveLength(calls)
  expect(response).toHaveBeenCalledWith(
    expect.objectContaining({
      id: "4",
      error: { code: "PERMISSION_DENIED", message: "Expired" },
    }),
    "*"
  )
  await act(async () => root.unmount())
})

it("notifies configuration observers after writes and file revisions", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  Object.assign(window, {
    eidosLite: {
      onPluginEvent: () => () => {},
      pluginRequest: vi.fn(async (_ticket: string, message: PluginRequest) => ({
        response: {
          protocol: "eidos-plugin",
          apiVersion: 1,
          id: message.id,
          result: null,
        },
      })),
      closePluginEditor: vi.fn(async () => {}),
    },
  })
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  const onTableRequest = vi.fn().mockResolvedValue({ value: {}, version: "v2" })
  const render = (revision: number) => (
    <PluginEditor
      instance={{
        ticket: "ticket",
        url: "eidos-plugin://test/index.html",
        editor: {
          key: "test.plugin/file",
          label: "File",
          pluginName: "Plugin",
        },
      }}
      onTableRequest={onTableRequest}
      tableRevision={revision}
      onDraft={() => {}}
      onFallback={() => {}}
      onRetry={() => {}}
    />
  )
  await act(async () => root.render(render(1)))
  const source = container.querySelector("iframe")!.contentWindow!
  const post = vi.spyOn(source, "postMessage")
  await act(async () => {
    window.dispatchEvent(
      new MessageEvent("message", {
        source,
        data: {
          protocol: "eidos-plugin",
          apiVersion: 1,
          id: "1",
          method: "eidos.pluginConfig.write",
          params: { tableId: "t", value: {}, expectedVersion: "v1" },
        },
      })
    )
  })
  expect(onTableRequest).toHaveBeenCalledOnce()
  expect(post).toHaveBeenCalledWith(
    expect.objectContaining({ observation: "host.table" }),
    "*"
  )
  post.mockClear()
  await act(async () => root.render(render(2)))
  expect(post).toHaveBeenCalledWith(
    expect.objectContaining({ observation: "host.table" }),
    "*"
  )
  await act(async () => root.unmount())
})
it("accepts only its own frame, preserves acknowledged drafts, and keeps StrictMode tickets alive", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const close = vi.fn(async () => {})
  const draft = { text: "a,b", expectedRevision: "revision" }
  const request = vi.fn(async (_ticket: string, message: PluginRequest) => ({
    response: {
      protocol: "eidos-plugin",
      apiVersion: 1,
      id: message.id,
      result: null,
    },
    draft,
  }))
  Object.assign(window, {
    eidosLite: {
      onPluginEvent: () => () => {},
      pluginRequest: request,
      closePluginEditor: close,
    },
  })
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  const onDraft = vi.fn()
  await act(async () =>
    root.render(
      <StrictMode>
        <PluginEditor
          instance={{
            ticket: "ticket",
            url: "eidos-plugin://test/index.html",
            editor: { key: "test.csv/table", label: "CSV", pluginName: "CSV" },
          }}
          onDraft={onDraft}
          onFallback={() => {}}
          onRetry={() => {}}
        />
      </StrictMode>
    )
  )
  expect(close).not.toHaveBeenCalled()
  const frame = container.querySelector("iframe")!
  expect(frame.getAttribute("sandbox")).toBe("allow-scripts")
  const data = {
    protocol: "eidos-plugin",
    apiVersion: 1,
    id: "1",
    method: "document.edit",
    params: draft,
  }
  await act(async () => {
    window.dispatchEvent(new MessageEvent("message", { source: window, data }))
  })
  expect(request).not.toHaveBeenCalled()
  await act(async () => {
    window.dispatchEvent(
      new MessageEvent("message", { source: frame.contentWindow, data })
    )
  })
  expect(request).toHaveBeenCalledWith("ticket", data)
  expect(onDraft).toHaveBeenCalledWith(draft, undefined)
  await act(async () => root.unmount())
  expect(close).toHaveBeenCalledExactlyOnceWith("ticket")
})
it("offers recovery after the frame attempts another navigation", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  Object.assign(window, {
    eidosLite: {
      onPluginEvent: () => () => {},
      closePluginEditor: vi.fn(async () => {}),
    },
  })
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  const fallback = vi.fn()
  await act(async () =>
    root.render(
      <PluginEditor
        instance={{
          ticket: "ticket",
          url: "eidos-plugin://test/index.html",
          editor: { key: "test.csv/table", label: "CSV", pluginName: "CSV" },
        }}
        onDraft={() => {}}
        onFallback={fallback}
        onRetry={() => {}}
      />
    )
  )
  const frame = container.querySelector("iframe")!
  await act(async () => {
    frame.dispatchEvent(new Event("load"))
    frame.dispatchEvent(new Event("load"))
  })
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "navigation was blocked"
  )
  await act(async () => {
    ;[...container.querySelectorAll("button")]
      .find((button) => button.textContent === "Use built-in editor")!
      .click()
  })
  expect(fallback).toHaveBeenCalledOnce()
  await act(async () => root.unmount())
})
