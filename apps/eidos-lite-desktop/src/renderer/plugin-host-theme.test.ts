// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest"
import { applyPluginHostTheme } from "./plugin-host-theme"

afterEach(() => {
  delete document.documentElement.dataset.theme
  document.head
    .querySelectorAll("style[data-eidos-plugin-theme]")
    .forEach((style) => style.remove())
})

it("mounts a CSS theme and restores defaults when cleared", () => {
  const root = document.documentElement
  const stylesheet =
    ':root[data-theme="light"] { --theme-surface: #fffaf5; }\n' +
    ':root[data-theme="dark"] { --theme-surface: #211d1b; }'
  const remove = applyPluginHostTheme(root, { stylesheet })
  const style = document.head.querySelector("style[data-eidos-plugin-theme]")
  expect(style?.textContent).toBe(stylesheet)
  root.dataset.theme = "dark"
  expect(style?.textContent).toContain(':root[data-theme="dark"]')
  remove()
  expect(
    document.head.querySelector("style[data-eidos-plugin-theme]")
  ).toBeNull()
})
