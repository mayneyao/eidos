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

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    window.localStorage.clear()
  })

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
      container.querySelector('button[aria-label="Grant write access"]')
    ).not.toBeNull()

    const more = container.querySelector<HTMLButtonElement>(
      'button[aria-label="More"]'
    )
    act(() => more?.click())

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
      "Open .eidos file⌘O",
      "Open sample Eidos File",
      "New from template…",
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
})
