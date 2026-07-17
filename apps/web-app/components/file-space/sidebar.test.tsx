// @vitest-environment jsdom

vi.hoisted(() => {
  const values = new Map<string, string>()
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() {
        return values.size
      },
    },
  })
})

import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import { SidebarProvider } from "@/components/ui/sidebar"
import {
  clearFileSpaceAgentSessionActivity,
  setFileSpaceAgentSessionActivity,
} from "@/apps/web-app/components/file-space-agent/session-activity"
import { useTabStore } from "@/apps/web-app/store/tabs"

import { registerPendingWriteFlusher } from "./pending-writes"
import { FileSpaceSidebar } from "./sidebar"
import { fileSpaceAgentConversationId } from "./work-modes"

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
const versioningState = vi.hoisted(() => ({
  status: {
    enabled: true,
    clean: false,
    hasConflicts: false,
    branch: "main",
    mergeHead: null,
    head: null,
    changes: [{ path: "notes/draft.md", status: "modified" }] as Array<{
      path: string
      status: string
      conflicted?: boolean
    }>,
    remoteNames: [],
    upstream: null,
    ahead: 0,
    behind: 0,
  },
  operation: null as string | null,
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

vi.mock("@/apps/web-app/hooks/use-space-versioning", () => ({
  useSpaceVersioning: () => versioningState,
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
    <input data-file-tree-space-id={spaceId} defaultValue="File tree state" />
  ),
}))

vi.mock("./document-navigation-panel", () => ({
  DocumentNavigationPanel: ({ spaceId }: { spaceId: string }) => (
    <div data-document-navigation-space-id={spaceId}>Document navigation</div>
  ),
}))

vi.mock("./versioning/version-panel", () => ({
  VersionPanel: ({ spaceId }: { spaceId: string }) => (
    <input data-version-panel-space-id={spaceId} defaultValue="Version state" />
  ),
}))

function modeButton(container: HTMLElement, label: string) {
  return container.querySelector<HTMLButtonElement>(
    `button[role="tab"][aria-label^="${label} mode"]`
  )
}

describe("FileSpaceSidebar work modes", () => {
  let container: HTMLDivElement
  let root: Root
  const originalEidosDescriptor = Object.getOwnPropertyDescriptor(
    window,
    "eidos"
  )

  beforeEach(() => {
    isMacDesktopMock.mockReturnValue(true)
    navigateMock.mockClear()
    versioningState.status.hasConflicts = false
    versioningState.status.changes = [
      { path: "notes/draft.md", status: "modified" },
    ]
    versioningState.operation = null
    routeState.pathname = "/space-file"
    routeState.search = ""
    routeState.hash = "#notes%2Fdraft.md"
    Object.defineProperty(window, "eidos", {
      configurable: true,
      value: {
        fileSpaceAgent: {},
        spaceVersioning: {},
      },
    })
    useTabStore.setState({
      tabs: [
        {
          id: "file-tab",
          url: "/space-file#notes%2Fdraft.md",
          title: "draft.md",
          lastAccessTime: 1,
        },
      ],
      panels: [
        {
          id: "main-panel",
          tabIds: ["file-tab"],
          activeTabId: "file-tab",
        },
      ],
      activePanelId: "main-panel",
    })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      for (const tab of useTabStore.getState().tabs) {
        const conversationId = fileSpaceAgentConversationId(tab.url)
        if (conversationId) clearFileSpaceAgentSessionActivity(conversationId)
      }
      root.unmount()
    })
    container.remove()
  })

  afterAll(() => {
    if (originalEidosDescriptor) {
      Object.defineProperty(window, "eidos", originalEidosDescriptor)
    } else {
      Reflect.deleteProperty(window, "eidos")
    }
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

  async function clickMode(label: string) {
    await act(async () => {
      modeButton(container, label)?.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }

  it("uses one stable top mode rail and reserves the footer for the Space", async () => {
    await renderSidebar()

    const modeNavigation = container.querySelector(
      'nav[aria-label="Space work modes"]'
    )
    const footerSpaceSelect = container.querySelector(
      '[data-space-select-variant="sidebar-footer"]'
    )

    expect(modeNavigation).not.toBeNull()
    expect(modeButton(container, "Files")?.ariaSelected).toBe("true")
    expect(modeButton(container, "Version")?.ariaSelected).toBe("false")
    expect(modeButton(container, "Agent")?.ariaSelected).toBe("false")
    expect(modeButton(container, "Files")?.textContent).toContain("Files")
    expect(modeButton(container, "Version")?.textContent).toContain("Version")
    expect(modeButton(container, "Agent")?.textContent).toContain("Agent")
    expect(modeButton(container, "Version")?.textContent).toContain("1")
    expect(footerSpaceSelect?.textContent).toBe("new-base")
    expect(
      container.querySelector('button[aria-label="Space settings"]')
    ).not.toBeNull()
    expect(
      container.querySelector(
        'button[aria-label="Open Agent with current context"]'
      )
    ).toBeNull()
    expect(
      container.querySelector('[role="separator"][aria-label="Resize sidebar"]')
    ).not.toBeNull()
    expect(modeNavigation?.parentElement?.className).toContain(
      "eidos-shell-titlebar"
    )
    expect(modeNavigation?.parentElement?.className).toContain("!pl-[72px]")
    expect(footerSpaceSelect?.closest(".eidos-shell-statusbar")).not.toBeNull()
  })

  it("keeps Files and Version panel state mounted across round trips", async () => {
    await renderSidebar()

    const fileTree = container.querySelector<HTMLInputElement>(
      '[data-file-tree-space-id="new-base"]'
    )!
    fileTree.value = "preserved Files state"

    await clickMode("Version")

    const versionPanel = container.querySelector<HTMLInputElement>(
      '[data-version-panel-space-id="new-base"]'
    )!
    expect(versionPanel).not.toBeNull()
    expect(fileTree.closest('[role="tabpanel"]')?.className).toContain("hidden")
    versionPanel.value = "preserved Version state"

    await clickMode("Files")
    expect(fileTree.value).toBe("preserved Files state")

    await clickMode("Version")
    expect(
      container.querySelector<HTMLInputElement>(
        '[data-version-panel-space-id="new-base"]'
      )?.value
    ).toBe("preserved Version state")
  })

  it("opens Agent in the main tab area and returns to the prior file tab", async () => {
    await renderSidebar()
    await clickMode("Agent")

    const agentTab = useTabStore
      .getState()
      .tabs.find((tab) => fileSpaceAgentConversationId(tab.url))
    expect(agentTab).toBeDefined()
    expect(useTabStore.getState().getActiveTabId()).toBe(agentTab?.id)
    expect(modeButton(container, "Agent")?.ariaSelected).toBe("true")
    expect(
      container.querySelector('[aria-label="Open Agent sessions"]')
    ).not.toBeNull()
    expect(
      container.querySelector('[data-file-tree-space-id="new-base"]')
    ).not.toBeNull()

    const conversationId = fileSpaceAgentConversationId(agentTab!.url)!
    await act(async () => {
      setFileSpaceAgentSessionActivity(conversationId, { status: "running" })
    })
    expect(
      container.querySelector('[aria-label="1 Agent sessions running"]')
    ).not.toBeNull()

    await clickMode("Files")
    expect(useTabStore.getState().getActiveTabId()).toBe("file-tab")
    expect(modeButton(container, "Files")?.ariaSelected).toBe("true")
    expect(
      useTabStore.getState().tabs.some((tab) => tab.id === agentTab?.id)
    ).toBe(true)
  })

  it("shows authoritative running and approval states in the Agent session list", async () => {
    const listConversations = vi.fn(async () => [
      {
        formatVersion: 2,
        id: "approval-session",
        title: "Approval review",
        model: "model@provider",
        latestRunStatus: "waiting-approval" as const,
        pendingApprovalCount: 1,
        pendingApprovalTitle: "Delete Space path",
        createdAt: "2026-07-17T00:00:00.000Z",
        updatedAt: "2026-07-17T00:02:00.000Z",
      },
      {
        formatVersion: 2,
        id: "running-session",
        title: "Background work",
        model: "model@provider",
        latestRunStatus: "running" as const,
        createdAt: "2026-07-17T00:00:00.000Z",
        updatedAt: "2026-07-17T00:01:00.000Z",
      },
    ])
    Object.defineProperty(window, "eidos", {
      configurable: true,
      value: {
        fileSpaceAgent: {
          listConversations,
          searchConversations: vi.fn(async () => []),
        },
        spaceVersioning: {},
      },
    })

    await renderSidebar()
    await clickMode("Agent")
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })

    expect(
      container.querySelector(
        'button[aria-label="Approval review: Approval required"]'
      )
    ).not.toBeNull()
    expect(container.textContent).toContain("Approve: Delete Space path")
    expect(container.textContent).toContain("Review")
    expect(
      container.querySelector('button[aria-label="Background work: Running"]')
    ).not.toBeNull()
  })

  it("does not re-add unmatched open Agent tabs to conversation search", async () => {
    const listConversations = vi.fn(async () => [])
    const searchConversations = vi.fn(async () => [])
    Object.defineProperty(window, "eidos", {
      configurable: true,
      value: {
        fileSpaceAgent: { listConversations, searchConversations },
        spaceVersioning: {},
      },
    })
    await renderSidebar()
    await clickMode("Agent")
    const search = container.querySelector<HTMLInputElement>(
      'input[aria-label="Search Agent conversations"]'
    )!

    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!.call(search, "does-not-match")
      search.dispatchEvent(new Event("input", { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 10))
    })

    expect(searchConversations).toHaveBeenCalledWith(
      "new-base",
      "does-not-match"
    )
    expect(container.textContent).toContain("No matching conversations")
  })

  it("cancels a mode switch when the active file cannot be saved", async () => {
    const unregister = registerPendingWriteFlusher(
      "sidebar-mode-save",
      async () => false,
      { spaceId: "new-base", filePath: "notes/draft.md" }
    )
    const alert = vi.spyOn(window, "alert").mockImplementation(() => undefined)
    await renderSidebar()

    await clickMode("Version")

    expect(modeButton(container, "Files")?.ariaSelected).toBe("true")
    expect(
      container.querySelector('[data-version-panel-space-id="new-base"]')
    ).toBeNull()
    expect(alert).toHaveBeenCalledWith(
      "Eidos could not save the current file. Resolve the error before opening Version."
    )
    alert.mockRestore()
    unregister()
  })

  it("supports mode shortcuts, arrow navigation, and collapsed recovery", async () => {
    await renderSidebar()
    const legacySidebarShortcut = vi.fn()
    document.addEventListener("keydown", legacySidebarShortcut)
    const resizeHandle = container.querySelector<HTMLDivElement>(
      '[role="separator"][aria-label="Resize sidebar"]'
    )!
    await act(async () => {
      resizeHandle.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Home", bubbles: true })
      )
    })
    expect(resizeHandle.getAttribute("aria-valuenow")).toBe("200")
    expect(
      modeButton(container, "Agent")?.querySelector(".sr-only")
    ).not.toBeNull()

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('button[aria-label="Hide sidebar"]')
        ?.click()
    })
    legacySidebarShortcut.mockClear()

    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "2", metaKey: true, bubbles: true })
      )
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(modeButton(container, "Version")?.ariaSelected).toBe("true")
    expect(container.querySelector('[data-state="expanded"]')).not.toBeNull()
    expect(legacySidebarShortcut).not.toHaveBeenCalled()
    document.removeEventListener("keydown", legacySidebarShortcut)

    await act(async () => {
      modeButton(container, "Version")?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })
      )
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(modeButton(container, "Files")?.ariaSelected).toBe("true")
    expect(document.activeElement).toBe(modeButton(container, "Files"))
  })

  it("keeps unavailable Desktop modes visible but disabled", async () => {
    Object.defineProperty(window, "eidos", {
      configurable: true,
      value: { spaceVersioning: {} },
    })
    await renderSidebar()

    expect(modeButton(container, "Files")?.disabled).toBe(false)
    expect(modeButton(container, "Version")?.disabled).toBe(false)
    expect(modeButton(container, "Agent")?.disabled).toBe(true)
    expect(modeButton(container, "Agent")?.title).toContain(
      "Desktop Agent unavailable"
    )
  })

  it("labels Version conflicts without relying on color", async () => {
    versioningState.status.hasConflicts = true
    versioningState.status.changes = [
      {
        path: "notes/draft.md",
        status: "conflicted",
        conflicted: true,
      },
    ]
    await renderSidebar()

    expect(
      container.querySelector('[aria-label="1 version conflicts"]')
    ).not.toBeNull()
    expect(modeButton(container, "Version")?.title).toContain("1 conflict")
  })

  it("preserves the selected work mode while Settings owns the sidebar", async () => {
    await renderSidebar()
    await clickMode("Version")

    routeState.pathname = "/settings/space-general"
    routeState.hash = ""
    await renderSidebar()
    expect(
      container.querySelector('[data-settings-sidebar="true"]')
    ).not.toBeNull()
    expect(
      container.querySelector('[aria-label="Space work modes"]')
    ).toBeNull()

    routeState.pathname = "/space-file"
    await renderSidebar()
    expect(modeButton(container, "Version")?.ariaSelected).toBe("true")
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
