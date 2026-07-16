import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { EXTENSION_SURFACE_PROTOCOL_VERSION } from "@eidos.space/extension-surface-protocol"

import { ExtensionPanelSurface } from "./extension-panel-surface"

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

const mocks = vi.hoisted(() => ({
  closePanelSession: vi.fn(),
  getPanelSession: vi.fn(),
  listeners: new Map<string, (event: unknown, payload: unknown) => void>(),
  reportSurfaceOutput: vi.fn(),
  setTitle: vi.fn(),
}))

vi.mock("@/apps/web-app/hooks/use-current-space", () => ({
  useCurrentSpace: () => ({ currentSpace: { id: "space-a" } }),
}))

vi.mock("@/apps/web-app/hooks/use-tab-title", () => ({
  useTabTitle: (title: string) => mocks.setTitle(title),
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

const firstSession = {
  sessionId: "panel-session-1",
  packageId: "example.task-counter",
  panelId: "example.task-counter.summary",
  title: "Task Counter",
  revision: 1,
  generation: "generation-1",
  source: "/* compiled panel source */",
  state: { path: "tasks.md", pending: 2, completed: 1, total: 3 },
}

async function flushEffects() {
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await Promise.resolve()
}

describe("ExtensionPanelSurface", () => {
  let container: HTMLDivElement
  let root: Root
  let mounted: boolean

  beforeEach(() => {
    messageChannels.length = 0
    mocks.listeners.clear()
    mocks.closePanelSession.mockReset().mockResolvedValue({ success: true })
    mocks.getPanelSession.mockReset().mockResolvedValue(firstSession)
    mocks.reportSurfaceOutput.mockReset().mockResolvedValue({ success: true })
    mocks.setTitle.mockReset()

    vi.stubGlobal("MessageChannel", TestMessageChannel)
    Object.defineProperty(window, "eidos", {
      configurable: true,
      value: {
        fileExtensions: {
          closePanelSession: mocks.closePanelSession,
          getPanelSession: mocks.getPanelSession,
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
    document.body.append(container)
    root = createRoot(container)
    mounted = true
  })

  afterEach(() => {
    if (mounted) act(() => root.unmount())
    container.remove()
    Reflect.deleteProperty(window, "eidos")
    vi.unstubAllGlobals()
  })

  it("boots and refreshes one opaque panel session without closing it on tab switches", async () => {
    mocks.getPanelSession
      .mockResolvedValueOnce(firstSession)
      .mockResolvedValueOnce({
        ...firstSession,
        revision: 2,
        state: { path: "tasks.md", pending: 1, completed: 2, total: 3 },
      })

    await act(async () => {
      root.render(<ExtensionPanelSurface sessionId={firstSession.sessionId} />)
      await flushEffects()
    })

    expect(mocks.getPanelSession).toHaveBeenCalledWith("space-a", {
      sessionId: firstSession.sessionId,
    })
    const iframe = container.querySelector("iframe")
    expect(iframe?.getAttribute("sandbox")).toBe("allow-scripts")
    expect(iframe?.getAttribute("referrerpolicy")).toBe("no-referrer")
    if (!iframe?.contentWindow) throw new Error("Missing extension iframe")

    await act(async () => {
      iframe.dispatchEvent(new Event("load"))
      await Promise.resolve()
    })
    expect(messageChannels).toHaveLength(1)

    const firstPort = messageChannels[0].port1
    await act(async () => {
      firstPort.emit({
        type: "ready",
        protocolVersion: EXTENSION_SURFACE_PROTOCOL_VERSION,
      })
      firstPort.emit({ type: "activated" })
      firstPort.emit({
        type: "surface-log",
        generation: firstSession.generation,
        level: "info",
        message: "Rendered task summary",
      })
      await Promise.resolve()
    })

    expect(firstPort.postMessage).toHaveBeenCalledWith({
      type: "initialize",
      surfaceKind: "panel",
      protocolVersion: EXTENSION_SURFACE_PROTOCOL_VERSION,
      packageId: firstSession.packageId,
      generation: firstSession.generation,
      panelId: firstSession.panelId,
      sessionId: firstSession.sessionId,
      state: firstSession.state,
      appearance,
    })
    expect(container.textContent).not.toContain("Activating extension")
    expect(mocks.reportSurfaceOutput).toHaveBeenCalledWith("space-a", {
      surfaceKind: "panel",
      sessionId: firstSession.sessionId,
      generation: firstSession.generation,
      level: "info",
      message: "Rendered task summary",
    })

    await act(async () => {
      mocks.listeners.get("file-extensions:development-changed")?.(
        {},
        {
          spaceId: "space-a",
          packageId: firstSession.packageId,
          sessionId: "development-session-1",
          status: "invalid",
          generation: 2,
          diagnostics: [
            { code: "compile", message: "Unexpected token in panel source" },
          ],
        }
      )
      await Promise.resolve()
    })
    expect(firstPort.close).toHaveBeenCalledOnce()
    expect(container.querySelector("iframe")).toBeNull()
    expect(container.textContent).toContain("Unexpected token in panel source")

    await act(async () => {
      mocks.listeners.get("file-extensions:development-changed")?.(
        {},
        {
          spaceId: "space-a",
          packageId: firstSession.packageId,
          sessionId: "development-session-1",
          status: "checking",
          generation: 3,
          diagnostics: [],
        }
      )
      await Promise.resolve()
    })
    expect(container.querySelector("iframe")).toBeNull()
    expect(container.textContent).toContain("Reloading extension panel")

    await act(async () => {
      mocks.listeners.get("file-extensions:development-changed")?.(
        {},
        {
          spaceId: "space-a",
          packageId: firstSession.packageId,
          sessionId: "development-session-1",
          status: "ready",
          generation: 4,
          diagnostics: [],
        }
      )
      await Promise.resolve()
    })
    expect(container.querySelector("iframe")).toBeNull()
    expect(container.textContent).toContain("Reloading extension panel")

    await act(async () => {
      mocks.listeners.get("file-extensions:open-panel")?.(
        {},
        {
          spaceId: "space-a",
          sessionId: firstSession.sessionId,
          title: firstSession.title,
          revision: 2,
        }
      )
      await flushEffects()
      mocks.listeners.get("file-extensions:development-changed")?.(
        {},
        {
          spaceId: "space-a",
          packageId: firstSession.packageId,
          sessionId: "development-session-1",
          status: "ready",
          generation: 5,
          diagnostics: [],
        }
      )
      await Promise.resolve()
    })

    expect(mocks.getPanelSession).toHaveBeenCalledTimes(2)
    expect(container.querySelector("iframe")?.title).toBe(firstSession.title)

    act(() => root.unmount())
    mounted = false
    await flushEffects()
    expect(mocks.closePanelSession).not.toHaveBeenCalled()
  })
})
