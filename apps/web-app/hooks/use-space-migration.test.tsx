import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import { useSpaceMigration } from "./use-space-migration"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const listLegacyExtensionsMock = vi.hoisted(() => vi.fn())
const exportLegacyExtensionMock = vi.hoisted(() => vi.fn())

vi.mock("@/lib/env", () => ({ isDesktopMode: true }))

const candidate = {
  id: "ext-1",
  slug: "task-counter",
  name: "Task Counter",
  description: null,
  type: "script",
  version: "0.1.0",
  previouslyEnabled: false,
  portability: {
    readiness: "manual-port" as const,
    reasonCode: "manual-command-port" as const,
    legacyContribution: "tableAction",
    candidateContribution: "command" as const,
    metadataState: "valid" as const,
    sourceState: "typescript" as const,
    legacyFileExtensions: [],
    summary: "Manual command port",
    manualSteps: [],
  },
}

describe("useSpaceMigration legacy extension exports", () => {
  let container: HTMLDivElement
  let root: Root
  let latest: ReturnType<typeof useSpaceMigration> | null = null

  function Harness({ spaceId }: { spaceId?: string }) {
    latest = useSpaceMigration(spaceId)
    return null
  }

  beforeEach(() => {
    latest = null
    listLegacyExtensionsMock.mockReset().mockResolvedValue([candidate])
    exportLegacyExtensionMock.mockReset().mockResolvedValue({
      targetDirectory: "/tmp/export/task-counter",
    })
    Object.defineProperty(window, "eidos", {
      configurable: true,
      value: {
        on: vi.fn(() => "listener-1"),
        off: vi.fn(),
        spaceMigration: {
          listLegacyExtensions: listLegacyExtensionsMock,
          exportLegacyExtension: exportLegacyExtensionMock,
          discardPlan: vi.fn(),
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
  })

  it("discovers and exports legacy extensions through the desktop API", async () => {
    await act(async () => {
      root.render(<Harness spaceId="legacy" />)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(listLegacyExtensionsMock).toHaveBeenCalledWith("legacy")
    expect(latest?.legacyExtensions).toEqual([candidate])
    expect(latest?.loadingLegacyExtensions).toBe(false)

    await act(async () => {
      await latest?.exportLegacyExtension("ext-1", "/tmp/export")
    })

    expect(exportLegacyExtensionMock).toHaveBeenCalledWith(
      "legacy",
      "ext-1",
      "/tmp/export"
    )
    expect(latest?.exportingExtensionId).toBe(null)
    expect(latest?.extensionError).toBe(null)
  })

  it("does not inspect extensions without a legacy Space ID", async () => {
    await act(async () => {
      root.render(<Harness />)
      await Promise.resolve()
    })

    expect(listLegacyExtensionsMock).not.toHaveBeenCalled()
    expect(latest?.legacyExtensions).toEqual([])
  })
})
