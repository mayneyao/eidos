// @vitest-environment jsdom

import { act, createElement } from "react"
import { createRoot } from "react-dom/client"

import type { EidosLiteApi, EidosLitePreferences } from "../shared/contracts"
import { DEFAULT_RENDERER_PREFERENCES } from "./app-appearance"
import { SettingsPage } from "./settings-page"

it("saves the Terminal workspace layout and shell preferences", async () => {
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

  const wysiwygEditor = host.querySelector<HTMLButtonElement>(
    'button[data-markdown-file-editing-mode="wysiwyg"]'
  )
  const filesPage = [
    ...host.querySelectorAll<HTMLButtonElement>("nav button"),
  ].find((button) => button.textContent === "Files")
  await act(async () => filesPage?.click())
  expect(
    host.querySelector<HTMLElement>('[aria-labelledby="settings-files"]')
      ?.hidden
  ).toBe(false)
  expect(
    wysiwygEditor?.closest("section")?.getAttribute("aria-labelledby")
  ).toBe("settings-files")
  const htmlSource = host.querySelector<HTMLButtonElement>(
    '[data-html-file-open-mode="source"]'
  )
  await act(async () => {
    htmlSource?.click()
    await Promise.resolve()
  })
  expect(updatePreferences).toHaveBeenCalledWith({ htmlFileOpenMode: "source" })
  expect(host.textContent).toContain(
    "Choose the default editor for .md and .markdown files."
  )
  expect(host.textContent).not.toContain("Content fields")
  expect(wysiwygEditor?.getAttribute("aria-checked")).toBe("false")
  await act(async () => {
    wysiwygEditor?.click()
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

  const pluginsPage = [
    ...host.querySelectorAll<HTMLButtonElement>("nav button"),
  ].find((button) => button.textContent === "Built-in Plugins")
  await act(async () => pluginsPage?.click())
  expect(window.location.hash).toBe("#/settings/plugins")

  const terminalSide = host.querySelector<HTMLButtonElement>(
    'button[data-terminal-layout="side"]'
  )
  expect(
    host.querySelector<HTMLElement>(
      "[data-terminal-layout] > .settings-segmented-control"
    )?.dataset.segmentCount
  ).toBe("2")
  expect(
    host.querySelectorAll<HTMLButtonElement>("button[data-terminal-layout]")
  ).toHaveLength(2)
  expect(
    host.querySelector<HTMLButtonElement>(
      'button[data-terminal-layout="right"]'
    )
  ).toBeNull()
  expect(
    host.querySelector<HTMLButtonElement>('button[data-terminal-layout="main"]')
  ).toBeNull()
  expect(terminalSide?.disabled).toBe(false)
  await act(async () => {
    terminalSide?.click()
    await Promise.resolve()
  })
  expect(updatePreferences).toHaveBeenCalledWith({
    terminalLayout: "side",
  })

  const select = host.querySelector<HTMLSelectElement>(
    'select[aria-label="Default shell"]'
  )
  expect(
    [...(select?.options ?? [])].map((option) => option.textContent)
  ).toEqual(["System default — Zsh", "Zsh — /bin/zsh", "Bash — /bin/bash"])

  await act(async () => {
    if (!select) return
    select.value = "/bin/bash"
    select.dispatchEvent(new Event("change", { bubbles: true }))
    await Promise.resolve()
  })
  expect(updatePreferences).toHaveBeenCalledWith({
    terminalShell: "/bin/bash",
  })

  const terminalSwitch = host.querySelector<HTMLButtonElement>(
    '[data-built-in-plugin="terminal"] button[role="switch"]'
  )
  await act(async () => {
    terminalSwitch?.click()
    await Promise.resolve()
  })
  expect(terminalSide?.disabled).toBe(true)
  expect(select?.disabled).toBe(true)

  await act(async () => root.unmount())
  const restoredRoot = createRoot(host)
  await act(async () => restoredRoot.render(createElement(SettingsPage)))
  expect(host.querySelector('[data-settings-page="plugins"]')).toBeTruthy()
  const back = new Promise<void>((resolve) =>
    window.addEventListener("popstate", () => resolve(), { once: true })
  )
  await act(async () => {
    window.history.back()
    await back
  })
  expect(host.querySelector('[data-settings-page="files"]')).toBeTruthy()
  await act(async () => restoredRoot.unmount())
  host.remove()
})
