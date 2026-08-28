// @vitest-environment jsdom

import { act, createElement } from "react"
import { createRoot } from "react-dom/client"

import type { EidosLiteApi, EidosLitePreferences } from "../shared/contracts"
import { DEFAULT_RENDERER_PREFERENCES } from "./app-appearance"
import { SettingsPage } from "./settings-page"

it("lists installed shells and saves the shell selected for new terminals", async () => {
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

  const pluginsPage = [
    ...host.querySelectorAll<HTMLButtonElement>("nav button"),
  ].find((button) => button.textContent === "Built-in Plugins")
  await act(async () => pluginsPage?.click())

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

  await act(async () => root.unmount())
  host.remove()
})
