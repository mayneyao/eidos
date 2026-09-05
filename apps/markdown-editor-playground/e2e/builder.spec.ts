import { test, expect, type Page } from "@playwright/test"
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

async function configuration(page: Page, action: () => Promise<unknown>) {
  const selector = page.locator(".builder-selector")
  if (
    !(await selector.evaluate(
      (element) => (element as HTMLDetailsElement).open
    ))
  )
    await selector.locator("summary").click()
  await action()
  await selector.locator("summary").click()
}
async function choose(page: Page, label: string, checked: boolean) {
  await configuration(page, () =>
    page.getByRole("checkbox", { name: label, exact: true }).setChecked(checked)
  )
}

test("configuration opens above a two-column workbench without shifting it", async ({
  page,
}) => {
  await page.goto("/build")
  const preview = page.locator(".builder-preview")
  const code = page.locator(".builder-code")
  const before = (await preview.boundingBox())!
  expect((await code.boundingBox())!.x).toBeGreaterThanOrEqual(
    before.x + before.width
  )
  const selector = page.locator(".builder-selector")
  await expect(selector.locator("aside")).toBeHidden()
  await selector.locator("summary").click()
  await expect(selector.locator("aside")).toBeVisible()
  expect((await preview.boundingBox())!.y).toBe(before.y)
  await page.getByRole("checkbox", { name: "Tables", exact: true }).focus()
  await page.keyboard.press("Escape")
  await expect(selector.locator("aside")).toBeHidden()
  await expect(selector.locator("summary")).toBeFocused()
  await selector.locator("summary").click()
  await page.locator(".builder-intro h1").click()
  await expect(selector.locator("aside")).toBeHidden()
  await page.screenshot({
    path: "/tmp/markdown-builder-two-columns.png",
    fullPage: true,
  })
})

test("callout previews respect the selected grammar instead of silently enabling GFM", async ({
  page,
}) => {
  await page.goto("/build")
  await configuration(page, () =>
    page.getByLabel("Starting point", { exact: true }).selectOption("minimal")
  )
  await choose(page, "Callouts", true)
  const preview = page.getByRole("region", { name: "Live editor preview" })
  const toggle = preview.getByRole("button", {
    name: "Markdown source",
    exact: true,
  })
  const source = preview.getByRole("textbox", { name: "Markdown source" })
  const markdown = "> [!note] A callout\n> ~~Removed~~"
  await toggle.click()
  await source.fill(markdown)
  await toggle.click()
  const callout = preview.locator(".eme-obsidian-callout")
  await expect(callout).toBeVisible()
  await expect(callout.locator("del")).toHaveCount(0)
  await expect(callout).toContainText("~~Removed~~")
  await choose(page, "Strikethrough", true)
  await expect(callout.locator("del")).toHaveText("Removed")
  await choose(page, "Strikethrough", false)
  await expect(callout.locator("del")).toHaveCount(0)
  await toggle.click()
  await expect(source).toHaveValue(markdown)
})

test("Obsidian is an editable starting composition with declared dependencies", async ({
  page,
}) => {
  await page.goto("/build")
  await configuration(page, () =>
    page.getByLabel("Starting point", { exact: true }).selectOption("obsidian")
  )
  for (const label of ["Quotes", "Images", "Links"])
    await expect(page.getByLabel(label, { exact: true })).toBeDisabled()
  const preview = page.getByRole("region", { name: "Live editor preview" })
  const toggle = preview.getByRole("button", {
    name: "Markdown source",
    exact: true,
  })
  const source = preview.getByRole("textbox", { name: "Markdown source" })
  const markdown = "> [!note] A callout\n> Content\n\n[[Note]] and $x$"
  await toggle.click()
  await source.fill(markdown)
  await toggle.click()
  const editor = preview.locator('[contenteditable="true"]')
  await expect(editor.locator(".eme-obsidian-callout")).toBeVisible()
  await expect(editor.locator(".eme-obsidian-link")).toHaveText("Note")
  await choose(page, "Callouts", false)
  await expect(page.getByLabel("Quotes", { exact: true })).toBeEnabled()
  await expect(editor.locator(".eme-obsidian-callout")).toHaveCount(0)
  await expect(editor.locator(".katex")).toBeVisible()
  await toggle.click()
  await expect(source).toHaveValue(markdown)
})

test("Vault inline choices are independently enabled and preserve source when removed", async ({
  page,
}) => {
  await page.goto("/build")
  await configuration(page, () =>
    page.getByLabel("Starting point", { exact: true }).selectOption("minimal")
  )
  const preview = page.getByRole("region", { name: "Live editor preview" })
  const toggle = preview.getByRole("button", {
    name: "Markdown source",
    exact: true,
  })
  const source = preview.getByRole("textbox", { name: "Markdown source" })
  const editor = preview.locator('[contenteditable="true"]')
  const markdown = "![[Note]] #topic %%comment%% ^[note]\n\nText ^block"
  await toggle.click()
  await source.fill(markdown)
  await toggle.click()
  const choices = [
    ["Embeds", ".eme-obsidian-embed"],
    ["Tags", ".eme-obsidian-tag"],
    ["Comments", ".eme-obsidian-comment"],
    ["Inline footnotes", ".eme-obsidian-inline-footnote"],
    ["Block identifiers", ".eme-obsidian-block-id"],
  ] as const
  for (const [label, selector] of choices) {
    await choose(page, label, true)
    await expect(editor.locator(selector)).toHaveCount(1)
    for (const [other, otherSelector] of choices)
      if (other !== label)
        await expect(editor.locator(otherSelector)).toHaveCount(0)
    await choose(page, label, false)
    await expect(editor.locator(selector)).toHaveCount(0)
  }
  await toggle.click()
  await expect(source).toHaveValue(markdown)
})

test("Minimal exposes independent base syntax and explains task-list dependencies", async ({
  page,
}) => {
  await page.goto("/build")
  await configuration(page, () =>
    page.getByLabel("Starting point", { exact: true }).selectOption("minimal")
  )
  const preview = page.getByRole("region", { name: "Live editor preview" })
  const toggle = preview.getByRole("button", {
    name: "Markdown source",
    exact: true,
  })
  await toggle.click()
  const source = preview.getByRole("textbox", { name: "Markdown source" })
  await source.fill(
    "# Optional heading\n\n- [x] Optional task\n\n**Optional emphasis**"
  )
  await toggle.click()
  const editor = preview.locator('[contenteditable="true"]')
  await expect(editor).toBeVisible()
  await expect(editor.locator("h1, ul, strong")).toHaveCount(0)
  await choose(page, "Headings", true)
  await expect(
    preview.getByRole("heading", { name: "Optional heading" })
  ).toBeVisible()
  await expect(editor.locator("ul, strong")).toHaveCount(0)
  await choose(page, "Task lists", true)
  await expect(page.getByLabel("Lists", { exact: true })).toBeChecked()
  await expect(page.getByLabel("Lists", { exact: true })).toBeDisabled()
  await expect(
    page.getByText(
      "Task lists require Lists. Turn off Task lists before removing Lists.",
      { exact: true }
    )
  ).toBeAttached()
  await expect(preview.locator("li[aria-checked=true]")).toBeVisible()
  await choose(page, "Task lists", false)
  await choose(page, "Lists", false)
  await expect(preview.locator("ul")).toHaveCount(0)
  await toggle.click()
  await expect(source).toHaveValue(
    "# Optional heading\n\n- [x] Optional task\n\n**Optional emphasis**"
  )
})

test("wiki links compose with equations and can be disabled without losing source", async ({
  page,
}) => {
  await page.goto("/build")
  await configuration(page, () =>
    page.getByLabel("Starting point", { exact: true }).selectOption("minimal")
  )
  await choose(page, "Wiki links", true)
  await choose(page, "Equations", true)
  const preview = page.getByRole("region", { name: "Live editor preview" })
  const toggle = preview.getByRole("button", {
    name: "Markdown source",
    exact: true,
  })
  await toggle.click()
  const source = preview.getByRole("textbox", { name: "Markdown source" })
  await source.fill("[[Note]] and $x^2$")
  await toggle.click()
  const editor = preview.locator('[contenteditable="true"]')
  await expect(editor.locator(".eme-obsidian-link")).toHaveText("Note")
  await expect(editor.locator(".katex")).toBeVisible()
  await choose(page, "Wiki links", false)
  await expect(editor.locator(".eme-obsidian-link")).toHaveCount(0)
  await expect(editor.locator(".katex")).toBeVisible()
  await toggle.click()
  await expect(source).toHaveValue("[[Note]] and $x^2$")
})

test("legacy shared configurations preserve implicit base syntax", async ({
  page,
}) => {
  const legacy = { schemaVersion: 1, plugins: ["table"], toolbar: false }
  await page.goto(`/build?config=${encodeURIComponent(JSON.stringify(legacy))}`)
  await expect(page.getByLabel("Headings", { exact: true })).toBeChecked()
  await expect(page.getByLabel("Lists", { exact: true })).toBeChecked()
  await expect(page.getByLabel("Tables", { exact: true })).toBeChecked()
  await expect(page.getByLabel("Images", { exact: true })).not.toBeChecked()
  await expect(
    page.getByLabel("Formatting toolbar", { exact: true })
  ).not.toBeChecked()
  const preview = page.getByRole("region", { name: "Live editor preview" })
  const toggle = preview.getByRole("button", {
    name: "Markdown source",
    exact: true,
  })
  await toggle.click()
  await preview
    .getByRole("textbox", { name: "Markdown source" })
    .fill("# Preserved heading\n\n**Preserved emphasis**")
  await toggle.click()
  const editor = preview.locator('[contenteditable="true"]')
  await expect(
    editor.getByRole("heading", { name: "Preserved heading" })
  ).toBeVisible()
  await expect(editor.locator("strong")).toHaveText("Preserved emphasis")
})

test("interaction switches independently control menus and handles without changing source", async ({
  page,
}) => {
  await page.goto("/build")
  const preview = page.getByRole("region", { name: "Live editor preview" })
  const toggle = preview.getByRole("button", {
    name: "Markdown source",
    exact: true,
  })
  await toggle.click()
  await preview
    .getByRole("textbox", { name: "Markdown source" })
    .fill("Interaction test")
  await toggle.click()
  const paragraph = preview.getByText("Interaction test", { exact: true })
  await choose(page, "Formatting toolbar", false)
  await paragraph.click()
  await paragraph.hover()
  await expect(
    page.getByRole("button", { name: "Add block below", exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Drag block", exact: true })
  ).toBeVisible()
  await choose(page, "Block drag handles", false)
  await paragraph.click()
  await paragraph.hover()
  await expect(
    page.getByRole("button", { name: "Drag block", exact: true })
  ).toHaveCount(0)
  await page
    .getByRole("button", { name: "Add block below", exact: true })
    .click()
  await expect(
    page.getByRole("dialog", { name: "Insert block", exact: true })
  ).toBeVisible()
  await choose(page, "Insertion menus", false)
  await expect(
    page.getByRole("dialog", { name: "Insert block", exact: true })
  ).toHaveCount(0)
  await paragraph.click()
  await page.keyboard.type("/")
  await expect(page.locator(".eme-insert-menu")).toHaveCount(0)
  await expect(paragraph).toHaveCount(0)
  const editor = preview.locator('[contenteditable="true"]')
  await expect(editor).toContainText("/")
  expect((await editor.innerText()).replace("/", "")).toBe("Interaction test")
  await page.keyboard.press("Escape")
  await expect(editor.locator('[data-block-selected="true"]')).toHaveCount(1)
  await choose(page, "Block selection", false)
  await expect(editor.locator('[data-block-selected="true"]')).toHaveCount(0)
  await editor.locator("p").click()
  await page.keyboard.press("Escape")
  await expect(editor.locator('[data-block-selected="true"]')).toHaveCount(0)
  await page.keyboard.press("Shift+ArrowLeft")
  await expect
    .poll(() =>
      page.evaluate(() => window.getSelection()?.toString().length ?? 0)
    )
    .toBeGreaterThan(0)
  const code = page.getByRole("region", { name: "Generated integration code" })
  await code.getByRole("button", { name: "Editor.tsx", exact: true }).click()
  await expect(code.locator("pre")).toContainText('"insertMenu":false')
  await expect(code.locator("pre")).toContainText('"blockDrag":false')
})

test("optional OPFS adapter persists pasted images and resolves their source after remount", async ({
  page,
}) => {
  await page.goto("/build")
  await choose(page, "Local OPFS image storage", true)
  const preview = page.getByRole("region", { name: "Live editor preview" })
  const sourceToggle = preview.getByRole("button", {
    name: "Markdown source",
    exact: true,
  })
  await sourceToggle.click()
  const source = preview.getByRole("textbox", { name: "Markdown source" })
  await source.fill("Paste here.")
  await sourceToggle.click()
  const editor = preview.locator('[contenteditable="true"]').first()
  await editor.getByText("Paste here.", { exact: true }).click()
  await editor.evaluate((element) => {
    const bytes = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
      ),
      (character) => character.charCodeAt(0)
    )
    const data = new DataTransfer()
    data.items.add(
      new File([bytes], "builder-image.png", { type: "image/png" })
    )
    element.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: data,
      })
    )
  })
  await expect(preview.getByAltText("builder-image")).toHaveAttribute(
    "src",
    /^blob:/u
  )
  await sourceToggle.click()
  await expect(source).toHaveValue(
    /opfs:\/\/markdown-editor-playground\/images\//u
  )
  const markdown = await source.inputValue()
  expect(markdown).not.toContain("blob:")
  await page.reload()
  await sourceToggle.click()
  await source.fill(markdown)
  await sourceToggle.click()
  await expect(preview.getByAltText("builder-image")).toHaveAttribute(
    "src",
    /^blob:/u
  )
  await expect
    .poll(() =>
      preview
        .getByAltText("builder-image")
        .evaluate((image) => (image as HTMLImageElement).naturalWidth)
    )
    .toBe(1)
})

test("downloads a runnable project with its package and optional image adapter, not the draft", async ({
  page,
}) => {
  await page.goto("/build")
  await choose(page, "Local OPFS image storage", true)
  const preview = page.getByRole("region", { name: "Live editor preview" })
  await preview
    .getByRole("button", { name: "Markdown source", exact: true })
    .click()
  await preview
    .getByRole("textbox", { name: "Markdown source" })
    .fill("PRIVATE-DRAFT-DO-NOT-EXPORT")
  const pending = page.waitForEvent("download")
  await page
    .getByRole("button", { name: "Download project", exact: true })
    .click()
  const download = await pending
  const directory = mkdtempSync(
    path.join(tmpdir(), "markdown-builder-download-")
  )
  const archive = path.join(directory, "project.zip")
  await download.saveAs(archive)
  execFileSync("unzip", ["-t", archive])
  execFileSync("unzip", ["-q", archive, "-d", path.join(directory, "project")])
  const manifest = JSON.parse(
    readFileSync(path.join(directory, "project/package.json"), "utf8")
  )
  expect(manifest.dependencies["@eidos.space/markdown"]).toBe(
    "file:./vendor/markdown.tgz"
  )
  const component = readFileSync(
    path.join(directory, "project/src/Editor.tsx"),
    "utf8"
  )
  expect(component).toContain("useOpfsImageStorage")
  expect(component).not.toContain("PRIVATE-DRAFT")
  expect(
    readFileSync(
      path.join(directory, "project/src/opfs-image-store.ts"),
      "utf8"
    )
  ).toContain("createWritable")
  expect(
    readFileSync(path.join(directory, "project/vendor/markdown.tgz"))[0]
  ).toBe(0x1f)
  console.log(
    `Downloaded Builder project retained at: ${path.join(directory, "project")}`
  )
})

test("reports a missing download artifact without losing configuration or draft", async ({
  page,
}) => {
  await page.route("**/downloads/markdown.tgz", (route) =>
    route.fulfill({ status: 404, body: "missing" })
  )
  await page.goto("/build")
  await page
    .getByRole("button", { name: "Download project", exact: true })
    .click()
  await expect(page.getByRole("status")).toContainText("Download failed")
  await expect(
    page.getByRole("button", { name: "Download project", exact: true })
  ).toBeEnabled()
  await expect(page.getByLabel("Tables", { exact: true })).toBeChecked()
})

test("builder uses the selected syntax and preserves drafts across configuration changes", async ({
  page,
}) => {
  await page.goto("/build")
  const preview = page.getByRole("region", { name: "Live editor preview" })
  await expect(preview.locator("table")).toBeVisible()
  await choose(page, "Tables", false)
  await expect(preview.locator("table")).toHaveCount(0)
  await expect(
    page
      .getByRole("region", { name: "Generated integration code" })
      .locator("pre")
  ).not.toContainText("tablePlugin")
  await preview
    .getByRole("button", { name: "Markdown source", exact: true })
    .click()
  const source = preview.getByRole("textbox", { name: "Markdown source" })
  await source.fill("# My untouched draft\n\nAn $x^2$ equation.\n")
  await choose(page, "Equations", true)
  await expect(source).toHaveValue(
    "# My untouched draft\n\nAn $x^2$ equation.\n"
  )
  await preview
    .getByRole("button", { name: "Markdown source", exact: true })
    .click()
  await expect(preview.locator(".katex")).toBeVisible()
  await preview.getByRole("button", { name: "Load example" }).click()
  await preview.getByRole("button", { name: "Restore draft" }).click()
  await expect(
    preview.getByRole("heading", { name: "My untouched draft" })
  ).toBeVisible()
})

test("configuration deep links restore choices but never include the document", async ({
  page,
}) => {
  await page.goto("/build")
  await choose(page, "Footnotes", true)
  const url = page.url()
  expect(url).not.toContain("Your+Markdown")
  await page.reload()
  await expect(page.getByLabel("Footnotes", { exact: true })).toBeChecked()
  await page.goto("/build?config=%7B%22schemaVersion%22%3A999%7D")
  await expect(page.getByRole("alert")).toContainText("could not be loaded")
  await expect(page.getByLabel("Tables", { exact: true })).toBeChecked()
})

test("Chinese builder offers all panels in a narrow viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/zh/build")
  await expect(
    page.getByRole("heading", { name: "构建你的 Markdown 编辑器" })
  ).toBeVisible()
  await choose(page, "表格", false)
  await page.getByRole("button", { name: "代码", exact: true }).click()
  await expect(
    page.getByRole("region", { name: "生成的集成代码" }).locator("pre")
  ).not.toContainText("tablePlugin")
  await expect(
    page.getByRole("button", { name: "复制代码", exact: true })
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
})
