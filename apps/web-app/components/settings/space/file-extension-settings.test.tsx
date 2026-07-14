import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import { FileExtensionSettings } from "./file-extension-settings"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const discoverMock = vi.hoisted(() => vi.fn())
const startWatchingMock = vi.hoisted(() => vi.fn())
const stopWatchingMock = vi.hoisted(() => vi.fn())
const onMock = vi.hoisted(() => vi.fn())
const offMock = vi.hoisted(() => vi.fn())
const translate = vi.hoisted(
  () =>
    (
      _key: string,
      fallback: string,
      values?: Record<string, string | number>
    ) =>
      Object.entries(values ?? {}).reduce(
        (text, [name, value]) => text.split(`{{${name}}}`).join(String(value)),
        fallback
      )
)

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: translate }),
}))

vi.mock("@/lib/env", () => ({ isDesktopMode: true }))

vi.mock("@/apps/web-app/hooks/use-current-space", () => ({
  useCurrentSpace: () => ({
    currentSpace: {
      id: "file-space",
      name: "File Space",
      mode: "file",
      path: "/tmp/file-space",
    },
  }),
}))

describe("FileExtensionSettings", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    discoverMock.mockReset()
    startWatchingMock.mockReset().mockResolvedValue({
      watching: true,
      generation: 0,
    })
    stopWatchingMock.mockReset().mockResolvedValue({
      watching: false,
      generation: 0,
    })
    onMock.mockReset().mockReturnValue("listener-1")
    offMock.mockReset()
    discoverMock.mockResolvedValue({
      root: ".eidos/extensions",
      phase: "inspection-only",
      executionAvailable: false,
      hostVersion: "0.33.0",
      packages: [
        {
          directoryName: "example.task-counter",
          status: "ready",
          canonicalId: "example.task-counter",
          manifest: {
            manifestVersion: 1,
            publisher: "example",
            name: "task-counter",
            displayName: "Task Counter",
            description: "Count Markdown tasks.",
            version: "1.0.0",
            engines: { eidos: ">=0.33.0" },
            entrypoints: { worker: "src/extension.ts" },
            contributes: {
              commands: [
                {
                  id: "example.task-counter.count",
                  title: "Count tasks",
                },
              ],
            },
            permissions: {
              files: { read: ["**/*.md"], write: [] },
              network: [],
            },
          },
          contentDigest: `sha256:${"a".repeat(64)}`,
          permissionHash: `sha256:${"b".repeat(64)}`,
          files: [
            { path: "extension.json", size: 200 },
            { path: "src/extension.ts", size: 80 },
          ],
          diagnostics: [],
        },
      ],
      diagnostics: [],
    })
    Object.defineProperty(window, "eidos", {
      configurable: true,
      value: {
        on: onMock,
        off: offMock,
        fileExtensions: {
          discover: discoverMock,
          startWatching: startWatchingMock,
          stopWatching: stopWatchingMock,
        },
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
  })

  it("shows inspection status without exposing an execution control", async () => {
    await act(async () => {
      root.render(<FileExtensionSettings />)
      await Promise.resolve()
    })

    expect(discoverMock).toHaveBeenCalledWith("file-space")
    expect(startWatchingMock).toHaveBeenCalledWith("file-space")
    expect(container.textContent).toContain("Inspection only")
    expect(container.textContent).toContain("Task Counter")
    expect(container.textContent).toContain("Ready")
    expect(container.textContent).toContain("2 files · 1 contributions")
    expect(
      [...container.querySelectorAll("button")].map((button) =>
        button.textContent?.trim()
      )
    ).toEqual(["Refresh"])

    const listener = onMock.mock.calls[0]?.[1]
    await act(async () => {
      listener?.({}, { spaceId: "file-space", generation: 1 })
      await Promise.resolve()
    })
    expect(discoverMock).toHaveBeenCalledTimes(2)

    await act(async () => {
      listener?.({}, { spaceId: "file-space", generation: 1 })
      await Promise.resolve()
    })
    expect(discoverMock).toHaveBeenCalledTimes(2)
  })
})
