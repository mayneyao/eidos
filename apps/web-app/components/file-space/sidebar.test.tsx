import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import { SidebarProvider } from "@/components/ui/sidebar"

import { registerPendingWriteFlusher } from "./pending-writes"
import { FileSpaceSidebar } from "./sidebar"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const isMacDesktopMock = vi.hoisted(() => vi.fn(() => true))
const navigateMock = vi.hoisted(() => vi.fn())

vi.mock("@/lib/web/helper", () => ({
  isMacDesktop: isMacDesktopMock,
}))

vi.mock("@/apps/web-app/hooks/use-current-space", () => ({
  useCurrentSpace: () => ({
    currentSpace: {
      id: "new-base",
      name: "new-base",
      path: "/tmp/new-base",
      mode: "file",
    },
  }),
}))

vi.mock("@/apps/web-app/hooks/use-space", () => ({
  useSpace: () => ({
    spaceList: [
      {
        id: "new-base",
        name: "new-base",
        path: "/tmp/new-base",
        mode: "file",
      },
    ],
  }),
}))

vi.mock("@/apps/web-app/hooks/use-router-adapter", () => ({
  useRouterAdapter: () => ({
    navigate: navigateMock,
    location: {
      pathname: "/space-file",
      search: "",
      hash: "#notes%2Fdraft.md",
    },
  }),
}))

vi.mock("@/components/space-select", () => ({
  SpaceSelect: ({ variant }: { variant?: string }) => (
    <button type="button" data-space-select-variant={variant}>
      new-base
    </button>
  ),
}))

vi.mock("./file-tree", () => ({
  FileSpaceTree: ({ spaceId }: { spaceId: string }) => (
    <div data-file-tree-space-id={spaceId}>File tree</div>
  ),
}))

vi.mock("./versioning/version-panel", () => ({
  VersionPanel: ({ spaceId }: { spaceId: string }) => (
    <div data-version-panel-space-id={spaceId}>Version panel</div>
  ),
}))

describe("FileSpaceSidebar layout", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    isMacDesktopMock.mockReturnValue(true)
    navigateMock.mockClear()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  async function renderSidebar() {
    await act(async () => {
      root.render(
        <SidebarProvider>
          <FileSpaceSidebar />
        </SidebarProvider>
      )
    })
  }

  it("puts work modes at the top and the current Space at the bottom", async () => {
    await renderSidebar()

    const modeNavigation = container.querySelector(
      '[aria-label="Space sidebar views"]'
    )
    const footerSpaceSelect = container.querySelector(
      '[data-space-select-variant="sidebar-footer"]'
    )

    expect(modeNavigation).not.toBeNull()
    expect(modeNavigation?.textContent).toContain("Files")
    expect(modeNavigation?.textContent).toContain("Version")
    expect(modeNavigation?.textContent).toContain("Logs")
    expect(footerSpaceSelect?.textContent).toBe("new-base")
    expect(
      container.querySelector('button[aria-label="Space settings"]')
    ).not.toBeNull()
    expect(
      container.querySelector('[data-space-select-variant="titlebar"]')
    ).toBeNull()
    expect(modeNavigation?.parentElement?.className).toContain("!pl-[72px]")
  })

  it("switches between Files, Version, and Logs panels", async () => {
    await renderSidebar()

    expect(
      container.querySelector('[data-file-tree-space-id="new-base"]')
    ).not.toBeNull()

    const versionButton = container.querySelector<HTMLButtonElement>(
      'button[title="Version"]'
    )
    await act(async () => versionButton?.click())

    expect(
      container.querySelector('[data-version-panel-space-id="new-base"]')
    ).not.toBeNull()
    expect(versionButton?.getAttribute("aria-pressed")).toBe("true")
    expect(
      container.querySelector('[data-file-tree-space-id="new-base"]')
    ).toBeNull()

    const logsButton = container.querySelector<HTMLButtonElement>(
      'button[title="Logs"]'
    )
    await act(async () => logsButton?.click())

    expect(container.textContent).toContain(
      "Space activity and extension logs will appear here."
    )
    expect(logsButton?.getAttribute("aria-pressed")).toBe("true")

    const filesButton = container.querySelector<HTMLButtonElement>(
      'button[title="Files"]'
    )
    await act(async () => filesButton?.click())

    expect(
      container.querySelector('[data-file-tree-space-id="new-base"]')
    ).not.toBeNull()
    expect(filesButton?.getAttribute("aria-pressed")).toBe("true")
  })

  it("keeps the editor open when settings navigation cannot save it", async () => {
    const unregister = registerPendingWriteFlusher(
      "sidebar-settings-save",
      async () => false,
      { spaceId: "new-base", filePath: "notes/draft.md" }
    )
    const alert = vi.spyOn(window, "alert").mockImplementation(() => undefined)
    await renderSidebar()

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('button[aria-label="Space settings"]')
        ?.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(navigateMock).not.toHaveBeenCalled()
    expect(alert).toHaveBeenCalledWith(
      "Eidos could not save the current file. Resolve the error before leaving it."
    )
    alert.mockRestore()
    unregister()
  })
})
