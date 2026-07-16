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
const routeState = vi.hoisted(() => ({
  pathname: "/space-file",
  search: "",
  hash: "#notes%2Fdraft.md",
}))

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
    location: routeState,
  }),
}))

vi.mock("@/apps/web-app/components/settings/settings-sidebar", () => ({
  SettingsSidebar: () => (
    <div data-settings-sidebar="true">Settings navigation</div>
  ),
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

vi.mock("./document-navigation-panel", () => ({
  DocumentNavigationPanel: ({ spaceId }: { spaceId: string }) => (
    <div data-document-navigation-space-id={spaceId}>Document navigation</div>
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
    routeState.pathname = "/space-file"
    routeState.search = ""
    routeState.hash = "#notes%2Fdraft.md"
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
      '[aria-label="Space sidebar navigation"]'
    )
    const footerSpaceSelect = container.querySelector(
      '[data-space-select-variant="sidebar-footer"]'
    )

    expect(modeNavigation).not.toBeNull()
    expect(modeNavigation?.textContent).toContain("Version")
    expect(modeNavigation?.textContent).not.toContain("Logs")
    expect(
      modeNavigation?.querySelector('button[aria-label="Hide sidebar"]')
    ).not.toBeNull()
    expect(
      modeNavigation?.querySelector('button[aria-label="Open Version"]')
    ).not.toBeNull()
    expect(footerSpaceSelect?.textContent).toBe("new-base")
    expect(
      container.querySelector('button[aria-label="Space settings"]')
    ).not.toBeNull()
    expect(
      container.querySelector('[data-space-select-variant="titlebar"]')
    ).toBeNull()
    expect(modeNavigation?.parentElement?.className).toContain(
      "eidos-shell-titlebar"
    )
    expect(footerSpaceSelect?.closest(".eidos-shell-statusbar")).not.toBeNull()
    expect(modeNavigation?.parentElement?.className).toContain("!pl-[72px]")
  })

  it("opens Version as a destination and returns to Files", async () => {
    await renderSidebar()

    expect(
      container.querySelector('[data-file-tree-space-id="new-base"]')
    ).not.toBeNull()

    const versionButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Open Version"]'
    )
    await act(async () => versionButton?.click())

    expect(
      container.querySelector('[data-version-panel-space-id="new-base"]')
    ).not.toBeNull()
    expect(
      container.querySelector('[data-file-tree-space-id="new-base"]')
    ).toBeNull()

    const filesButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Back to Files"]'
    )
    await act(async () => filesButton?.click())

    expect(
      container.querySelector('[data-file-tree-space-id="new-base"]')
    ).not.toBeNull()
    expect(
      container.querySelector('button[aria-label="Open Version"]')
    ).not.toBeNull()
  })

  it("replaces the entire file Space sidebar while Settings is active", async () => {
    await renderSidebar()
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('button[aria-label="Open Version"]')
        ?.click()
    })

    routeState.pathname = "/settings/space-general"
    routeState.hash = ""
    await renderSidebar()

    expect(
      container.querySelector('[data-settings-sidebar="true"]')
    ).not.toBeNull()
    expect(
      container.querySelector('[aria-label="Space sidebar navigation"]')
    ).toBeNull()
    expect(
      container.querySelector('[data-space-select-variant="sidebar-footer"]')
    ).toBeNull()
    expect(
      container.querySelector('[data-file-tree-space-id="new-base"]')
    ).toBeNull()

    routeState.pathname = "/space-file"
    await renderSidebar()

    expect(
      container.querySelector('[data-version-panel-space-id="new-base"]')
    ).not.toBeNull()
    expect(
      container.querySelector<HTMLButtonElement>(
        'button[aria-label="Back to Files"]'
      )
    ).not.toBeNull()
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
