import { expect, test } from "@playwright/test"

test("keeps the page focused on the WYSIWYG editor", async ({ page }) => {
  await page.goto("/")

  const shell = page.locator(".playground-shell")
  const editor = page.locator('[data-markdown-editor="wysiwyg"]')
  const canvas = page.getByLabel("Markdown playground editor")
  const floatingToolbar = page.locator(".eme-floating-toolbar")
  const viewSource = page.getByRole("button", { name: "View source" })

  await expect
    .poll(() => shell.evaluate((element) => element.children.length))
    .toBe(2)
  await expect(
    page.locator(".playground-header").getByRole("heading", { level: 1 })
  ).toHaveText("Markdown Editor Playground")
  await expect(page.locator(".playground-header button")).toHaveCount(1)
  await expect(
    page.getByRole("switch", { name: "Read only" })
  ).not.toBeChecked()
  await expect(page.locator("textarea")).toHaveCount(0)
  await expect(editor).toBeVisible()
  await expect(editor).toContainText("A calm place to think")
  await expect(floatingToolbar).toHaveAttribute("aria-hidden", "true")

  await canvas.locator(".eme-paragraph").first().selectText()
  await expect(floatingToolbar).toHaveAttribute("aria-hidden", "false")

  await viewSource.click()
  const source = page.getByLabel("Markdown source")
  await expect(source).toHaveValue(/## Compatibility matrix/u)
  await source.fill("# Edited from source\n\nMarkdown remains canonical.")
  await page.getByRole("button", { name: "View editor" }).click()
  await expect(editor).toContainText("Edited from source")
  await expect(editor).toContainText("Markdown remains canonical.")
})

test("applies read-only mode to editor and source views", async ({ page }) => {
  await page.goto("/")

  const readOnly = page.getByRole("switch", { name: "Read only" })
  const canvas = page.getByLabel("Markdown playground editor")

  await expect(readOnly).not.toBeChecked()
  await expect(canvas).toHaveAttribute("contenteditable", "true")

  await readOnly.click()
  await expect(readOnly).toBeChecked()
  await expect(canvas).toHaveAttribute("contenteditable", "false")
  await expect(page.locator(".eme-floating-toolbar")).toHaveCount(0)

  await page.getByRole("button", { name: "View source" }).click()
  const source = page.getByLabel("Markdown source")
  await expect(source).not.toBeEditable()

  await readOnly.click()
  await expect(source).toBeEditable()
  await page.getByRole("button", { name: "View editor" }).click()
  await expect(canvas).toHaveAttribute("contenteditable", "true")
})

test("highlights fenced code without changing the Lexical DOM", async ({
  page,
}) => {
  await page.goto("/")

  const code = page.locator(".eme-code-block")
  await expect(code).toHaveAttribute("data-language", "ts")
  await expect
    .poll(() =>
      code.evaluate((element) => {
        const categories: string[] = []
        let ranges = 0
        for (const [name, highlight] of CSS.highlights) {
          let containsCodeRange = false
          for (const range of highlight) {
            const startElement = range.startContainer.parentElement
            if (startElement && element.contains(startElement)) {
              containsCodeRange = true
              ranges += 1
            }
          }
          if (containsCodeRange) categories.push(name)
        }
        return { categories: categories.sort(), ranges }
      })
    )
    .toMatchObject({
      categories: expect.arrayContaining([
        "eme-code-keyword",
        "eme-code-string",
        "eme-code-type",
      ]),
    })

  await expect
    .poll(() =>
      code.evaluate((element) => {
        return {
          directChildren: element.children.length,
          lexicalTextChildren: element.querySelectorAll(
            ":scope > span[data-lexical-text='true']"
          ).length,
          nestedTokenElements: element.querySelectorAll(
            "[class*='token'], [data-highlight-token]"
          ).length,
        }
      })
    )
    .toEqual({
      directChildren: 1,
      lexicalTextChildren: 1,
      nestedTokenElements: 0,
    })

  const initialKeywordRanges = await code.evaluate(() => {
    return CSS.highlights.get("eme-code-keyword")?.size ?? 0
  })
  await code.evaluate((element) => {
    const range = document.createRange()
    range.selectNodeContents(element)
    range.collapse(false)
    const selection = document.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  })
  await page.keyboard.press("Enter")
  await page.keyboard.type("cons", { delay: 35 })
  await expect
    .poll(() =>
      code.evaluate(() => {
        return CSS.highlights.get("eme-code-keyword")?.size ?? 0
      })
    )
    .toBe(initialKeywordRanges)
  await page.keyboard.type("t", { delay: 35 })
  await expect
    .poll(() =>
      code.evaluate(() => {
        return CSS.highlights.get("eme-code-keyword")?.size ?? 0
      })
    )
    .toBeGreaterThan(initialKeywordRanges)
  await page.keyboard.press("Backspace")
  await expect
    .poll(() =>
      code.evaluate(() => {
        return CSS.highlights.get("eme-code-keyword")?.size ?? 0
      })
    )
    .toBe(initialKeywordRanges)
  await page.keyboard.type("t", { delay: 35 })
  await expect
    .poll(() =>
      code.evaluate(() => {
        return CSS.highlights.get("eme-code-keyword")?.size ?? 0
      })
    )
    .toBeGreaterThan(initialKeywordRanges)
  await page.keyboard.type(" highlightedAfterEdit = 7", { delay: 10 })
  await expect(code).toContainText("highlightedAfterEdit")
})

test("keeps long documents editable and scrollable", async ({ page }) => {
  await page.goto("/")

  const canvas = page.getByLabel("Markdown playground editor")
  const stage = page.locator(".eme-editor-stage")
  const longDocument = Array.from(
    { length: 100 },
    (_, index) => `Scrollable paragraph ${index + 1}.`
  ).join("\n\n")

  await canvas.fill(longDocument)
  await expect(canvas).toContainText("Scrollable paragraph 100.")
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

test("uses the standalone document typography and reading width", async ({
  page,
}) => {
  await page.goto("/")

  const editor = page.locator('[data-markdown-editor="wysiwyg"]')
  const canvas = page.getByLabel("Markdown playground editor")
  const heading = canvas.locator(".eme-heading-h1")

  await expect(editor).toHaveAttribute("data-layout", "document")
  await expect
    .poll(() =>
      canvas.evaluate((element) => {
        const style = getComputedStyle(element)
        return {
          fontMatchesHost:
            style.fontFamily ===
            getComputedStyle(document.documentElement).fontFamily,
          fontSize: style.fontSize,
          lineHeight: style.lineHeight,
          horizontalPadding: Number.parseFloat(style.paddingInlineStart),
          width: element.getBoundingClientRect().width,
          stageWidth: element.parentElement!.getBoundingClientRect().width,
        }
      })
    )
    .toMatchObject({
      fontMatchesHost: true,
      fontSize: "14px",
      lineHeight: "24.08px",
    })
  await expect
    .poll(() =>
      canvas.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).paddingInlineStart)
      )
    )
    .toBeGreaterThan(0)
  await expect
    .poll(() =>
      canvas.evaluate(
        (element) =>
          element.getBoundingClientRect().width <
          element.parentElement!.getBoundingClientRect().width
      )
    )
    .toBe(true)
  await expect(heading).toHaveCSS("font-size", "28.8px")
})

test("aligns unordered, checklist, and ordered list text", async ({ page }) => {
  await page.goto("/")
  await page.addStyleTag({
    content: "ol, ul, menu { list-style: none; }",
  })

  const unorderedList = page.locator(".eme-list-unordered").first()
  const orderedList = page.locator(".eme-list-ordered").first()
  const unorderedItem = unorderedList.locator(".eme-list-item").first()
  const orderedItem = orderedList.locator(".eme-list-item").first()
  const uncheckedItem = page.locator(".eme-list-item-unchecked").first()

  await expect(unorderedList).toHaveCSS("list-style-type", "disc")
  await expect(orderedList).toHaveCSS("list-style-type", "decimal")
  await expect
    .poll(() =>
      uncheckedItem.evaluate((element) => {
        const itemStyle = getComputedStyle(element)
        const markerStyle = getComputedStyle(element, "::before")
        return Math.abs(
          Number.parseFloat(itemStyle.lineHeight) / 2 -
            Number.parseFloat(markerStyle.top)
        )
      })
    )
    .toBeLessThanOrEqual(0.1)

  const textStarts = await Promise.all(
    [unorderedItem, uncheckedItem, orderedItem].map((item) =>
      item.evaluate((element) => {
        const walker = document.createTreeWalker(
          element,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode: (node) =>
              node.textContent?.trim()
                ? NodeFilter.FILTER_ACCEPT
                : NodeFilter.FILTER_SKIP,
          }
        )
        const textNode = walker.nextNode()
        if (!(textNode instanceof Text)) {
          throw new Error("Expected a list item text node")
        }
        const firstCharacter = textNode.data.search(/\S/u)
        const range = document.createRange()
        range.setStart(textNode, firstCharacter)
        range.setEnd(textNode, firstCharacter + 1)
        return range.getBoundingClientRect().left
      })
    )
  )
  expect(Math.max(...textStarts) - Math.min(...textStarts)).toBeLessThanOrEqual(
    1
  )

  const checkbox = await uncheckedItem.evaluate((element) => {
    const item = element.getBoundingClientRect()
    const marker = getComputedStyle(element, "::before")
    return {
      x:
        item.left +
        Number.parseFloat(marker.left) +
        Number.parseFloat(marker.width) / 2,
      y: item.top + Number.parseFloat(marker.top),
    }
  })
  await page.mouse.click(checkbox.x, checkbox.y)
  await expect(
    page.locator(".eme-list-item", {
      hasText: "Keep expanding compatibility coverage",
    })
  ).toHaveClass(/eme-list-item-checked/u)

  await page.getByRole("button", { name: "View source" }).click()
  await expect(page.getByLabel("Markdown source")).toHaveValue(
    /- \[x\] Keep expanding compatibility coverage/u
  )
})

test("draws one checkbox per nested checklist item", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "View source" }).click()
  await page
    .getByLabel("Markdown source")
    .fill("- [ ] Parent\n    - [ ] Child\n        - [ ] Grandchild")
  await page.getByRole("button", { name: "View editor" }).click()

  await expect(page.getByRole("checkbox")).toHaveCount(3)
  const nestedWrappers = page.locator(".eme-nested-list-item")
  await expect(nestedWrappers).toHaveCount(2)
  await expect
    .poll(() =>
      nestedWrappers.evaluateAll((elements) =>
        elements.map((element) => getComputedStyle(element, "::before").display)
      )
    )
    .toEqual(["none", "none"])

  const checkboxLefts = await page
    .getByRole("checkbox")
    .evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().left)
    )
  expect(checkboxLefts[1] - checkboxLefts[0]).toBeCloseTo(24, 1)
  expect(checkboxLefts[2] - checkboxLefts[1]).toBeCloseTo(24, 1)
})
