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
