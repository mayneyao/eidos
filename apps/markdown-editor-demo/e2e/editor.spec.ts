import { expect, test } from "@playwright/test"

test("keeps the Lexical canvas and canonical source in sync", async ({
  page,
}) => {
  await page.goto("/")

  const editor = page.locator('[data-markdown-editor="wysiwyg"]')
  const canvas = page.getByLabel("Lexical Markdown demo editor")
  const source = page.getByLabel("Canonical Markdown source")
  await expect(editor).toBeVisible()
  await expect(editor).toContainText("A calm place to think")
  const floatingToolbar = page.locator(".eme-floating-toolbar")
  await expect(floatingToolbar).toHaveAttribute("aria-hidden", "true")
  await canvas.locator(".eme-paragraph").first().selectText()
  await expect(floatingToolbar).toHaveAttribute("aria-hidden", "false")

  await canvas.fill("Edited in the Lexical canvas")
  await expect(source).toHaveValue("# Edited in the Lexical canvas")

  await source.fill(
    "# Replaced from source\n\nThe Markdown string still owns the document."
  )

  await expect(editor).toContainText("Replaced from source")
  await expect(editor).toContainText(
    "The Markdown string still owns the document."
  )
})

test("reflows CommonMark soft breaks while preserving hard breaks", async ({
  page,
}) => {
  await page.goto("/")

  await page
    .getByLabel("Canonical Markdown source")
    .fill("Soft line\ncontinues here.\n\nHard line  \nstays separate.")

  const paragraphs = page
    .getByLabel("Lexical Markdown demo editor")
    .locator(".eme-paragraph")
  await expect(paragraphs).toHaveCount(2)
  await expect(paragraphs.first()).toHaveText("Soft line continues here.")
  await expect(paragraphs.first().locator("br")).toHaveCount(0)
  await expect(paragraphs.nth(1).locator("br")).toHaveCount(1)
})

test("demonstrates the unsupported syntax guard", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("radio", { name: "Fallback guard" }).click()

  const guard = page.locator('[data-markdown-editor="unsupported"]')
  await expect(guard).toBeVisible()
  await expect(guard).toContainText("YAML frontmatter")
  await expect(guard).toContainText("Image")
})

test("keeps long documents scrollable inside the editor stage", async ({
  page,
}) => {
  await page.goto("/")
  const source = page.getByLabel("Canonical Markdown source")
  const stage = page.locator(".eme-editor-stage")
  const longDocument = Array.from(
    { length: 80 },
    (_, index) =>
      `## Section ${index + 1}\n\nScrollable paragraph ${index + 1}.`
  ).join("\n\n")

  await source.fill(longDocument)
  await expect
    .poll(() =>
      stage.evaluate((element) => element.scrollHeight > element.clientHeight)
    )
    .toBe(true)
  await stage.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expect
    .poll(() => stage.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0)
})

test("matches preview typography and width in both layouts", async ({
  page,
}) => {
  await page.goto("/")

  const editor = page.locator('[data-markdown-editor="wysiwyg"]')
  const contentEditable = page.getByLabel("Lexical Markdown demo editor")
  const heading = contentEditable.locator(".eme-heading-h1")
  await editor.evaluate((element) => {
    element.style.setProperty("--font-editorial", '"Courier New"')
  })
  await expect(editor).toHaveAttribute("data-layout", "document")
  await expect
    .poll(() =>
      contentEditable.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).paddingInlineStart)
      )
    )
    .toBeGreaterThan(0)
  await expect
    .poll(() =>
      contentEditable.evaluate((element) => {
        const contentStyle = getComputedStyle(element)
        const headingStyle = getComputedStyle(
          element.querySelector(".eme-heading-h1")!
        )
        return {
          contentMatchesHost:
            contentStyle.fontFamily ===
            getComputedStyle(document.documentElement).fontFamily,
          contentSize: contentStyle.fontSize,
          contentLineHeight: contentStyle.lineHeight,
          headingMatchesContent:
            headingStyle.fontFamily === contentStyle.fontFamily,
          headingSize: headingStyle.fontSize,
        }
      })
    )
    .toEqual({
      contentMatchesHost: true,
      contentSize: "14px",
      contentLineHeight: "24.08px",
      headingMatchesContent: true,
      headingSize: "28.8px",
    })

  await page.getByRole("radio", { name: "Content field" }).click()

  await expect(editor).toHaveAttribute("data-layout", "embedded")
  await expect(page.locator(".eme-editor-stage")).toHaveCSS(
    "overflow-y",
    "visible"
  )
  await expect
    .poll(() =>
      contentEditable.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).paddingInlineStart)
      )
    )
    .toBe(0)
  await expect(contentEditable).toHaveCSS("font-size", "15px")
  await expect(contentEditable).toHaveCSS("line-height", "28px")
  await expect(heading).toHaveCSS("font-size", "30px")
  await expect
    .poll(() =>
      heading.evaluate(
        (element) =>
          getComputedStyle(element).fontFamily ===
          getComputedStyle(element.parentElement!).fontFamily
      )
    )
    .toBe(true)
})

test("keeps list markers and checkboxes aligned under a host CSS reset", async ({
  page,
}) => {
  await page.goto("/")
  await page.addStyleTag({
    content: "ol, ul, menu { list-style: none; }",
  })

  await page.getByRole("radio", { name: "Content field" }).click()
  await page
    .getByLabel("Canonical Markdown source")
    .fill(
      [
        "- Unordered one",
        "- Unordered two",
        "",
        "1. Ordered one",
        "2. Ordered two",
        "",
        "- [ ] Pending task",
        "- [x] Completed task",
      ].join("\n")
    )

  const unorderedList = page.locator(".eme-list-unordered").first()
  const orderedList = page.locator(".eme-list-ordered").first()
  const uncheckedItem = page.locator(".eme-list-item-unchecked").first()

  await expect(unorderedList).toHaveCSS("list-style-type", "disc")
  await expect(orderedList).toHaveCSS("list-style-type", "decimal")
  await expect(uncheckedItem).toHaveCSS("line-height", "28px")
  await expect
    .poll(() =>
      uncheckedItem.evaluate((element) => {
        const itemStyle = getComputedStyle(element)
        const markerStyle = getComputedStyle(element, "::before")
        return {
          lineCenter: Number.parseFloat(itemStyle.lineHeight) / 2,
          markerAnchor: Number.parseFloat(markerStyle.top),
          markerTransform: markerStyle.transform,
        }
      })
    )
    .toEqual({
      lineCenter: 14,
      markerAnchor: 14,
      markerTransform: "matrix(1, 0, 0, 1, 0, -6.75)",
    })
})
