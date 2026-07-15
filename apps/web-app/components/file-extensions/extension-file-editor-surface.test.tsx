import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { EXTENSION_SURFACE_PROTOCOL_VERSION } from "@eidos.space/extension-surface-protocol"

import { ExtensionFileEditorSurface } from "./extension-file-editor-surface"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({
  close: vi.fn(),
  flush: vi.fn(),
  handleRequest: vi.fn(),
  listEditors: vi.fn(),
  openEditor: vi.fn(),
  refresh: vi.fn(),
  resolveConflict: vi.fn(),
  listeners: new Map<string, (event: unknown, payload: unknown) => void>(),
  pendingWriteFlusher: undefined as undefined | (() => Promise<boolean>),
  tabDirty: vi.fn(),
}))

vi.mock("@/apps/web-app/hooks/use-current-space", () => ({
  useCurrentSpace: () => ({ currentSpace: { id: "space-a" } }),
}))

vi.mock("@/apps/web-app/hooks/use-router-adapter", () => ({
  useRouterAdapter: () => ({ navigate: vi.fn() }),
}))

vi.mock("@/apps/web-app/hooks/use-space-files", () => ({
  useSpaceFileChanges: () => undefined,
}))

vi.mock("@/apps/web-app/hooks/use-tab-dirty", () => ({
  useTabDirty: (dirty: boolean) => mocks.tabDirty(dirty),
}))

vi.mock("@/apps/web-app/components/file-space/pending-writes", () => ({
  registerPendingWriteFlusher: (
    _key: string,
    flusher: () => Promise<boolean>
  ) => {
    mocks.pendingWriteFlusher = flusher
    return vi.fn()
  },
}))

vi.mock("@/components/theme-provider", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}))

class TestMessagePort {
  readonly postMessage = vi.fn()
  readonly start = vi.fn()
  readonly close = vi.fn()
  private listeners = new Set<(event: { data: unknown }) => void>()

  addEventListener(type: string, listener: (event: { data: unknown }) => void) {
    if (type === "message") this.listeners.add(listener)
  }

  emit(data: unknown) {
    for (const listener of this.listeners) listener({ data })
  }
}

const messageChannels: TestMessageChannel[] = []

class TestMessageChannel {
  readonly port1 = new TestMessagePort()
  readonly port2 = new TestMessagePort()

  constructor() {
    messageChannels.push(this)
  }
}

const editor = {
  packageId: "example.task-board",
  contentDigest: `sha256:${"1".repeat(64)}`,
  permissionHash: `sha256:${"2".repeat(64)}`,
  id: "example.task-board.editor",
  displayName: "Task Board",
  extensionDisplayName: "Markdown Task Board",
  selector: [{ filenamePattern: "**/*.md" }],
  priority: "default" as const,
  editable: true,
}

const openedEditor = {
  sessionId: "session-1",
  viewId: "view-1",
  packageId: editor.packageId,
  editorId: editor.id,
  generation: "generation-1",
  source: "/* compiled extension source */",
  snapshot: {
    documentId: "document-1",
    resource: {
      path: "tasks.md",
      mediaType: "text/markdown",
      languageId: "markdown",
      encoding: "utf-8" as const,
    },
    text: "- [ ] Ship it\n",
    persistedContentDigest: `sha256:${"3".repeat(64)}`,
    revision: 1,
    savedRevision: 1,
    dirty: false,
    readOnly: false,
    canUndo: false,
    canRedo: false,
  },
  capabilities: {
    editable: true,
    save: true,
    undoRedo: true,
    savePolicy: { mode: "afterDelay" as const, delayMs: 700 },
  },
}

async function flushEffects() {
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await Promise.resolve()
}

describe("ExtensionFileEditorSurface", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    messageChannels.length = 0
    mocks.listeners.clear()
    mocks.pendingWriteFlusher = undefined
    mocks.close.mockReset().mockResolvedValue({ success: true })
    mocks.flush.mockReset().mockResolvedValue({ success: true })
    mocks.handleRequest.mockReset().mockResolvedValue({
      type: "request-result",
      requestId: "edit-1",
      ok: true,
      revision: 2,
    })
    mocks.listEditors.mockReset().mockResolvedValue([editor])
    mocks.openEditor.mockReset().mockResolvedValue(openedEditor)
    mocks.refresh.mockReset().mockResolvedValue({ success: true })
    mocks.resolveConflict.mockReset().mockResolvedValue({ success: true })
    mocks.tabDirty.mockReset()

    vi.stubGlobal("MessageChannel", TestMessageChannel)
    Object.defineProperty(window, "eidos", {
      configurable: true,
      value: {
        fileExtensions: {
          closeFileEditor: mocks.close,
          flushFileEditor: mocks.flush,
          handleFileEditorRequest: mocks.handleRequest,
          listFileEditors: mocks.listEditors,
          openFileEditor: mocks.openEditor,
          refreshFileEditor: mocks.refresh,
          resolveFileEditorConflict: mocks.resolveConflict,
        },
        on: (
          channel: string,
          listener: (event: unknown, payload: unknown) => void
        ) => {
          mocks.listeners.set(channel, listener)
          return `listener:${channel}`
        },
        off: vi.fn(),
      },
    })

    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    Reflect.deleteProperty(window, "eidos")
    vi.unstubAllGlobals()
  })

  it("boots the fixed iframe once and relays surface requests through the host", async () => {
    await act(async () => {
      root.render(
        <ExtensionFileEditorSurface filePath="tasks.md" editorId={editor.id} />
      )
      await flushEffects()
    })

    expect(mocks.listEditors).toHaveBeenCalledWith("space-a", "tasks.md")
    expect(mocks.openEditor).toHaveBeenCalledWith(
      "space-a",
      expect.objectContaining({
        packageId: editor.packageId,
        editorId: editor.id,
        path: "tasks.md",
      })
    )

    const iframe = container.querySelector("iframe")
    expect(iframe?.getAttribute("sandbox")).toBe("allow-scripts")
    expect(iframe?.getAttribute("referrerpolicy")).toBe("no-referrer")
    if (!iframe?.contentWindow) throw new Error("Missing extension iframe")

    expect(messageChannels).toHaveLength(1)

    await act(async () => {
      iframe.dispatchEvent(new Event("load"))
      iframe.dispatchEvent(new Event("load"))
      await Promise.resolve()
    })

    expect(messageChannels).toHaveLength(1)

    const hostPort = messageChannels[0].port1
    await act(async () => {
      hostPort.emit({
        type: "ready",
        protocolVersion: EXTENSION_SURFACE_PROTOCOL_VERSION,
      })
      hostPort.emit({ type: "activated" })
      await Promise.resolve()
    })

    expect(hostPort.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "initialize",
        protocolVersion: EXTENSION_SURFACE_PROTOCOL_VERSION,
        packageId: editor.packageId,
        editorId: editor.id,
        snapshot: openedEditor.snapshot,
      })
    )
    expect(container.textContent).not.toContain("Activating extension")

    const editRequest = {
      type: "apply-edits",
      requestId: "edit-1",
      documentId: openedEditor.snapshot.documentId,
      baseRevision: 1,
      edits: [{ start: 3, end: 4, text: "x" }],
    }
    await act(async () => {
      hostPort.emit(editRequest)
      await flushEffects()
    })

    expect(mocks.handleRequest).toHaveBeenCalledWith(
      "space-a",
      { sessionId: "session-1", viewId: "view-1" },
      editRequest
    )
    expect(hostPort.postMessage).toHaveBeenCalledWith({
      type: "request-result",
      requestId: "edit-1",
      ok: true,
      revision: 2,
    })
  })

  it("automatically reopens the editor after a development source reload", async () => {
    mocks.openEditor.mockResolvedValueOnce(openedEditor).mockResolvedValueOnce({
      ...openedEditor,
      sessionId: "session-2",
      viewId: "view-2",
      generation: "generation-2",
      source: "/* recompiled extension source */",
    })

    await act(async () => {
      root.render(
        <ExtensionFileEditorSurface filePath="tasks.md" editorId={editor.id} />
      )
      await flushEffects()
    })

    const developmentListener = mocks.listeners.get(
      "file-extensions:development-changed"
    )
    expect(developmentListener).toBeDefined()

    await act(async () => {
      developmentListener?.(undefined, {
        spaceId: "space-a",
        packageId: editor.packageId,
        sessionId: "development-1",
        status: "checking",
        generation: 2,
        diagnostics: [],
      })
      await Promise.resolve()
    })
    expect(container.textContent).toContain("Reloading extension")

    const surfaceListener = mocks.listeners.get(
      "file-extensions:surface-message"
    )
    await act(async () => {
      surfaceListener?.(undefined, {
        spaceId: "space-a",
        sessionId: "session-1",
        viewId: "view-1",
        message: {
          type: "dispose",
          reason: "Extension source changed on disk",
        },
      })
      await Promise.resolve()
    })
    expect(container.textContent).toContain("Reloading extension")
    expect(container.textContent).not.toContain("Extension editor unavailable")
    await expect(mocks.pendingWriteFlusher?.()).resolves.toBe(true)
    expect(mocks.flush).not.toHaveBeenCalled()

    await act(async () => {
      developmentListener?.(undefined, {
        spaceId: "space-a",
        packageId: editor.packageId,
        sessionId: "development-1",
        status: "ready",
        generation: 3,
        diagnostics: [],
      })
      await flushEffects()
    })

    expect(mocks.openEditor).toHaveBeenCalledTimes(2)
    expect(mocks.close).toHaveBeenCalledWith("space-a", {
      sessionId: "session-1",
      viewId: "view-1",
    })
    expect(container.querySelector("iframe")).not.toBeNull()
  })
})
