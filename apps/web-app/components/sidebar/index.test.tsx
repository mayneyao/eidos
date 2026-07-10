import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import { SidebarProvider } from "@/components/ui/sidebar"

import { SideBar } from "./index"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const routeState = vi.hoisted(() => ({ pathname: "/settings/general" }))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@/apps/web-app/hooks/use-router-adapter", () => ({
  useRouterAdapter: () => ({
    navigate: vi.fn(),
    location: {
      pathname: routeState.pathname,
      search: "",
      hash: "",
    },
  }),
}))

vi.mock("@/apps/web-app/hooks/use-space", () => ({
  useSpace: () => ({ spaceList: [{ id: "main", name: "Main" }] }),
}))

vi.mock("@/apps/web-app/store/runtime-store", () => ({
  useAppRuntimeStore: () => ({ isShareMode: false }),
}))

vi.mock("@/apps/web-app/components/settings/settings-sidebar", () => ({
  SettingsSidebar: () => (
    <div data-settings-sidebar="true">Settings navigation</div>
  ),
}))

vi.mock("@/components/space-select", () => ({
  SpaceSelect: () => <div data-space-select="true">Main</div>,
}))

vi.mock("./sidebar-tabs", () => ({
  SidebarTabs: () => <div data-sidebar-tabs="true">App modes</div>,
}))

vi.mock("./sidebar-content", () => ({
  SidebarContent: () => <div data-sidebar-content="true">App sidebar</div>,
}))

vi.mock("./update-status", () => ({
  SidebarUpdateStatus: () => null,
}))

describe("SideBar Settings mode", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    routeState.pathname = "/settings/general"
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
          <SideBar />
        </SidebarProvider>
      )
    })
  }

  it("replaces the whole app sidebar on a Settings route", async () => {
    await renderSidebar()

    expect(
      container.querySelector('[data-settings-sidebar="true"]')
    ).not.toBeNull()
    expect(container.querySelector('[data-sidebar-tabs="true"]')).toBeNull()
    expect(container.querySelector('[data-sidebar-content="true"]')).toBeNull()
    expect(container.querySelector('[data-space-select="true"]')).toBeNull()
  })

  it("does not render the Settings sidebar for an app route", async () => {
    routeState.pathname = "/"
    await renderSidebar()

    expect(container.querySelector('[data-settings-sidebar="true"]')).toBeNull()
    expect(container.querySelector('[data-sidebar-tabs="true"]')).not.toBeNull()
    expect(
      container.querySelector('[data-sidebar-content="true"]')
    ).not.toBeNull()
    expect(container.querySelector('[data-space-select="true"]')).not.toBeNull()
  })
})
