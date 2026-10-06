import { expect, it } from "vitest"
import { renderPluginReadme, showPluginReadme } from "./readme"
import type { NativeRequest } from "./host"
import { setMobileLocale } from "./locale"

it("renders sanitized markdown with branch-aware images and repository links", () => {
  const article = renderPluginReadme({
    baseUrl: "https://raw.githubusercontent.com/eidos-space/demo/master/",
    markdown:
      '# Demo\n\n![Preview](./assets/preview.png)\n\n[Guide](docs/guide.md)\n\n<script>alert(1)</script>\n<img src="x" onerror="alert(1)">\n\n[Bad](javascript:alert(1))',
  })
  expect(article.querySelector("h1")?.textContent).toBe("Demo")
  expect(article.querySelector("img")?.src).toBe(
    "https://raw.githubusercontent.com/eidos-space/demo/master/assets/preview.png"
  )
  expect(article.querySelector("a")?.href).toBe(
    "https://github.com/eidos-space/demo/blob/master/docs/guide.md"
  )
  expect(
    article.querySelector("script, [onerror], [href^='javascript:']")
  ).toBeNull()
})

it("shows a retryable failure and then cached content", async () => {
  setMobileLocale("zh")
  const root = document.createElement("div")
  let attempts = 0
  const native: NativeRequest = async <T>() => {
    if (++attempts === 1) throw new Error("Offline")
    return {
      markdown: "# Cached",
      baseUrl: "https://raw.githubusercontent.com/a/b/main/",
      cached: true,
    } as T
  }
  await showPluginReadme(root, native, "test.plugin")
  expect(root.textContent).toContain("说明加载失败")
  root.querySelector("button")!.click()
  await Promise.resolve()
  expect(root.textContent).toContain("Cached")
  expect(root.textContent).toContain("已缓存")
})

it("shows an explicit empty state for a plugin without marketplace documentation", async () => {
  const root = document.createElement("div")
  await showPluginReadme(root, async <T>() => null as T, "test.local")
  expect(root.textContent).toContain("暂未提供 README")
})
