// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { EidosLitePreferences } from "../shared/contracts"
import { DEFAULT_RENDERER_PREFERENCES } from "./app-appearance"
import { TerminalPluginDetails } from "./terminal-plugin-details"

it("enables the built-in Terminal and saves its layout and shell", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  let preferences = {
    ...DEFAULT_RENDERER_PREFERENCES,
    builtInPlugins: { terminal: false },
  }
  const updatePreferences = vi.fn(
    async (patch: Partial<EidosLitePreferences>) =>
      (preferences = { ...preferences, ...patch })
  )
  Object.assign(window, {
    eidosLite: {
      getPreferences: async () => preferences,
      onPreferencesChanged: () => () => {},
      listTerminalShells: async () => [
        { executable: "/bin/zsh", name: "Zsh", systemDefault: true },
      ],
      updatePreferences,
    },
  })
  const host = document.createElement("div")
  const root = createRoot(host)
  await act(async () => {
    root.render(<TerminalPluginDetails />)
  })
  await act(async () => {
    host.querySelector<HTMLButtonElement>('[role="switch"]')?.click()
  })
  expect(updatePreferences).toHaveBeenCalledWith({
    builtInPlugins: { terminal: true },
  })
  await act(async () => {
    host
      .querySelector<HTMLButtonElement>('[data-terminal-layout="side"]')
      ?.click()
  })
  expect(updatePreferences).toHaveBeenCalledWith({ terminalLayout: "side" })
  await act(async () => {
    const select = host.querySelector<HTMLSelectElement>("select")!
    select.value = "/bin/zsh"
    select.dispatchEvent(new Event("change", { bubbles: true }))
  })
  expect(updatePreferences).toHaveBeenCalledWith({ terminalShell: "/bin/zsh" })
  await act(async () => root.unmount())
})
