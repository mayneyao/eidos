// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest"
import { applyPluginHostTheme } from "./plugin-host-theme"

afterEach(() => {
  document.documentElement.removeAttribute("style")
  vi.unstubAllGlobals()
})

it("applies packaged host tokens for each appearance and restores defaults", () => {
  vi.stubGlobal("CSS", { supports: () => true })
  const root = document.documentElement
  const theme = {
    light: {
      "--theme-surface": "#fffaf5",
      "--font-ui": "Paper UI, system-ui",
      "--control-radius": "8px",
    },
    dark: {
      "--theme-surface": "#211d1b",
      "--font-ui": "Paper UI, system-ui",
      "--control-radius": "8px",
    },
  }
  const removeLight = applyPluginHostTheme(root, theme, "light")
  expect(root.style.getPropertyValue("--theme-surface")).toBe("#fffaf5")
  expect(root.style.getPropertyValue("--font-ui")).toBe("Paper UI, system-ui")
  removeLight()
  const removeDark = applyPluginHostTheme(root, theme, "dark")
  expect(root.style.getPropertyValue("--theme-surface")).toBe("#211d1b")
  expect(root.style.getPropertyValue("--control-radius")).toBe("8px")
  removeDark()
  expect(root.style.getPropertyValue("--theme-surface")).toBe("")
  expect(root.style.getPropertyValue("--font-ui")).toBe("")
})
