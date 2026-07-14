import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import { useTabStore } from "@/apps/web-app/store/tabs"
import { Sidebar, SidebarProvider } from "@/components/ui/sidebar"

import { SettingsSidebar } from "./settings-sidebar"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const navigateMock = vi.hoisted(() => vi.fn())
const routeState = vi.hoisted(() => ({ pathname: "/settings/general" }))
const currentSpaceState = vi.hoisted(() => ({
  mode: "file" as "file" | "legacy",
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) =>
      ({
        "common.badge.beta": "Beta",
        "settings.account.title": "Account",
        "settings.ai": "AI",
        "settings.backToApp": "Back to app",
        "settings.browser": "Browser",
        "settings.general": "General",
        "settings.secrets": "Secrets",
        "settings.sync": "Sync",
        "settings.title": "Settings",
        "space.settings.document": "Document",
        "space.settings.general": "Space general",
        "space.settings.mounts": "Mounts",
        "space.settings.migration.title": "Migration",
        "space.settings.relay": "Relay",
        "space.settings.theme": "Theme",
        "space.settings.title": "Space settings",
      })[key] ??
      fallback ??
      key,
  }),
}))

vi.mock("@/lib/env", () => ({ isDesktopMode: true }))
vi.mock("@/lib/web/helper", () => ({ isMacDesktop: () => false }))

vi.mock("@/apps/web-app/hooks/use-current-space", () => ({
  useCurrentSpace: () => ({
    currentSpace: {
      id: "file-space",
      name: "File Space",
      mode: currentSpaceState.mode,
      path: "/tmp/file-space",
    },
  }),
}))

vi.mock("@/apps/web-app/hooks/use-router-adapter", () => ({
  useRouterAdapter: () => ({
    navigate: navigateMock,
    location: {
      pathname: routeState.pathname,
      search: "",
      hash: "",
    },
  }),
}))

describe("SettingsSidebar", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    navigateMock.mockClear()
    routeState.pathname = "/settings/general"
    currentSpaceState.mode = "file"
    useTabStore.setState({
      tabs: [
        {
          id: "file",
          url: "/space-file#notes%2Fplan.md",
          title: "plan.md",
          lastAccessTime: 10,
        },
        {
          id: "settings",
          url: "/settings/general",
          title: "Settings",
          lastAccessTime: 20,
        },
      ],
      panels: [
        {
          id: "main",
          tabIds: ["file", "settings"],
          activeTabId: "settings",
        },
      ],
      activePanelId: "main",
      history: {},
    })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    useTabStore.setState({
      tabs: [],
      panels: [],
      activePanelId: null,
      history: {},
    })
  })

  async function renderSidebar() {
    await act(async () => {
      root.render(
        <SidebarProvider>
          <Sidebar>
            <SettingsSidebar />
          </Sidebar>
        </SidebarProvider>
      )
    })
  }

  it("shows the Settings categories and only supported file Space settings", async () => {
    await renderSidebar()

    expect(
      container.querySelector('[data-settings-sidebar="true"]')
    ).not.toBeNull()
    expect(container.querySelector('nav[aria-label="Settings"]')).not.toBeNull()
    expect(container.textContent).toContain("General")
    expect(container.textContent).toContain("AI")
    expect(container.textContent).toContain("Space general")
    expect(container.textContent).toContain("Files & Obsidian")
    expect(container.textContent).toContain("Base")
    expect(container.textContent).toContain("Versioning")
    expect(container.textContent).toContain("Indexes")
    expect(container.textContent).not.toContain("Document")
    expect(container.textContent).not.toContain("Migration")
    expect(
      container.querySelector<HTMLButtonElement>("button[aria-current='page']")
        ?.textContent
    ).toContain("General")

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent?.includes("AI"))
        ?.click()
    })
    expect(navigateMock).toHaveBeenCalledWith("/settings/ai", {
      replace: true,
    })
  })

  it("shows migration only for legacy database Spaces", async () => {
    currentSpaceState.mode = "legacy"
    await renderSidebar()

    expect(container.textContent).toContain("Migration")
    expect(container.textContent).not.toContain("Files & Obsidian")
    expect(container.textContent).not.toContain("Versioning")

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent?.includes("Migration"))
        ?.click()
    })
    expect(navigateMock).toHaveBeenCalledWith("/settings/space-migration", {
      replace: true,
    })
  })

  it("returns to the previous app tab", async () => {
    await renderSidebar()

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('button[aria-label="Back to app"]')
        ?.click()
    })

    expect(useTabStore.getState().getActiveTabId()).toBe("file")
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it("filters settings without leaving the settings mode", async () => {
    await renderSidebar()

    const search = container.querySelector<HTMLInputElement>(
      'input[aria-label="Search settings"]'
    )
    expect(search).not.toBeNull()
    await act(async () => {
      if (!search) return
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set?.call(search, "AI")
      search.dispatchEvent(new Event("input", { bubbles: true }))
    })

    const itemLabels = [...container.querySelectorAll("nav button")].map(
      (button) => button.textContent?.trim()
    )
    expect(itemLabels).toContain("AI")
    expect(itemLabels).not.toContain("General")
    expect(container.textContent).not.toContain("Space general")
  })

  it("returns to the Space home when Settings is the only tab", async () => {
    useTabStore.setState({
      tabs: [
        {
          id: "settings",
          url: "/settings/general",
          title: "Settings",
          lastAccessTime: 20,
        },
      ],
      panels: [
        {
          id: "main",
          tabIds: ["settings"],
          activeTabId: "settings",
        },
      ],
      activePanelId: "main",
      history: {},
    })
    await renderSidebar()

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('button[aria-label="Back to app"]')
        ?.click()
    })

    expect(navigateMock).toHaveBeenCalledWith("/", { replace: true })
  })
})
