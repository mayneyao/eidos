// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { Check } from "lucide-react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { I18nProvider } from "../i18n"
import { AppTitlebar } from "./app-titlebar"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

describe("AppTitlebar", () => {
  let container: HTMLDivElement
  let root: Root
  const originalMatchMedia = window.matchMedia

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    window.localStorage.clear()
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: originalMatchMedia,
    })
  })

  const useDesktopMenuMode = () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: vi.fn(
        (query: string) =>
          ({
            matches: query.includes("pointer: fine"),
            media: query,
            onchange: null,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            addListener: vi.fn(),
            removeListener: vi.fn(),
            dispatchEvent: vi.fn(),
          }) satisfies MediaQueryList
      ),
    })
  }

  it("groups file state with identity and keeps preferences in More", () => {
    act(() => {
      root.render(
        <I18nProvider initialLocale="en">
          <AppTitlebar
            fileOpen
            fileName="projects.eidos"
            tableName="Projects"
            opening={false}
            statusLabel="Unsaved changes"
            statusTone="warning"
            StatusIcon={Check}
            needsPermission
            permissionActionLabel="Locate original file"
            canSave
            saveLabel="Save"
            theme="light"
            onNew={vi.fn()}
            onOpen={vi.fn()}
            onOpenSample={vi.fn()}
            onOpenTemplate={vi.fn()}
            onSave={vi.fn()}
            onDownload={vi.fn()}
            onReauthorize={vi.fn()}
            onThemeChange={vi.fn()}
          />
        </I18nProvider>
      )
    })

    const identity = container.querySelector(".file-identity")
    expect(identity?.querySelector('[role="status"]')?.textContent).toBe(
      "Unsaved changes"
    )
    expect(container.querySelector('.title-actions [role="status"]')).toBeNull()
    expect(
      container.querySelector('button[aria-label="Locate original file"]')
    ).not.toBeNull()

    const more = container.querySelector<HTMLButtonElement>(
      'button[aria-label="More"]'
    )
    act(() => more?.click())

    const moreItems = Array.from(
      container.querySelectorAll<HTMLButtonElement>(
        '.title-actions [role="menuitem"], .title-actions [role="menuitemradio"]'
      )
    )
    expect(moreItems.map((item) => item.textContent?.trim())).toEqual([
      "Open Format",
      "SQLite Inspector",
      "Version Control",
      "English",
      "简体中文",
    ])

    const languageOptions = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')
    )
    expect(languageOptions.map((option) => option.textContent?.trim())).toEqual(
      ["English", "简体中文"]
    )
    expect(languageOptions[0]?.getAttribute("aria-checked")).toBe("true")

    act(() => languageOptions[1]?.click())

    expect(document.documentElement.lang).toBe("zh-CN")
    expect(container.querySelector('button[aria-label="更多"]')).not.toBeNull()
  })

  it("keeps templates behind a stable File-menu entry", () => {
    act(() => {
      root.render(
        <I18nProvider initialLocale="en">
          <AppTitlebar
            fileOpen
            fileName="projects.eidos"
            tableName="Projects"
            opening={false}
            canSave
            saveLabel="Save"
            theme="light"
            onNew={vi.fn()}
            onOpen={vi.fn()}
            onOpenSample={vi.fn()}
            onOpenTemplate={vi.fn()}
            onSave={vi.fn()}
            onDownload={vi.fn()}
            onReauthorize={vi.fn()}
            onThemeChange={vi.fn()}
          />
        </I18nProvider>
      )
    })

    const fileTrigger = container.querySelector<HTMLButtonElement>(
      ".title-file-menu .app-menu-trigger"
    )
    act(() => fileTrigger?.click())

    const rootItems = Array.from(
      container.querySelectorAll<HTMLButtonElement>(
        '.title-file-menu [role="menuitem"]'
      )
    )
    expect(rootItems.map((item) => item.textContent?.trim())).toEqual([
      "New blank Eidos File",
      "New from template…",
      "Open .eidos file⌘O",
      "Open sample Eidos File",
      "Save⌘S",
      "Download a copy⇧⌘S",
    ])
    expect(container.textContent).not.toContain("Personal CRM")
    expect(container.querySelector(".app-menu-check")).toBeNull()

    const templateEntry = rootItems.find((item) =>
      item.textContent?.includes("New from template")
    )
    act(() => templateEntry?.click())

    expect(container.textContent).toContain("Back to File")
    expect(container.textContent).toContain("Personal CRM")
    expect(
      container.querySelectorAll('.title-file-menu [role="menuitem"]')
    ).toHaveLength(9)
  })

  it("keeps the parent menu visible beside a desktop submenu", () => {
    useDesktopMenuMode()
    act(() => {
      root.render(
        <I18nProvider initialLocale="en">
          <AppTitlebar
            fileOpen
            fileName="projects.eidos"
            tableName="Projects"
            opening={false}
            canSave
            saveLabel="Save"
            theme="light"
            onNew={vi.fn()}
            onOpen={vi.fn()}
            onOpenSample={vi.fn()}
            onOpenTemplate={vi.fn()}
            onSave={vi.fn()}
            onDownload={vi.fn()}
            onReauthorize={vi.fn()}
            onThemeChange={vi.fn()}
          />
        </I18nProvider>
      )
    })

    const fileTrigger = container.querySelector<HTMLButtonElement>(
      ".title-file-menu .app-menu-trigger"
    )
    act(() => fileTrigger?.click())
    const rootMenu = container.querySelector<HTMLElement>(
      '[role="menu"][aria-label="File"]'
    )
    const templateEntry = Array.from(
      rootMenu?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []
    ).find((item) => item.textContent?.includes("New from template"))
    act(() => templateEntry?.click())

    const flyout = container.querySelector<HTMLElement>(
      '[role="menu"][aria-label="New from template…"]'
    )
    expect(rootMenu?.textContent).toContain("Open .eidos file")
    expect(rootMenu?.textContent).not.toContain("Personal CRM")
    expect(flyout?.textContent).toContain("Personal CRM")
    expect(container.textContent).not.toContain("Back to File")
    expect(templateEntry?.getAttribute("aria-expanded")).toBe("true")
  })

  it("opens recent files from a compact submenu and can clear the list", () => {
    const onOpenRecent = vi.fn()
    const onClearRecentFiles = vi.fn()
    act(() => {
      root.render(
        <I18nProvider initialLocale="en">
          <AppTitlebar
            fileOpen
            fileName="projects.eidos"
            tableName="Projects"
            opening={false}
            canSave
            saveLabel="Save"
            recentFiles={[
              {
                id: "projects",
                fileName: "projects.eidos",
                hasUnsavedRecovery: true,
              },
              {
                id: "research",
                fileName: "research.eidos",
                hasUnsavedRecovery: false,
              },
            ]}
            theme="light"
            onNew={vi.fn()}
            onOpen={vi.fn()}
            onOpenSample={vi.fn()}
            onOpenTemplate={vi.fn()}
            onOpenRecent={onOpenRecent}
            onClearRecentFiles={onClearRecentFiles}
            onSave={vi.fn()}
            onDownload={vi.fn()}
            onReauthorize={vi.fn()}
            onThemeChange={vi.fn()}
          />
        </I18nProvider>
      )
    })

    const fileTrigger = container.querySelector<HTMLButtonElement>(
      ".title-file-menu .app-menu-trigger"
    )
    act(() => fileTrigger?.click())
    const recentEntry = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
    ).find((item) => item.textContent?.includes("Recent files"))
    act(() => recentEntry?.click())

    expect(container.textContent).toContain("projects.eidos")
    expect(container.textContent).toContain("Unsaved")
    expect(container.textContent).toContain("research.eidos")

    const projectEntry = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
    ).find((item) => item.textContent?.includes("projects.eidos"))
    act(() => projectEntry?.click())
    expect(onOpenRecent).toHaveBeenCalledWith("projects")

    act(() => fileTrigger?.click())
    const recentEntryAgain = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
    ).find((item) => item.textContent?.includes("Recent files"))
    act(() => recentEntryAgain?.click())
    const clearEntry = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
    ).find((item) => item.textContent?.includes("Clear recent files"))
    act(() => clearEntry?.click())
    expect(onClearRecentFiles).toHaveBeenCalledOnce()
  })
})
