import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type {
  EidosFileTableSnapshot,
  EidosFileViewInfo,
} from "@eidos.space/eidos-file"
import { EXTENSION_SURFACE_PROTOCOL_VERSION } from "@eidos.space/extension-surface-protocol"

import { ExtensionEidosFileViewSurface } from "./extension-eidos-file-view-surface"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const appearance = {
  colorScheme: "light" as const,
  locale: "en",
  theme: {
    background: "#fff",
    foreground: "#111",
    mutedBackground: "#f5f5f5",
    mutedForeground: "#666",
    border: "#ddd",
    accent: "#eee",
    accentForeground: "#111",
    destructive: "#d00",
    destructiveForeground: "#fff",
    focusRing: "#55f",
    fontFamily: "system-ui",
    monoFontFamily: "monospace",
  },
}

const extension = {
  packageId: "example.tasks",
  contentDigest: `sha256:${"1".repeat(64)}`,
  permissionHash: `sha256:${"2".repeat(64)}`,
  id: "example.tasks.cards",
  displayName: "Task cards",
  extensionDisplayName: "Tasks",
}

const table: EidosFileTableSnapshot = {
  table: {
    id: "tasks",
    name: "Tasks",
    rawTableName: "tb_tasks",
    icon: null,
    description: null,
    position: null,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  },
  fields: [
    {
      id: "field-title",
      tableId: "tasks",
      name: "Title",
      type: "text",
      tableName: "tb_tasks",
      tableColumnName: "title",
      property: null,
      storageCodec: "scalar",
      valueKind: "source",
      isRecordLabel: true,
      isHidden: false,
      isDerived: false,
      sourceTableColumnName: null,
      dependsOn: null,
    },
  ],
  views: [],
  rowCount: 1,
}

const view: EidosFileViewInfo = {
  id: "view-1",
  name: "Cards",
  type: "extension:example.tasks.cards",
  tableId: "tasks",
  query: "",
  properties: null,
  filter: null,
  sorts: [],
  orderMap: null,
  hiddenFields: [],
  position: 0,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
}

const mocks = vi.hoisted(() => ({
  openEidosFileView: vi.fn(),
  reportSurfaceOutput: vi.fn(),
  listeners: new Map<string, (event: unknown, payload: unknown) => void>(),
}))

vi.mock("@/apps/web-app/hooks/use-current-space", () => ({
  useCurrentSpace: () => ({ currentSpace: { id: "space-a" } }),
}))
vi.mock("@/components/theme-provider", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}))
vi.mock("./extension-surface-appearance", () => ({
  readExtensionSurfaceAppearance: () => appearance,
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

async function flushEffects() {
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await Promise.resolve()
}

describe("ExtensionEidosFileViewSurface", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    messageChannels.length = 0
    mocks.listeners.clear()
    mocks.openEidosFileView.mockReset().mockResolvedValue({
      packageId: "example.tasks",
      eidosFileViewId: "example.tasks.cards",
      generation: "generation-1",
      source: "/* compiled Eidos File view */",
    })
    mocks.reportSurfaceOutput.mockReset().mockResolvedValue({ success: true })
    vi.stubGlobal("MessageChannel", TestMessageChannel)
    Object.defineProperty(window, "eidos", {
      configurable: true,
      value: {
        fileExtensions: {
          openEidosFileView: mocks.openEidosFileView,
          reportSurfaceOutput: mocks.reportSurfaceOutput,
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
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    Reflect.deleteProperty(window, "eidos")
    vi.unstubAllGlobals()
  })

  it("initializes with Eidos File metadata and serves bounded pages", async () => {
    const loadPage = vi.fn().mockResolvedValue({
      tableId: "tasks",
      offset: 0,
      limit: 60,
      total: 1,
      rows: [{ _id: "row-1", title: "Ship", estimate: 12n }],
    })
    await act(async () => {
      root.render(
        <ExtensionEidosFileViewSurface
          extension={extension}
          filePath="tasks.eidos"
          table={table}
          view={view}
          loadPage={loadPage}
        />
      )
      await flushEffects()
    })

    const iframe = container.querySelector("iframe")
    if (!iframe?.contentWindow) throw new Error("Missing extension iframe")
    await act(async () => {
      iframe.dispatchEvent(new Event("load"))
      await Promise.resolve()
    })
    const port = messageChannels[0].port1
    await act(async () => {
      port.emit({
        type: "ready",
        protocolVersion: EXTENSION_SURFACE_PROTOCOL_VERSION,
      })
      port.emit({
        type: "eidos-file-page-request",
        requestId: "page-1",
        generation: "generation-1",
        offset: 0,
        limit: 60,
      })
      await flushEffects()
    })

    expect(port.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "initialize",
        surfaceKind: "eidos-file-view",
        eidosFileViewId: "example.tasks.cards",
        viewId: "view-1",
        context: expect.objectContaining({
          resourcePath: "tasks.eidos",
          table: { id: "tasks", name: "Tasks", rowCount: 1 },
        }),
      })
    )
    expect(loadPage).toHaveBeenCalledWith(0, 60)
    expect(port.postMessage).toHaveBeenCalledWith({
      type: "eidos-file-page-result",
      requestId: "page-1",
      ok: true,
      page: {
        offset: 0,
        limit: 60,
        total: 1,
        rows: [{ _id: "row-1", title: "Ship", estimate: "12" }],
      },
    })
  })

  it("offers a Grid fallback when the extension view cannot start", async () => {
    mocks.openEidosFileView.mockRejectedValueOnce(
      new Error("Extension source failed to compile")
    )
    const onFallback = vi.fn()
    await act(async () => {
      root.render(
        <ExtensionEidosFileViewSurface
          extension={extension}
          filePath="tasks.eidos"
          table={table}
          view={view}
          loadPage={vi.fn()}
          onFallback={onFallback}
        />
      )
      await flushEffects()
    })

    expect(container.textContent).toContain(
      "Extension source failed to compile"
    )
    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Show Grid")
        ?.click()
    })
    expect(onFallback).toHaveBeenCalledTimes(1)
  })
})
