import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import { useFileSpaceSettings } from "@/apps/web-app/store/file-space-settings"

import { FileSpaceFilesSettings } from "./file-space-files-settings"
import { FileSpaceIndexesSettings } from "./file-space-indexes-settings"
import { FileSpaceVersioningSettings } from "./file-space-versioning-settings"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const getIndexStatusMock = vi.hoisted(() => vi.fn())
const rebuildIndexMock = vi.hoisted(() => vi.fn())
const navigateMock = vi.hoisted(() => vi.fn())
const refreshVersioningMock = vi.hoisted(() => vi.fn())

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (
      _key: string,
      fallback: string,
      values?: Record<string, string | number>
    ) =>
      Object.entries(values ?? {}).reduce(
        (text, [name, value]) => text.split(`{{${name}}}`).join(String(value)),
        fallback
      ),
  }),
}))

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

vi.mock("@/apps/web-app/hooks/use-space-files", () => ({
  useSpaceFiles: () => ({
    getIndexStatus: getIndexStatusMock,
    rebuildIndex: rebuildIndexMock,
  }),
  useSpaceFileChanges: () => undefined,
}))

vi.mock("@/apps/web-app/hooks/use-router-adapter", () => ({
  useRouterAdapter: () => ({ navigate: navigateMock }),
}))

vi.mock("@/apps/web-app/hooks/use-space-versioning", () => ({
  useSpaceVersioning: () => ({
    status: { enabled: true },
    statusLoading: false,
    operation: null,
    error: null,
    available: true,
    enable: vi.fn(),
    refresh: refreshVersioningMock,
  }),
}))

describe("file Space settings", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    useFileSpaceSettings.setState({ bySpace: {} })
    getIndexStatusMock.mockReset()
    rebuildIndexMock.mockReset()
    navigateMock.mockReset()
    refreshVersioningMock.mockReset()
    getIndexStatusMock.mockResolvedValue({
      indexedAt: new Date("2026-07-11T10:00:00Z").getTime(),
      fileCount: 12,
      contentFileCount: 9,
      skippedContentFileCount: 1,
      persistent: true,
    })
    rebuildIndexMock.mockResolvedValue({
      indexedAt: new Date("2026-07-11T11:00:00Z").getTime(),
      fileCount: 14,
      contentFileCount: 11,
      skippedContentFileCount: 0,
      persistent: true,
    })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    useFileSpaceSettings.setState({ bySpace: {} })
  })

  it("persists Explorer visibility choices per Space", async () => {
    await act(async () => root.render(<FileSpaceFilesSettings />))

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>("#show-obsidian-folder")
        ?.click()
      container.querySelector<HTMLButtonElement>("#show-hidden-files")?.click()
    })

    expect(useFileSpaceSettings.getState().bySpace["file-space"]).toEqual({
      showHiddenFiles: true,
      showObsidianFolder: true,
    })
  })

  it("shows derived index coverage and refreshes it after rebuild", async () => {
    await act(async () => {
      root.render(<FileSpaceIndexesSettings />)
      await Promise.resolve()
    })

    expect(container.textContent).toContain("9 text files")
    expect(container.textContent).toContain("12 files · stored on disk")
    expect(container.textContent).toContain(
      "1 large or unsupported files skipped"
    )

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent?.includes("Rebuild"))
        ?.click()
      await Promise.resolve()
    })

    expect(rebuildIndexMock).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain("11 text files")
    expect(container.textContent).toContain("14 files · stored on disk")
  })

  it("opens version history from the versioning settings", async () => {
    await act(async () => root.render(<FileSpaceVersioningSettings />))

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent?.includes("Open history"))
        ?.click()
    })

    expect(navigateMock).toHaveBeenCalledWith("/version/history", {
      target: "_blank",
    })
  })
})
