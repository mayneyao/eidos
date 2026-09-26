// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { PluginManager, PluginFileActions } from "./plugin-manager"
import type { PluginListing } from "../shared/plugins"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let container: HTMLDivElement
let root: Root
const install = vi.fn(async () => true)
const enable = vi.fn(async () => {})
const uninstall = vi.fn(async () => true)
const associate = vi.fn(async () => {})
beforeEach(() => {
  vi.clearAllMocks()
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  const listing: PluginListing = {
    space: { plugins: {}, associations: {} },
    plugins: [
      {
        hash: "hash",
        enabled: false,
        manifest: {
          apiVersion: 1,
          requires: { pluginApi: "2.0.0" },
          id: "example.csv",
          name: "CSV",
          version: "1.0.0",
        },
      },
    ],
  }
  Object.assign(window, {
    eidosLite: {
      listPlugins: async () => listing,
      onPluginEvent: () => () => {},
      installPlugin: install,
      installDroppedPlugin: install,
      onPluginInstallProgress: () => () => {},
      pluginReadme: async () => null,
      pluginMarketplace: async () => ({
        plugins: [
          {
            id: "eidos.map",
            name: "Map",
            description: "Map view",
            repo: "eidos-space/eidos-map-plugin",
            version: "0.1.0",
            sha256: "abc",
            preview: true,
            compatibility: "Preview build",
          },
        ],
        cached: false,
        fetchedAt: new Date().toISOString(),
      }),
      installMarketplacePlugin: install,
      setPluginEnabled: enable,
      uninstallPlugin: uninstall,
      setPluginDefault: associate,
      pluginEditors: async () => [
        { key: "example.csv/csv", label: "CSV", pluginName: "CSV" },
      ],
    },
  })
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})
async function click(text: string) {
  const button = [...container.querySelectorAll("button")].find(
    (item) =>
      item.textContent === text ||
      item.getAttribute("aria-label") === text ||
      (item.getAttribute("role") === "tab" &&
        item.textContent?.startsWith(text))
  )
  expect(button).toBeDefined()
  await act(async () => button!.click())
}

async function drop(files: File[], type = "drop") {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, "dataTransfer", {
    value: { types: ["Files"], files, dropEffect: "none" },
  })
  await act(async () => {
    container.querySelector(".plugin-drop-zone")!.dispatchEvent(event)
  })
  expect(event.defaultPrevented).toBe(true)
}

it("lets users remove an unreadable installed plugin without trying to enable it", async () => {
  Object.assign(window.eidosLite, {
    listPlugins: async () => ({
      space: { plugins: {}, associations: {} },
      activeThemeId: null,
      plugins: [
        {
          hash: "old-hash",
          enabled: false,
          unavailable: true,
          manifest: {
            apiVersion: 1,
            id: "example.old-theme",
            name: "example.old-theme",
            version: "0.0.0",
          },
        },
      ],
    }),
  })
  await act(async () => root.render(<PluginManager spaceAvailable />))
  await click("Installed")
  expect(container.textContent).toContain("Unavailable")
  await click("example.old-theme")
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "Reinstall or uninstall"
  )
  expect(container.textContent).toContain("Unknown version")
  expect(
    [...container.querySelectorAll("button")].some(
      (button) => button.textContent === "Enable"
    )
  ).toBe(false)
  await click("Uninstall")
  expect(uninstall).toHaveBeenCalledWith("example.old-theme")
})

it("starts a marketplace installation requested by a plugin link", async () => {
  const handled = vi.fn()
  await act(async () =>
    root.render(
      <PluginManager
        variant="settings"
        installRequest={{ id: "eidos.map", sequence: 1 }}
        onInstallRequestHandled={handled}
      />
    )
  )
  expect(install).toHaveBeenCalledWith("eidos.map")
  expect(handled).toHaveBeenCalledWith(1)
  expect(container.textContent).toContain("Map view")
})

it("drops packages in the catalog and detail view, rejects mixed files and refreshes", async () => {
  const list = vi.spyOn(window.eidosLite, "listPlugins")
  await act(async () => root.render(<PluginManager />))
  const file = new File(["archive"], "smart.eidos-plugin")
  await drop([file], "dragenter")
  expect(container.textContent).toContain("Drop to install or update")
  await drop([file])
  expect(install).toHaveBeenCalledWith(file)
  expect(list).toHaveBeenCalledTimes(2)
  expect(container.querySelector(".plugin-drop-overlay")).toBeNull()
  await click("CSV")
  const second = new File(["archive"], "another.eidos-plugin")
  await drop([file, second])
  expect(install).toHaveBeenLastCalledWith(second)
  install.mockClear()
  await drop([file, new File(["text"], "notes.txt")])
  expect(install).not.toHaveBeenCalled()
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    ".eidos-plugin"
  )
})

it("ignores another drop while installation is pending and shows installation errors", async () => {
  let finish!: (value: boolean) => void
  install.mockImplementationOnce(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve
      })
  )
  await act(async () => root.render(<PluginManager />))
  const file = new File(["archive"], "smart.eidos-plugin")
  await drop([file])
  await drop([file])
  expect(install).toHaveBeenCalledTimes(1)
  await act(async () => finish(true))
  install.mockRejectedValueOnce(new Error("Invalid package"))
  await drop([file])
  expect(container.textContent).toContain("Invalid package")
})

it("shows one installation list with Space-only enablement and device-wide uninstall", async () => {
  await act(async () => root.render(<PluginManager spaceAvailable />))
  expect(container.querySelector("select")).toBeNull()
  expect(container.textContent).toContain("No plugins enabled in this Space")
  await click("Installed")
  await click("Install plugin…")
  expect(install).toHaveBeenCalledWith()
  await click("CSV")
  await click("Enable")
  expect(enable).toHaveBeenCalledWith("example.csv", true)
  await click("Uninstall")
  expect(uninstall).toHaveBeenCalledWith("example.csv")
})

it("application settings can install but cannot enable a plugin without a Space", async () => {
  await act(async () => root.render(<PluginManager />))
  expect(
    [...container.querySelectorAll("button")].some(
      (button) =>
        button.textContent === "Enable" || button.textContent === "Disable"
    )
  ).toBe(false)
  expect(container.textContent).toContain("Open a Space")
  await click("Load development source…")
  expect(install).toHaveBeenCalledWith(true)
  expect(enable).not.toHaveBeenCalled()
  await click("Marketplace")
  expect(container.querySelector('[role="tabpanel"]')?.textContent).toContain(
    "Map view"
  )
  expect(
    container.querySelector('[role="tabpanel"]')?.textContent
  ).not.toContain("Uninstall")
  await click("Install…")
  expect(install).toHaveBeenCalledWith("eidos.map")
})

it("guides enabled empty state to installed tab, and installed empty state to marketplace tab", async () => {
  Object.assign(window.eidosLite, {
    listPlugins: async () => ({
      space: { plugins: {}, associations: {} },
      plugins: [],
    }),
  })
  await act(async () => root.render(<PluginManager spaceAvailable />))
  expect(container.textContent).toContain("No plugins enabled in this Space")
  await click("Browse installed plugins")
  expect(container.textContent).toContain("No plugins installed")
  await click("Browse Marketplace")
  expect(container.querySelector('[role="tabpanel"]')?.textContent).toContain(
    "Map view"
  )
})

it("renders on-demand editor choices with icons and without default management buttons", async () => {
  const onSelect = vi.fn()
  await act(async () =>
    root.render(
      <PluginFileActions
        relativePath="data.csv"
        selected="example.csv/csv"
        initialChoices={[
          {
            key: "example.csv/csv",
            label: "CSV",
            pluginName: "CSV",
            icon: { paths: ["M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6z"] },
          },
          {
            key: "example.mindmap/map",
            label: "Mindmap",
            pluginName: "Mindmap",
            icon: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
          },
        ]}
        onSelect={onSelect}
      />
    )
  )
  expect(container.querySelectorAll("select")).toHaveLength(0)
  const buttons = container.querySelectorAll("button")
  expect(buttons).toHaveLength(3)

  // Built-in editor has Code2 svg icon
  const builtinBtn = buttons[0]
  expect(builtinBtn.textContent).toContain("Built-in editor")
  expect(builtinBtn.querySelector("svg")).not.toBeNull()

  // CSV has custom path svg icon
  const csvBtn = buttons[1]
  expect(csvBtn.textContent).toContain("CSV")
  expect(csvBtn.querySelector("svg")).not.toBeNull()

  // Mindmap has img icon
  const mindmapBtn = buttons[2]
  expect(mindmapBtn.textContent).toContain("Mindmap")
  expect(mindmapBtn.querySelector("img")).not.toBeNull()

  expect(container.textContent).not.toContain("Set as default in this Space")
  expect(container.textContent).not.toContain("Reset default")

  await click("Built-in editor")
  expect(onSelect).toHaveBeenCalledWith("builtin")
})

it("omits built-in editor option for markdown files in PluginFileActions", async () => {
  await act(async () =>
    root.render(
      <PluginFileActions
        relativePath="README.md"
        selected="builtin"
        onSelect={() => {}}
      />
    )
  )
  expect(container.textContent).not.toContain("Built-in editor")
  expect(container.textContent).toContain("CSV")
})

it("supports switching between card and list layouts and persists preference", async () => {
  localStorage.clear()
  await act(async () => root.render(<PluginManager spaceAvailable />))
  await click("Installed")

  // Default is card layout
  expect(container.querySelector(".plugin-manager-grid")).not.toBeNull()
  expect(container.querySelector(".plugin-card")).not.toBeNull()

  // Switch to list layout
  const listBtn = container.querySelector(
    'button[aria-label="List view"]'
  ) as HTMLButtonElement
  expect(listBtn).not.toBeNull()
  await act(async () => listBtn.click())

  expect(container.querySelector(".plugin-manager-list")).not.toBeNull()
  expect(container.querySelector(".plugin-manager-grid")).toBeNull()
  expect(localStorage.getItem("eidos:plugin-layout")).toBe("list")

  // Switch back to card layout
  const cardBtn = container.querySelector(
    'button[aria-label="Card view"]'
  ) as HTMLButtonElement
  expect(cardBtn).not.toBeNull()
  await act(async () => cardBtn.click())

  expect(container.querySelector(".plugin-manager-grid")).not.toBeNull()
  expect(localStorage.getItem("eidos:plugin-layout")).toBe("card")
})

it("hides in-page back button in page mode and preserves it in settings mode", async () => {
  // Page mode with selected plugin: no in-page back button
  await act(async () =>
    root.render(
      <PluginManager
        spaceAvailable
        variant="page"
        selectedPluginId="example.csv"
      />
    )
  )
  expect(container.querySelector(".plugin-detail-back")).toBeNull()

  // Settings mode with selected plugin: has in-page back button
  await act(async () =>
    root.render(
      <PluginManager variant="settings" selectedPluginId="example.csv" />
    )
  )
  expect(container.querySelector(".plugin-detail-back")).not.toBeNull()
})

it("calls onSelectPlugin with both id and displayName when a plugin is selected", async () => {
  const onSelectPlugin = vi.fn()
  const onPluginNameChange = vi.fn()
  await act(async () =>
    root.render(
      <PluginManager
        spaceAvailable
        onSelectPlugin={onSelectPlugin}
        onPluginNameChange={onPluginNameChange}
      />
    )
  )
  await click("Installed")
  await click("CSV")
  expect(onSelectPlugin).toHaveBeenCalledWith("example.csv", "CSV")
})

it("opens details and installs for a marketplace plugin that is not installed", async () => {
  await act(async () => root.render(<PluginManager />))
  await click("Marketplace")
  const card = container.querySelector(
    '[role="button"].plugin-marketplace-card'
  ) as HTMLElement
  expect(card).not.toBeNull()
  await act(async () => card.click())
  expect(container.querySelector(".plugin-detail-hero")).not.toBeNull()
  expect(container.textContent).toContain("Map")
  expect(container.textContent).toContain("Not installed")
  expect(container.querySelector('[role="tabpanel"]')?.textContent).toContain(
    "eidos-space/eidos-map-plugin"
  )
  await click("Install…")
  expect(install).toHaveBeenCalledWith("eidos.map")
})

it("filters plugins across tabs using search input beside layout toggle", async () => {
  await act(async () =>
    root.render(
      <PluginManager
        spaceAvailable
        builtins={[
          {
            id: "builtin.terminal",
            name: "Terminal",
            enabled: true,
            details: <div>Terminal details</div>,
          },
        ]}
      />
    )
  )

  const searchInput = container.querySelector(
    'input[type="search"]'
  ) as HTMLInputElement
  expect(searchInput).not.toBeNull()

  // Switch to Installed tab
  await click("Installed")
  expect(container.textContent).toContain("CSV")
  expect(container.textContent).toContain("Terminal")

  const changeSearch = async (val: string) => {
    await act(async () => {
      const descriptor = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )
      descriptor?.set?.call(searchInput, val)
      searchInput.dispatchEvent(new Event("input", { bubbles: true }))
    })
  }

  // Search for "Terminal"
  await changeSearch("terminal")
  expect(container.textContent).toContain("Terminal")
  expect(container.textContent).not.toContain("CSV")

  // Search for nonexistent term shows empty state with Clear search
  await changeSearch("nonexistent-query")
  expect(container.textContent).toContain("No plugins found")
  await click("Clear search")
  expect(searchInput.value).toBe("")
  expect(container.textContent).toContain("CSV")
  expect(container.textContent).toContain("Terminal")

  // Search applies to Marketplace tab as well
  await changeSearch("map")
  await click("Marketplace")
  expect(container.textContent).toContain("Map view")

  await changeSearch("unknown-plugin")
  expect(container.textContent).toContain("No plugins found")
})

it("queues multiple marketplace plugins and displays progress and readme", async () => {
  let progressListener:
    | ((progress: {
        id: string
        phase: "downloading" | "installing"
        percent?: number
      }) => void)
    | undefined
  let finishInstallMap: (() => void) | undefined
  let finishInstallChart: (() => void) | undefined

  const deferredMap = new Promise<boolean>((resolve) => {
    finishInstallMap = () => resolve(true)
  })
  const deferredChart = new Promise<boolean>((resolve) => {
    finishInstallChart = () => resolve(true)
  })

  const customInstall = vi.fn((id: string) => {
    if (id === "eidos.map") return deferredMap
    if (id === "eidos.chart") return deferredChart
    return Promise.resolve(true)
  })

  Object.assign(window.eidosLite, {
    pluginMarketplace: async () => ({
      plugins: [
        {
          id: "eidos.map",
          name: "Map",
          description: "Map view",
          repo: "eidos-space/eidos-map-plugin",
          version: "0.1.0",
          sha256: "abc",
          preview: true,
          compatibility: "Preview build",
        },
        {
          id: "eidos.chart",
          name: "Chart",
          description: "Chart view",
          repo: "eidos-space/eidos-chart-plugin",
          version: "0.1.0",
          sha256: "def",
          preview: false,
          compatibility: "Preview build",
        },
      ],
      cached: false,
      fetchedAt: new Date().toISOString(),
    }),
    installMarketplacePlugin: customInstall,
    onPluginInstallProgress: (listener: unknown) => {
      progressListener = listener as typeof progressListener
      return () => {}
    },
    pluginReadme: async (id: string) => {
      if (id === "eidos.map")
        return "# Map Plugin\n\nInteractive MapLibre maps."
      return null
    },
  })

  await act(async () => root.render(<PluginManager />))
  await click("Marketplace")

  // Find install buttons for Map and Chart
  const buttons = [
    ...container.querySelectorAll(
      ".plugin-marketplace-card .plugin-install-btn"
    ),
  ] as HTMLButtonElement[]
  expect(buttons.length).toBe(2)

  // Click install on Map
  await act(async () => buttons[0].click())
  expect(customInstall).toHaveBeenCalledWith("eidos.map")

  // Map should be downloading, Chart button remains enabled
  expect(buttons[1].disabled).toBe(false)

  // Click install on Chart
  await act(async () => buttons[1].click())

  // Chart should now be queued
  expect(container.textContent).toContain("Queued")

  // Progress update for Map
  await act(async () => {
    progressListener?.({ id: "eidos.map", phase: "downloading", percent: 45 })
  })
  expect(container.textContent).toContain("45%")

  // Finish Map install
  await act(async () => {
    finishInstallMap?.()
    await Promise.resolve()
    await Promise.resolve()
  })

  // Chart should now be called automatically by the queue
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
  expect(customInstall).toHaveBeenCalledWith("eidos.chart")

  // Finish Chart install
  await act(async () => {
    finishInstallChart?.()
  })
})

it("renders README markdown in plugin detail view for marketplace plugins", async () => {
  Object.assign(window.eidosLite, {
    pluginReadme: async (id: string) => {
      if (id === "eidos.map")
        return "# Map Plugin\n\nInteractive map view with MapLibre."
      return null
    },
  })

  await act(async () => root.render(<PluginManager />))
  await click("Marketplace")

  // Click Map card to enter Detail view
  const mapCard = container.querySelector(
    ".plugin-marketplace-card"
  ) as HTMLElement
  expect(mapCard).not.toBeNull()
  await act(async () => mapCard.click())

  // Wait for readme to load and render
  await act(async () => {})
  expect(container.querySelector(".plugin-readme-card")).not.toBeNull()
  expect(container.textContent).toContain("Map Plugin")
  expect(container.textContent).toContain("Interactive map view with MapLibre.")
})

it("opens repository link in external browser when clicked", async () => {
  const openExternalUrl = vi.fn(async () => {})
  Object.assign(window.eidosLite, { openExternalUrl })

  await act(async () => root.render(<PluginManager />))
  await click("Marketplace")

  const mapCard = container.querySelector(
    ".plugin-marketplace-card"
  ) as HTMLElement
  expect(mapCard).not.toBeNull()
  await act(async () => mapCard.click())

  const repoLink = Array.from(container.querySelectorAll("a")).find((a) =>
    a.textContent?.includes("Repository")
  ) as HTMLAnchorElement
  expect(repoLink).toBeDefined()
  await act(async () => repoLink.click())
  expect(openExternalUrl).toHaveBeenCalledWith(
    "https://github.com/eidos-space/eidos-map-plugin"
  )
})

it("detects plugin updates and shows update actions in marketplace, detail view, and installed tab", async () => {
  const installMarketplace = vi.fn(async () => true)
  Object.assign(window.eidosLite, {
    listPlugins: async () => ({
      space: { plugins: {}, associations: {} },
      plugins: [
        {
          hash: "hash-csv",
          enabled: false,
          manifest: {
            apiVersion: 1,
            requires: { pluginApi: "2.0.0" },
            id: "example.csv",
            name: "CSV",
            version: "1.0.0",
          },
        },
      ],
    }),
    pluginMarketplace: async () => ({
      plugins: [
        {
          id: "example.csv",
          name: "CSV",
          description: "CSV editor",
          repo: "eidos-space/eidos-csv-plugin",
          version: "1.2.0",
          sha256: "xyz",
        },
      ],
      cached: false,
      fetchedAt: new Date().toISOString(),
    }),
    installMarketplacePlugin: installMarketplace,
  })

  await act(async () => root.render(<PluginManager spaceAvailable />))

  // In Installed tab: update badge should show count "1", and "Update all" button should be present
  await click("Installed")
  const updateBadge = container.querySelector(".plugin-tab-update-badge")
  expect(updateBadge).not.toBeNull()
  expect(updateBadge?.textContent).toBe("1")

  const updateAllBtn = container.querySelector(".plugin-update-all-btn")
  expect(updateAllBtn).not.toBeNull()
  expect(updateAllBtn?.textContent).toContain("Update all")
  expect(updateAllBtn?.textContent).toContain("1")

  // Installed card should show "Update available" badge
  expect(
    container.querySelector(".plugin-pill-status.is-update")
  ).not.toBeNull()
  expect(container.textContent).toContain("Update available")

  // Click Update all
  await act(async () => (updateAllBtn as HTMLButtonElement).click())
  expect(installMarketplace).toHaveBeenCalledWith("example.csv")

  // Switch to Marketplace tab
  await click("Marketplace")
  expect(
    container.querySelector(".plugin-pill-status.is-update")
  ).not.toBeNull()
  const updateBtn = [...container.querySelectorAll("button")].find(
    (b) => b.textContent === "Update"
  )
  expect(updateBtn).toBeDefined()
  expect((updateBtn as HTMLButtonElement).disabled).toBe(false)

  // Click Update button on card
  await act(async () => (updateBtn as HTMLButtonElement).click())
  expect(installMarketplace).toHaveBeenCalledWith("example.csv")

  // Click card to open detail view
  const card = container.querySelector(
    ".plugin-marketplace-card"
  ) as HTMLElement
  await act(async () => card.click())
  expect(
    container.querySelector(".plugin-status-pill.is-update")
  ).not.toBeNull()
  expect(container.textContent).toContain("Update available: v1.2.0")
})
