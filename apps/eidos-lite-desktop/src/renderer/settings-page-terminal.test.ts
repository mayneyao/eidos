// @vitest-environment jsdom

import { act, createElement } from "react"
import { createRoot } from "react-dom/client"

import type { EidosLiteApi, EidosLitePreferences } from "../shared/contracts"
import { DEFAULT_RENDERER_PREFERENCES } from "./app-appearance"
import { SettingsPage } from "./settings-page"

it("keeps plugin and Terminal management out of the Settings window", async () => {
  window.history.replaceState(null, "", "#/settings/preferences")
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  let preferences: EidosLitePreferences = {
    ...DEFAULT_RENDERER_PREFERENCES,
    builtInPlugins: { terminal: true },
  }
  const updatePreferences = vi.fn(
    async (patch: Partial<EidosLitePreferences>) => {
      preferences = { ...preferences, ...patch }
      return preferences
    }
  )
  Object.assign(window, {
    eidosLite: {
      getAppInfo: vi.fn(async () => ({
        name: "Eidos Lite",
        version: "0.2.2",
        platform: "darwin",
        architecture: "arm64",
        services: { name: "staging" },
      })),
      getPreferences: vi.fn(async () => preferences),
      updatePreferences,
      onPreferencesChanged: vi.fn(() => () => {}),
      getSyncPasswordSettings: vi.fn(async () => ({
        available: true,
        configured: false,
      })),
      listTerminalShells: vi.fn(async () => [
        { executable: "/bin/zsh", name: "Zsh", systemDefault: true },
        { executable: "/bin/bash", name: "Bash", systemDefault: false },
      ]),
      getUpdateStatus: vi.fn(async () => ({
        state: "unavailable",
        currentVersion: "0.2.2",
      })),
      onUpdateStatusChanged: vi.fn(() => () => {}),
    } as unknown as EidosLiteApi,
  })

  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(createElement(SettingsPage))
    await Promise.resolve()
    await Promise.resolve()
  })

  const filesPage = [
    ...host.querySelectorAll<HTMLButtonElement>("nav button"),
  ].find((button) => button.textContent === "Files")
  await act(async () => filesPage?.click())
  expect(
    host.querySelector<HTMLElement>('[aria-labelledby="settings-files"]')
      ?.hidden
  ).toBe(false)

  const markdownSelect = host.querySelector<HTMLSelectElement>(
    "[data-markdown-file-editing-mode-select]"
  )
  expect(markdownSelect).not.toBeNull()
  expect(
    markdownSelect?.closest("section")?.getAttribute("aria-labelledby")
  ).toBe("settings-files")

  const htmlSelect = host.querySelector<HTMLSelectElement>(
    "[data-html-file-open-mode-select]"
  )
  expect(htmlSelect).not.toBeNull()
  await act(async () => {
    if (htmlSelect) {
      htmlSelect.value = "source"
      htmlSelect.dispatchEvent(new Event("change", { bubbles: true }))
    }
    await Promise.resolve()
  })
  expect(updatePreferences).toHaveBeenCalledWith({ htmlFileOpenMode: "source" })
  expect(host.textContent).toContain(
    "Choose the default editor for .md and .markdown files."
  )
  expect(host.textContent).not.toContain("Content fields")

  await act(async () => {
    if (markdownSelect) {
      markdownSelect.value = "wysiwyg"
      markdownSelect.dispatchEvent(new Event("change", { bubbles: true }))
    }
    await Promise.resolve()
  })
  expect(updatePreferences).toHaveBeenCalledWith({
    markdownFileEditingMode: "wysiwyg",
  })

  const obsidianProfile = host.querySelector<HTMLButtonElement>(
    'button[data-markdown-compatibility-profile="obsidian"]'
  )
  expect(obsidianProfile).toBeNull()
  expect(host.querySelector("[data-markdown-compatibility-profile]")).toBeNull()

  expect(
    [...host.querySelectorAll("nav button")].some(
      (button) => button.textContent === "Plugins"
    )
  ).toBe(false)
  await act(async () => {
    window.location.hash = "#/settings/plugins"
    window.dispatchEvent(new HashChangeEvent("hashchange"))
  })
  expect(host.querySelector("[data-terminal-layout]")).toBeNull()
  expect(host.querySelector(".plugin-list-entry")).toBeNull()
  expect(host.querySelector('[data-settings-page="preferences"]')).toBeTruthy()
  expect(host.querySelector('[data-settings-page="plugins"]')).toBeNull()
  await act(async () => root.unmount())
  host.remove()
})
