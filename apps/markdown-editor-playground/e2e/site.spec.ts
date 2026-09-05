import { expect, test } from "@playwright/test"
import { syntaxExamples } from "../src/site/syntax-catalog"

test("home example uses a real editor and preserves drafts while viewing code", async ({
  page,
}) => {
  await page.goto("/")
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "A writing surface"
  )
  const editor = page.getByRole("textbox", { name: "Try the Markdown editor" })
  await editor.fill("A local draft")
  await expect(editor).toHaveText("A local draft")
  await page.getByRole("button", { name: "View code" }).click()
  await expect(page.getByLabel("Example React source")).toContainText(
    'from "@eidos.space/markdown"'
  )
  await page.getByRole("button", { name: "Hide code" }).click()
  await expect(editor).toHaveText("A local draft")
  await page.getByRole("button", { name: "Reset example" }).click()
  await expect(editor).toContainText("A little room to think")
  await page.getByRole("button", { name: "Undo reset" }).click()
  await expect(editor).toHaveText("A local draft")
  await page.getByRole("button", { name: "Read only", exact: true }).click()
  await expect(editor).toHaveAttribute("contenteditable", "false")
})

test("documentation deep links, topic search, and theme persist across routes", async ({
  page,
}) => {
  await page.goto("/docs/api")
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Markdown Editor Component API"
  )
  await page.getByRole("button", { name: "Switch to dark theme" }).click()
  await expect(page.locator(".site-frame")).toHaveAttribute(
    "data-theme",
    "dark"
  )
  await page.getByLabel("Find a topic").fill("clipboard")
  const results = page.getByRole("navigation", {
    name: "Documentation search results",
  })
  await expect(results.getByRole("link").first()).toBeVisible()
  await results.getByRole("link").first().click()
  await expect(page).toHaveURL(/#.+/u)
  await expect(page.locator(".site-frame")).toHaveAttribute(
    "data-theme",
    "dark"
  )
  await page.getByRole("link", { name: "Playground", exact: true }).click()
  await expect(
    page.getByRole("textbox", { name: "Markdown playground editor" })
  ).toBeVisible()
  await expect(page.locator(".eme-editor")).toHaveAttribute(
    "data-theme",
    "dark"
  )
})

test("narrow home layout stays within the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/")
  await expect(
    page.getByRole("textbox", { name: "Try the Markdown editor" })
  ).toBeVisible()
  expect(
    await page
      .locator(".site-frame")
      .evaluate((element) => element.scrollWidth <= element.clientWidth)
  ).toBe(true)
})

test("uses the approved SVG for the brand and favicon", async ({ page }) => {
  await page.goto("/")
  const logo = page.locator(".site-brand img")
  await expect(logo).toBeVisible()
  await expect
    .poll(() => logo.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0)
  const source = await logo.getAttribute("src")
  expect(source).toMatch(/markdown-logo.*\.svg/u)
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    "href",
    source!
  )
  const response = await page.request.get(source!)
  expect(response.ok()).toBe(true)
  const svg = await response.text()
  expect(svg).toContain("Eidos Markdown")
  expect(svg).toContain("106 150H118")
  expect(svg).toContain("rotate(120 256 256)")
  expect(svg).toContain("rotate(240 256 256)")
})

test("language switches preserve the live draft and support browser history", async ({
  page,
}) => {
  await page.goto("/")
  await page
    .getByRole("textbox", { name: "Try the Markdown editor" })
    .fill("未保存的草稿")
  await page.getByRole("button", { name: "切换到中文", exact: true }).click()
  await expect(page).toHaveURL(/\/zh$/u)
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN")
  await expect(
    page.getByRole("textbox", { name: "试用 Markdown 编辑器" })
  ).toHaveText("未保存的草稿")
  await expect(page.getByRole("heading", { level: 1 }).first()).toContainText(
    "自在书写"
  )
  await page.goBack()
  await expect(page.locator("html")).toHaveAttribute("lang", "en")
  await expect(
    page.getByRole("textbox", { name: "Try the Markdown editor" })
  ).toHaveText("未保存的草稿")
  await page.goForward()
  await page.getByRole("button", { name: "重置示例" }).click()
  await expect(
    page.getByRole("textbox", { name: "试用 Markdown 编辑器" })
  ).toContainText("给思考一点空间")
  await page.getByRole("button", { name: "撤销重置" }).click()
  await expect(
    page.getByRole("textbox", { name: "试用 Markdown 编辑器" })
  ).toHaveText("未保存的草稿")
})

test("Chinese documentation has localized bodies, search and stable direct routes", async ({
  page,
}) => {
  for (const route of [
    "",
    "/api",
    "/guide",
    "/plugins",
    "/specs",
    "/specification",
    "/compatibility",
    "/presets",
    "/architecture",
    "/roadmap",
  ]) {
    await page.goto(`/zh/docs${route}`)
    await expect(page.locator(".site-prose")).toBeVisible()
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN")
    expect(await page.locator(".site-prose").innerText()).toMatch(
      /[\u4e00-\u9fff]/u
    )
  }
  await page.goto("/zh/docs/api")
  await page.reload()
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Markdown 编辑器 API 导读"
  )
  await page.getByLabel("搜索主题").fill("图片")
  const results = page.getByRole("navigation", { name: "文档搜索结果" })
  await expect(results.getByRole("link").first()).toHaveAttribute(
    "href",
    /^\/zh\/docs/u
  )
  await results.getByRole("link").first().click()
  await expect(page).toHaveURL(/\/zh\/docs.*#/u)
  await expect(page.locator(".site-translation-note")).toContainText(
    "非英文参考的逐条译本"
  )
})

test("playground switches real presets without replacing the draft", async ({
  page,
}) => {
  await page.goto("/playground?preset=gfm")
  await expect(
    page
      .locator(".eme-editor")
      .getByRole("link", { name: "www.example.com", exact: true })
  ).toBeVisible()
  await expect(
    page
      .locator(".eme-editor")
      .getByRole("link", { name: "hello@example.com", exact: true })
  ).toHaveAttribute("href", "mailto:hello@example.com")
  await expect(
    page.locator('[data-markdown-profile="markdown.gfm"]')
  ).toBeVisible()
  await expect(page.locator(".eme-editor .katex")).toHaveCount(0)
  await page.getByRole("button", { name: "View source", exact: true }).click()
  const source = page.getByLabel("Markdown source", { exact: true })
  const draft = "# Draft\n\nAn $x^2$ and [[Note]].\n\n- [ ] Keep me"
  await source.fill(draft)
  await page.getByLabel("Preset", { exact: true }).selectOption("obsidian")
  await expect(source).toHaveValue(draft)
  await page.getByRole("button", { name: "View editor", exact: true }).click()
  await expect(
    page.locator('[data-markdown-profile="obsidian.markdown"]')
  ).toBeVisible()
  await expect(page.locator(".eme-editor .katex")).toHaveCount(1)
  await page.getByLabel("Preset", { exact: true }).selectOption("gfm")
  await expect(page.locator(".eme-editor .katex")).toHaveCount(0)
  await page.getByRole("button", { name: "View source", exact: true }).click()
  await expect(source).toHaveValue(draft)
  await page.getByRole("button", { name: "Load preset example" }).click()
  await expect(source).toHaveValue(/GitHub Flavored Markdown/u)
  await page.getByRole("button", { name: "Restore previous draft" }).click()
  await expect(source).toHaveValue(draft)
})

test("syntax lab lists all families and compares real preset output", async ({
  page,
}) => {
  await page.goto("/spec?preset=gfm#inline-math")
  const source = page.getByLabel("Example Markdown source")
  const examples = page.locator(".site-syntax-list button[data-syntax-id]")
  await expect(examples).toHaveCount(syntaxExamples.length)
  expect(
    await examples.evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute("data-syntax-id"))
    )
  ).toEqual(syntaxExamples.map((example) => example.id))
  await expect(page.locator(".eme-editor .katex")).toHaveCount(0)
  await source.fill("An $x^2$.")
  await page.getByText("Preview settings", { exact: true }).click()
  await page.getByLabel("Preset", { exact: true }).selectOption("eidos")
  await expect(page.locator(".eme-editor .katex")).toHaveCount(1)
  await expect(source).toHaveValue("An $x^2$.")
  await page.getByRole("button", { name: /Tables, alignment/u }).click()
  await expect(page.locator(".eme-editor table")).toBeVisible()
  await page.getByRole("button", { name: /Inline equations/u }).click()
  await expect(source).toHaveValue("An $x^2$.")
  await page.getByLabel("Find syntax").fill("nonexistent syntax")
  await expect(page.getByText("No matching syntax.")).toBeVisible()
})

test("syntax examples prioritize foundations, retain drafts and omit unsupported dialects", async ({
  page,
}) => {
  await page.goto("/spec#inline-math")
  await expect(page.locator(".eme-editor .katex")).toHaveCount(1)
  await expect(page.locator(".site-syntax-explanation")).not.toBeEmpty()
  await expect(
    page.getByRole("list", { name: "Available presets" })
  ).toContainText("Eidos")
  await page.locator('[data-syntax-id="table"]').click()
  const source = page.getByLabel("Example Markdown source")
  const singleColumn = "| Custom |\n| --- |\n| Preserved |"
  await source.fill(singleColumn)
  await expect(page.locator(".eme-editor table tr")).toHaveCount(2)
  await expect(page.locator(".eme-editor table")).toContainText("Preserved")
  const topics = page.locator(".site-syntax-list")
  const left = await topics.boundingBox()
  const right = await page.locator(".site-syntax-detail").boundingBox()
  expect(right!.x).toBeGreaterThanOrEqual(left!.x + left!.width)
  expect(
    await topics.evaluate(
      (el) =>
        el.scrollHeight === el.clientHeight && el.scrollWidth === el.clientWidth
    )
  ).toBe(true)
  await page.evaluate(() => window.scrollTo(0, 700))
  await expect
    .poll(async () =>
      Math.round((await page.locator(".site-syntax-detail").boundingBox())!.y)
    )
    .toBe(20)
  await expect(page.locator('[data-syntax-id="mdx-component"]')).toHaveCount(0)
  await expect(page.locator('[data-syntax-id="definition-list"]')).toHaveCount(
    0
  )
  await page.locator('[data-syntax-id="paragraph"]').click()
  await expect(page.locator(".eme-editor")).toHaveCount(1)
  await page.locator('[data-syntax-id="table"]').click()
  await expect(source).toHaveValue(singleColumn)
  await page.screenshot({ path: "/tmp/markdown-syntax-examples.png" })
  await page.goto("/zh/spec#paragraph")
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole("navigation", { name: "语法主题" })).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "CommonMark · 基础语法", exact: true })
  ).toBeVisible()
  expect(
    await page
      .locator(".site-frame")
      .evaluate((el) => el.scrollWidth <= el.clientWidth)
  ).toBe(true)
})

test("preset docs replace compatibility navigation and share the site shell", async ({
  page,
}) => {
  await page.goto("/docs/presets")
  await expect(
    page.getByRole("heading", { name: "Presets", exact: true })
  ).toBeVisible()
  await expect(
    page
      .getByRole("navigation", { name: "Documentation" })
      .getByRole("link", { name: "Obsidian compatibility" })
  ).toHaveCount(0)
  await page.goto("/playground")
  await expect(page.locator(".site-header .site-brand")).toBeVisible()
  const colors = await page
    .locator(".playground-shell")
    .evaluate((element) => ({
      shell: getComputedStyle(element).backgroundColor,
      site: getComputedStyle(element.closest(".site-frame")!).backgroundColor,
    }))
  expect(colors.shell).toBe(colors.site)
})

test("Chinese syntax lab and preset controls fit mobile in both themes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  for (const path of [
    "/zh/spec?preset=gfm",
    "/zh/playground?preset=obsidian",
  ]) {
    await page.goto(path)
    if (path.includes("/spec"))
      await page.getByText("预览设置", { exact: true }).click()
    await expect(page.getByLabel("预设", { exact: true })).toBeVisible()
    for (let i = 0; i < 2; i++) {
      expect(
        await page
          .locator(".site-frame")
          .evaluate((element) => element.scrollWidth <= element.clientWidth)
      ).toBe(true)
      await page.getByRole("button", { name: /切换到.*主题/u }).click()
    }
  }
})

test("Chinese playground translates controls and shortcuts without discarding source drafts", async ({
  page,
}) => {
  await page.goto("/zh/playground")
  await page.getByRole("button", { name: "快捷键", exact: true }).click()
  await expect(page.getByRole("dialog")).toContainText(
    "切换当前任务列表项的勾选状态"
  )
  await page.getByRole("button", { name: "关闭快捷键说明" }).click()
  await page.getByRole("button", { name: "查看源码", exact: true }).click()
  await page
    .getByRole("textbox", { name: "Markdown 源码", exact: true })
    .fill("# 中文草稿")
  await page
    .getByRole("button", { name: "Switch to English", exact: true })
    .click()
  await expect(
    page.getByRole("textbox", { name: "Markdown source", exact: true })
  ).toHaveValue("# 中文草稿")
  await page.getByRole("button", { name: "切换到中文", exact: true }).click()
  await page.getByRole("button", { name: "返回编辑器" }).click()
  const editor = page.getByRole("textbox", {
    name: "Markdown 交互体验编辑器",
    exact: true,
  })
  await editor.fill("")
  await editor.press("/")
  await expect(page.getByPlaceholder("筛选内容块…")).toBeVisible()
  await expect(page.getByRole("option", { name: /块级公式/u })).toBeVisible()
})

test("Chinese pages fit a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  for (const route of ["/zh", "/zh/docs/plugins", "/zh/playground"]) {
    await page.goto(route)
    await expect(
      page.getByRole("button", { name: "Switch to English", exact: true })
    ).toBeVisible()
    expect(
      await page
        .locator(".site-frame")
        .evaluate((element) => element.scrollWidth <= element.clientWidth)
    ).toBe(true)
  }
})
