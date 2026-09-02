import { expect, test, type Page } from "@playwright/test"

async function openMarkdown(page: Page, markdown: string) {
  await page.addInitScript((documentValue) => {
    ;(
      window as Window & { __EIDOS_MARKDOWN_TEST_DOCUMENT__?: string }
    ).__EIDOS_MARKDOWN_TEST_DOCUMENT__ = documentValue
  }, markdown)
  await page.goto("/")
}

async function currentMarkdown(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      (window as Window & { __EIDOS_MARKDOWN_TEST_VALUE__?: string })
        .__EIDOS_MARKDOWN_TEST_VALUE__ ?? ""
  )
}

async function setExternalMarkdown(page: Page, markdown: string) {
  await page.evaluate((value) => {
    ;(
      window as Window & {
        __EIDOS_MARKDOWN_TEST_SET_DOCUMENT__?(markdown: string): void
      }
    ).__EIDOS_MARKDOWN_TEST_SET_DOCUMENT__?.(value)
  }, markdown)
}

test("CAN-001 keeps the page focused on only the WYSIWYG editor", async ({
  page,
}) => {
  await page.goto("/")

  const shell = page.locator(".playground-shell")
  const editor = page.locator('[data-markdown-editor="wysiwyg"]')
  const canvas = page.getByLabel("Markdown playground editor")
  const floatingToolbar = page.locator(".eme-floating-toolbar")

  await expect
    .poll(() => shell.evaluate((element) => element.children.length))
    .toBe(2)
  await expect(
    page.locator(".playground-header").getByRole("heading", { level: 1 })
  ).toHaveText("Markdown Editor Playground")
  await expect(
    page.locator(".playground-header").getByRole("button", {
      name: "Shortcuts",
    })
  ).toBeVisible()
  await expect(
    page.getByRole("switch", { name: "Read only" })
  ).not.toBeChecked()
  await expect(page.locator("textarea")).toHaveCount(0)
  await expect(editor).toBeVisible()
  await expect(editor).toContainText("A calm place to think")
  await expect(floatingToolbar).toHaveAttribute("aria-hidden", "true")
  await expect(page.getByRole("button", { name: "View source" })).toHaveCount(0)
  await expect(page.getByLabel("Markdown source")).toHaveCount(0)

  await canvas.focus()
  await expect(canvas).toBeFocused()
  await expect
    .poll(() =>
      canvas.evaluate((element) => getComputedStyle(element).outlineStyle)
    )
    .toBe("none")

  await canvas.locator(".eme-paragraph").first().selectText()
  await expect(floatingToolbar).toHaveAttribute("aria-hidden", "false")
})

test("shows every default shortcut in an accessible reference dialog", async ({
  page,
}) => {
  await page.goto("/")

  const trigger = page.getByRole("button", { name: "Shortcuts" })
  await trigger.click()
  const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator("[data-shortcut-id]")).toHaveCount(19)

  const toggleRow = dialog.locator(
    '[data-shortcut-id="list-item.toggle-checked"]'
  )
  await expect(toggleRow).toContainText("Toggle the current checklist item")
  await expect(toggleRow.locator("kbd")).toHaveText([
    process.platform === "darwin" ? "⌘↵" : "Ctrl+↵",
  ])
  await expect(
    dialog.locator('[data-shortcut-id="history.redo"] kbd')
  ).toHaveCount(2)

  await page.keyboard.press("Escape")
  await expect(dialog).not.toBeVisible()
  await expect(trigger).toBeFocused()
})

test("HST-002 keeps read-only content selectable without mutation controls", async ({
  page,
}) => {
  await page.goto("/")

  const readOnly = page.getByRole("switch", { name: "Read only" })
  const canvas = page.getByLabel("Markdown playground editor")

  await expect(readOnly).not.toBeChecked()
  await expect(canvas).toHaveAttribute("contenteditable", "true")

  await readOnly.click()
  await expect(readOnly).toBeChecked()
  await expect(canvas).toHaveAttribute("contenteditable", "false")
  await expect(page.locator(".eme-floating-toolbar")).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Edit block" })).toHaveCount(0)
  const readOnlyImage = canvas.locator(".eme-efm-image-block")
  await readOnlyImage.click()
  await expect(readOnlyImage.locator("xpath=..")).toHaveAttribute(
    "data-efm-selection-kind",
    "node"
  )

  await readOnly.click()
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

test("FID-001 imports and exports the highlight delimiter", async ({
  page,
}) => {
  await openMarkdown(page, "# Highlight\n\nBefore ==important== after.")

  const highlighted = page.locator(".eme-text-highlight")
  await expect(highlighted).toHaveText("important")
  await highlighted.selectText()
  await expect(page.getByRole("button", { name: "Highlight" })).toHaveAttribute(
    "aria-pressed",
    "true"
  )

  await expect
    .poll(() => currentMarkdown(page))
    .toBe("# Highlight\n\nBefore ==important== after.")
})

test("FID-003 preserves untouched source layout when editing another block", async ({
  page,
}) => {
  await openMarkdown(page, "# Original title\n\n\nBody with  spacing.\n")

  const heading = page.locator("h1").filter({ hasText: "Original title" })
  await heading.selectText()
  await page.keyboard.type("Changed title")

  await expect
    .poll(() => currentMarkdown(page))
    .toBe("# Changed title\n\n\nBody with  spacing.\n")
})

test("renaming a definition updates its references in the same change", async ({
  page,
}) => {
  await openMarkdown(page, "Body[^note].\n\n[^note]: Original.")

  const definition = page.locator(".eme-efm-footnote-definition")
  await definition.getByRole("button", { name: "Edit block" }).click()
  await page
    .getByLabel("Edit block: footnote-definition")
    .fill("[^renamed]: Original.")
  await page
    .locator(".eme-efm-block-editor-actions")
    .getByRole("button", { name: "Done" })
    .click()

  await expect
    .poll(() => currentMarkdown(page))
    .toBe("Body[^renamed].\n\n[^renamed]: Original.")
  await expect(page.locator(".eme-efm-footnote-reference a")).toHaveAttribute(
    "href",
    "#efm-footnote-renamed"
  )
})

test("NAV-001 keeps footnote jumps inside the editor without replacing the host hash", async ({
  page,
}) => {
  await openMarkdown(
    page,
    [
      "Reference[^note].",
      ...Array.from(
        { length: 45 },
        (_, index) => `Filler paragraph ${index + 1}.`
      ),
      "[^note]: Footnote body.",
    ].join("\n\n")
  )

  const hostHash = "#/space/test/file/record"
  await page.evaluate((hash) => {
    window.history.replaceState(window.history.state, "", hash)
  }, hostHash)

  const reference = page.locator(".eme-efm-footnote-reference")
  const definition = page.locator(".eme-efm-footnote-definition")
  await reference.getByRole("link").click()

  await expect
    .poll(() => page.evaluate(() => window.location.hash))
    .toBe(hostHash)
  await expect
    .poll(() =>
      definition.evaluate((element) => document.activeElement === element)
    )
    .toBe(true)
  await expect
    .poll(() =>
      definition.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        return rect.bottom > 0 && rect.top < window.innerHeight
      })
    )
    .toBe(true)

  await definition
    .getByRole("link", { name: "Return to footnote reference 1" })
    .click()

  await expect
    .poll(() => page.evaluate(() => window.location.hash))
    .toBe(hostHash)
  await expect
    .poll(() =>
      reference.evaluate((element) => document.activeElement === element)
    )
    .toBe(true)
})

test("invalid frontmatter remains a local draft until it is repaired", async ({
  page,
}) => {
  const original = "---\ntitle: Valid\n---\n\n# Body"
  await openMarkdown(page, original)

  await page
    .locator(".eme-efm-frontmatter")
    .getByRole("button", { name: "Edit block" })
    .click()
  const textarea = page.getByLabel("Edit block: frontmatter")
  await textarea.fill("---\ntitle: [\n---")
  await page
    .locator(".eme-efm-block-editor-actions")
    .getByRole("button", { name: "Done" })
    .click()

  await expect(page.getByRole("alert")).toBeVisible()
  await expect(textarea).toBeVisible()
  await expect.poll(() => currentMarkdown(page)).toBe(original)

  await textarea.fill("---\ntitle: Repaired\n---")
  await page
    .locator(".eme-efm-block-editor-actions")
    .getByRole("button", { name: "Done" })
    .click()
  await expect(page.locator(".eme-efm-frontmatter")).toContainText("Repaired")
  await expect
    .poll(() => currentMarkdown(page))
    .toBe("---\ntitle: Repaired\n---\n\n# Body")
})

test("external Markdown waits for an active block draft to resolve", async ({
  page,
}) => {
  await openMarkdown(page, "$$\nx\n$$\n\nTail")

  await page.getByRole("button", { name: "Edit block equation" }).click()
  const formula = page.getByRole("textbox", { name: "Edit block equation" })
  await formula.fill("local")
  await setExternalMarkdown(page, "$$\nremote\n$$\n\nRemote tail")

  await expect(formula).toHaveValue("local")
  await expect(page.getByRole("alert")).toContainText(
    "document changed outside"
  )
  await formula.press("Escape")

  await expect
    .poll(() => currentMarkdown(page))
    .toBe("$$\nremote\n$$\n\nRemote tail")
  await expect(page.locator(".eme-efm-math-display")).toContainText("remote")

  await page.getByRole("button", { name: "Edit block equation" }).click()
  const secondDraft = page.getByRole("textbox", {
    name: "Edit block equation",
  })
  await secondDraft.fill("local-kept")
  await setExternalMarkdown(page, "$$\nthird\n$$\n\nThird tail")
  await page.getByRole("button", { name: /^Done/u }).click()

  await expect
    .poll(() => currentMarkdown(page))
    .toBe("$$\nlocal-kept\n$$\n\nRemote tail")
})

test("stores a pasted image in OPFS and resolves it after reload", async ({
  page,
}) => {
  await openMarkdown(page, "# Clipboard\n\nPaste below.")
  const canvas = page.getByLabel("Markdown playground editor")
  await canvas.locator(".eme-paragraph").click()

  await canvas.evaluate((element) => {
    const png = atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    )
    const bytes = Uint8Array.from(png, (character) => character.charCodeAt(0))
    const transfer = new DataTransfer()
    transfer.items.add(
      new File([bytes], "clipboard-dot.png", { type: "image/png" })
    )
    const event = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: transfer,
    })
    element.dispatchEvent(event)
  })

  const pastedImage = page.getByAltText("clipboard-dot")
  await expect(pastedImage).toHaveAttribute("src", /^blob:/u)
  await expect
    .poll(() => currentMarkdown(page))
    .toMatch(
      /!\[clipboard-dot\]\(<opfs:\/\/markdown-editor-playground\/images\/[a-f0-9-]+\.png>\)/u
    )

  const storedMarkdown = await currentMarkdown(page)
  const fileName = storedMarkdown.match(
    /opfs:\/\/markdown-editor-playground\/images\/([a-f0-9-]+\.png)/u
  )?.[1]
  expect(fileName).toBeTruthy()
  await expect
    .poll(() =>
      page.evaluate(async (name) => {
        if (!name) return null
        const root = await navigator.storage.getDirectory()
        const app = await root.getDirectoryHandle("markdown-editor-playground")
        const images = await app.getDirectoryHandle("images")
        const file = await (await images.getFileHandle(name)).getFile()
        return { size: file.size, type: file.type }
      }, fileName)
    )
    .toEqual({ size: 68, type: "image/png" })

  await canvas.press(process.platform === "darwin" ? "Meta+z" : "Control+z")
  await expect
    .poll(() => currentMarkdown(page))
    .toBe("# Clipboard\n\nPaste below.")
  await expect(page.getByAltText("clipboard-dot")).toHaveCount(0)

  await page.addInitScript((documentValue) => {
    ;(
      window as Window & { __EIDOS_MARKDOWN_TEST_DOCUMENT__?: string }
    ).__EIDOS_MARKDOWN_TEST_DOCUMENT__ = documentValue
  }, storedMarkdown)
  await page.reload()
  await expect(page.getByAltText("clipboard-dot")).toHaveAttribute(
    "src",
    /^blob:/u
  )
})

test("an in-flight image paste cannot mutate an editor switched to read only", async ({
  page,
}) => {
  const original = "# Clipboard\n\nPaste below."
  await page.addInitScript(() => {
    ;(
      window as Window & { __EIDOS_MARKDOWN_TEST_PASTE_DELAY_MS__?: number }
    ).__EIDOS_MARKDOWN_TEST_PASTE_DELAY_MS__ = 250
  })
  await openMarkdown(page, original)
  const canvas = page.getByLabel("Markdown playground editor")
  await canvas.locator(".eme-paragraph").click()

  await canvas.evaluate((element) => {
    const transfer = new DataTransfer()
    transfer.items.add(
      new File([new Uint8Array([137, 80, 78, 71])], "late.png", {
        type: "image/png",
      })
    )
    element.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: transfer,
      })
    )
  })
  await page.getByRole("switch", { name: "Read only" }).click()

  await page.waitForTimeout(350)
  await expect.poll(() => currentMarkdown(page)).toBe(original)
  await expect(page.getByAltText("late.png")).toHaveCount(0)
})

test("EDT-001 edits an EFM equation in a floating local composer", async ({
  page,
}) => {
  await page.goto("/")

  const editor = page.locator('[data-markdown-editor="wysiwyg"]')
  const mathBlock = editor.locator(".eme-efm-semantic-block").first()
  const unaffectedHeading = editor.getByRole("heading", {
    name: "A calm place to think",
  })

  await expect(mathBlock.locator("math")).toHaveCount(1)
  const followingBlock = editor
    .locator(".eme-efm-image-block")
    .locator("xpath=..")
  const followingTopBefore = await followingBlock.evaluate((element) => {
    const stage = element.closest(".eme-editor-stage")
    return (
      element.getBoundingClientRect().top +
      (stage instanceof HTMLElement ? stage.scrollTop : 0)
    )
  })
  await mathBlock
    .getByRole("button", { name: "Edit block equation", exact: true })
    .click()

  const blockSource = mathBlock.locator(
    'textarea[aria-label="Edit block equation"]'
  )
  await expect(blockSource).toBeVisible()
  await expect(mathBlock.locator("math")).toHaveCount(1)
  await expect(page.getByLabel("Markdown source")).toHaveCount(0)
  await expect(editor).toBeVisible()
  await expect(unaffectedHeading).toBeVisible()
  await expect
    .poll(() =>
      followingBlock.evaluate((element) => {
        const stage = element.closest(".eme-editor-stage")
        return (
          element.getBoundingClientRect().top +
          (stage instanceof HTMLElement ? stage.scrollTop : 0)
        )
      })
    )
    .toBe(followingTopBefore)

  await blockSource.fill("x^3 + y^3 = z^3")
  await expect(mathBlock.locator(".eme-efm-math-display")).toHaveAttribute(
    "data-efm-math-source",
    "x^3 + y^3 = z^3"
  )
  await expect(blockSource).toHaveAttribute(
    "aria-keyshortcuts",
    "Meta+Enter Control+Enter Escape"
  )
  await blockSource.press(
    process.platform === "darwin" ? "Meta+Enter" : "Control+Enter"
  )

  await expect(blockSource).toHaveCount(0)
  await expect(mathBlock.locator(".eme-efm-math-display")).toHaveAttribute(
    "data-efm-math-source",
    "x^3 + y^3 = z^3"
  )
  await expect(unaffectedHeading).toBeVisible()
  await expect
    .poll(() => currentMarkdown(page))
    .toMatch(/\$\$\nx\^3 \+ y\^3 = z\^3\n\$\$/u)
})

test("FID-002 isolates malformed EFM in editable fallback blocks", async ({
  page,
}) => {
  await openMarkdown(
    page,
    `---
title: First
title: Duplicate
---

# The rest stays visual

$$
x + y
`
  )

  const editor = page.locator('[data-markdown-editor="wysiwyg"]')
  await expect(editor).toBeVisible()
  await expect(
    editor.getByRole("heading", { name: "The rest stays visual" })
  ).toBeVisible()
  await expect(
    editor.locator('[data-efm-source-kind="frontmatter"]')
  ).toHaveCount(1)
  await expect(editor.locator('[data-efm-source-kind="math"]')).toHaveCount(1)

  const frontmatterFallback = editor.locator(
    '[data-efm-source-kind="frontmatter"]'
  )
  await frontmatterFallback.getByRole("button", { name: "Edit block" }).click()
  await page
    .getByLabel("Edit block: YAML frontmatter")
    .fill("---\ntitle: Repaired\n---")
  await frontmatterFallback
    .getByRole("button", { name: "Done", exact: true })
    .click()
  await expect(frontmatterFallback).toHaveCount(0)
  await expect(editor.locator(".eme-efm-frontmatter")).toContainText("Repaired")

  const mathBlock = editor.locator('[data-efm-source-kind="math"]')
  await mathBlock.getByRole("button", { name: "Edit block" }).click()
  const blockSource = page.getByLabel("Edit block: Mathematics")
  await blockSource.fill("$$\nx - y")
  await mathBlock.getByRole("button", { name: "Done", exact: true }).click()

  await expect(editor).toBeVisible()
  await expect(page.getByLabel("Markdown source")).toHaveCount(0)
  await expect(mathBlock).toContainText("x - y")
  await mathBlock.locator(".eme-efm-source-code").click()
  await expect(mathBlock.locator("xpath=..")).toHaveAttribute(
    "data-efm-selection-kind",
    "node"
  )
})

test("EDT-001 edits inline equations from an anchored local composer", async ({
  page,
}) => {
  await openMarkdown(page, "Inline $e=m*c^2$ formula.")

  const inlineMath = page.locator(".eme-efm-inline-math")
  await inlineMath.locator(".eme-efm-math-preview-trigger").click()
  const composer = inlineMath.locator(".eme-efm-math-composer")
  const input = page.getByLabel("Edit inline equation")

  await expect(composer).toBeVisible()
  await expect(input).toHaveValue("e=m*c^2")
  await input.fill("e=m*c^3")
  await expect(inlineMath.locator(".eme-efm-math-inline")).toHaveAttribute(
    "data-efm-math-source",
    "e=m*c^3"
  )
  await input.press("Enter")
  await expect(composer).toHaveCount(0)

  await expect
    .poll(() => currentMarkdown(page))
    .toBe("Inline $e=m*c^3$ formula.")
})

test("SEL-004 SEL-006 SEL-007 selects an atomic block and restores deletion", async ({
  page,
}) => {
  await openMarkdown(
    page,
    "Before.\n\n![Disposable image](https://example.com/image.png)\n\nAfter."
  )

  const image = page.locator(".eme-efm-image-block")
  const decorator = image.locator("xpath=..")
  await image.click()
  await expect(decorator).toHaveAttribute("data-efm-selection-kind", "node")

  await page.keyboard.press("Delete")
  await expect(image).toHaveCount(0)
  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+z" : "Control+z"
  )
  await expect(page.locator(".eme-efm-image-block")).toHaveCount(1)
})

test("SEL-001 SEL-002 keeps cross-block pointer selection text-only", async ({
  page,
}) => {
  await openMarkdown(
    page,
    `Before selection.

$$
x^3 = a^3 + b^3
$$

- One
- [ ] Selected task one
- [ ] Selected task two

After selection.`
  )

  const editor = page.getByLabel("Markdown playground editor")
  const start = await editor.locator(".eme-paragraph").first().boundingBox()
  const end = await editor.locator(".eme-paragraph").last().boundingBox()
  if (!start || !end) throw new Error("Selection endpoints are not visible")

  await page.mouse.move(start.x + 4, start.y + start.height / 2)
  await page.mouse.down()
  await page.mouse.move(end.x + 72, end.y + end.height / 2, { steps: 24 })
  await page.mouse.up()

  await expect
    .poll(() => page.evaluate(() => document.getSelection()?.toString() ?? ""))
    .toContain("Selected task two")
  await expect(editor.locator("[data-block-selected='true']")).toHaveCount(0)
  await expect(editor.locator(".eme-marquee-selected-block")).toHaveCount(0)
  await expect(editor.locator(".eme-efm-block-selected")).toHaveCount(0)

  await page.keyboard.press("Backspace")
  await expect(editor.locator(".eme-efm-math-block")).toHaveCount(0)
})

test("SEL-001 keeps long native text selection scrolling without block state", async ({
  page,
}) => {
  const documentValue = Array.from(
    { length: 80 },
    (_, index) => `Text block ${index + 1}.`
  ).join("\n\n")
  await openMarkdown(page, documentValue)

  const editor = page.getByLabel("Markdown playground editor")
  const stage = page.locator(".eme-editor-stage")
  const firstBox = await editor.locator(".eme-paragraph").first().boundingBox()
  const stageBox = await stage.boundingBox()
  if (!firstBox || !stageBox) {
    throw new Error("Long text selection endpoints are not visible")
  }

  await page.mouse.move(firstBox.x + 4, firstBox.y + firstBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(firstBox.x + 160, stageBox.y + stageBox.height - 6, {
    steps: 20,
  })

  await expect
    .poll(() => stage.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(200)
  await expect
    .poll(() => page.evaluate(() => document.getSelection()?.toString() ?? ""))
    .toContain("Text block 10.")
  await expect(editor.locator("[data-block-selected='true']")).toHaveCount(0)
  await page.mouse.up()
})

test("SEL-004 SEL-006 SEL-007 marquee starts across the full side canvas or trailing space", async ({
  page,
}) => {
  await openMarkdown(
    page,
    "# Marquee\n\nFirst block.\n\nSecond block.\n\nThird block."
  )

  const editor = page.getByLabel("Markdown playground editor")
  const stage = page.locator(".eme-editor-stage")
  const first = editor.locator(".eme-paragraph").nth(0)
  const second = editor.locator(".eme-paragraph").nth(1)
  const stageBox = await stage.boundingBox()
  const rootBox = await editor.boundingBox()
  const firstBox = await first.boundingBox()
  const secondBox = await second.boundingBox()
  if (!stageBox || !rootBox || !firstBox || !secondBox) {
    throw new Error("Marquee endpoints are not visible")
  }

  const leftCanvasX = stageBox.x + (rootBox.x - stageBox.x) / 2
  const rightCanvasX =
    rootBox.x +
    rootBox.width +
    (stageBox.x + stageBox.width - (rootBox.x + rootBox.width)) / 2
  const outsideStageY = stageBox.y - 12
  expect(rootBox.x - leftCanvasX).toBeGreaterThan(100)
  expect(rightCanvasX - (rootBox.x + rootBox.width)).toBeGreaterThan(100)
  expect(
    await page.evaluate(
      ({ x, y }) => {
        const target = document.elementFromPoint(x, y)
        const root = document.querySelector(
          '[aria-label="Markdown playground editor"]'
        )
        return {
          withinStage: Boolean(target?.closest(".eme-editor-stage")),
          withinDocument: Boolean(target && root?.contains(target)),
        }
      },
      { x: leftCanvasX, y: firstBox.y + 2 }
    )
  ).toEqual({ withinStage: true, withinDocument: false })

  await page.mouse.move(leftCanvasX, outsideStageY)
  await expect(stage).not.toHaveAttribute("data-block-marquee-zone")
  await page.mouse.down()
  await page.mouse.move(firstBox.x + 80, secondBox.y + 2, { steps: 8 })
  await expect(page.locator(".eme-block-marquee")).toHaveCount(0)
  await expect(editor.locator("[data-block-selected='true']")).toHaveCount(0)
  await page.mouse.up()

  await page.mouse.move(rightCanvasX, firstBox.y + 2)
  await expect(stage).toHaveAttribute("data-block-marquee-zone", "right")
  await page.mouse.move(leftCanvasX, firstBox.y + 2)
  await expect(stage).toHaveAttribute("data-block-marquee-zone", "left")
  await page.mouse.down()
  await page.mouse.move(firstBox.x + 80, secondBox.y + secondBox.height + 2, {
    steps: 18,
  })
  await expect(page.locator(".eme-block-marquee")).toBeVisible()
  await expect(editor.locator("[data-block-selected='true']")).toHaveCount(2)
  await page.mouse.up()

  await expect(editor.locator("[data-block-selected='true']")).toHaveCount(2)
  await expect
    .poll(() => page.evaluate(() => document.getSelection()?.toString() ?? ""))
    .toBe("")
  await page.keyboard.press("Escape")
  await expect(editor.locator("[data-block-selected='true']")).toHaveCount(0)

  await page.mouse.move(rightCanvasX, firstBox.y + 2)
  await page.mouse.down()
  await page.mouse.move(
    firstBox.x + firstBox.width - 80,
    secondBox.y + secondBox.height + 2,
    { steps: 18 }
  )
  await expect(page.locator(".eme-block-marquee")).toBeVisible()
  await expect(editor.locator("[data-block-selected='true']")).toHaveCount(2)
  await page.mouse.up()

  await page.keyboard.press("Backspace")
  await expect(editor).not.toContainText("First block.")
  await expect(editor).not.toContainText("Second block.")
  await expect(editor).toContainText("Third block.")

  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+z" : "Control+z"
  )
  await expect(editor).toContainText("First block.")
  await expect(editor).toContainText("Second block.")

  const thirdBox = await editor.locator(".eme-paragraph").nth(2).boundingBox()
  const restoredRootBox = await editor.boundingBox()
  if (!thirdBox || !restoredRootBox) {
    throw new Error("Trailing marquee geometry is not visible")
  }
  const bottomY = Math.min(
    restoredRootBox.y + restoredRootBox.height - 12,
    thirdBox.y + thirdBox.height + 24
  )
  if (bottomY <= thirdBox.y + thirdBox.height) {
    throw new Error("The document has no trailing selection space")
  }
  await page.mouse.move(firstBox.x + 80, bottomY)
  await expect(stage).toHaveAttribute("data-block-marquee-zone", "bottom")
  await page.mouse.down()
  await page.mouse.move(firstBox.x + 120, secondBox.y + 2, { steps: 12 })
  await expect(page.locator(".eme-block-marquee")).toBeVisible()
  await expect(editor.locator("[data-block-selected='true']")).toHaveCount(2)
  await page.mouse.up()
  await page.keyboard.press("Escape")
  await expect(editor.locator("[data-block-selected='true']")).toHaveCount(0)
})

test("SEL-004 keeps offscreen blocks selected while marquee auto-scrolls", async ({
  page,
}) => {
  const documentValue = [
    "# Long marquee",
    ...Array.from({ length: 80 }, (_, index) => `Block ${index + 1}.`),
  ].join("\n\n")
  await openMarkdown(page, documentValue)

  const editor = page.getByLabel("Markdown playground editor")
  const stage = page.locator(".eme-editor-stage")
  const first = editor.locator(".eme-paragraph").first()
  const rootBox = await editor.boundingBox()
  const stageBox = await stage.boundingBox()
  const firstBox = await first.boundingBox()
  if (!rootBox || !stageBox || !firstBox) {
    throw new Error("Long marquee endpoints are not visible")
  }

  const startX = rootBox.x + (firstBox.x - rootBox.x) / 2
  await page.mouse.move(startX, firstBox.y - 2)
  await expect(stage).toHaveAttribute("data-block-marquee-zone", "left")
  await page.mouse.down()
  await page.mouse.move(
    rootBox.x + rootBox.width - 12,
    stageBox.y + stageBox.height - 6,
    { steps: 20 }
  )

  await expect
    .poll(() => stage.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(300)
  await expect
    .poll(() => editor.locator("[data-block-selected='true']").count())
    .toBeGreaterThan(12)
  await expect(first).toHaveAttribute("data-block-selected", "true")
  await expect
    .poll(() => page.evaluate(() => document.getSelection()?.toString() ?? ""))
    .toBe("")

  await page.mouse.up()
  const stoppedAt = await stage.evaluate((element) => element.scrollTop)
  await page.waitForTimeout(100)
  await expect(stage).toHaveJSProperty("scrollTop", stoppedAt)
})

test("SEL-004 embedded layout uses the full stage as its side selection surface", async ({
  page,
}) => {
  await openMarkdown(
    page,
    "# Embedded marquee\n\nFirst block.\n\nSecond block.\n\nThird block."
  )

  const editorShell = page.locator('[data-markdown-editor="wysiwyg"]')
  await editorShell.evaluate((element) => {
    element.setAttribute("data-layout", "embedded")
  })

  const editor = page.getByLabel("Markdown playground editor")
  const stage = page.locator(".eme-editor-stage")
  const first = editor.locator(".eme-paragraph").nth(0)
  const second = editor.locator(".eme-paragraph").nth(1)
  const stageBox = await stage.boundingBox()
  const rootBox = await editor.boundingBox()
  const firstBox = await first.boundingBox()
  const secondBox = await second.boundingBox()
  if (!stageBox || !rootBox || !firstBox || !secondBox) {
    throw new Error("Embedded marquee geometry is unavailable")
  }

  expect(rootBox.width).toBeCloseTo(760, 0)
  expect(stageBox.width - rootBox.width).toBeGreaterThan(200)
  expect(
    Math.abs(rootBox.x + rootBox.width / 2 - (stageBox.x + stageBox.width / 2))
  ).toBeLessThan(1)

  const selectFromSide = async (side: "left" | "right") => {
    const x = side === "left" ? stageBox.x + 8 : stageBox.x + stageBox.width - 8
    await page.mouse.move(x, firstBox.y + 2)
    await expect(stage).toHaveAttribute("data-block-marquee-zone", side)
    await page.mouse.down()
    await page.mouse.move(firstBox.x + 80, secondBox.y + secondBox.height + 2, {
      steps: 18,
    })
    await expect(page.locator(".eme-block-marquee")).toBeVisible()
    await expect(editor.locator("[data-block-selected='true']")).toHaveCount(2)
    await page.mouse.up()
  }

  await selectFromSide("left")
  await page.keyboard.press("Escape")
  await expect(editor.locator("[data-block-selected='true']")).toHaveCount(0)
  await selectFromSide("right")
})

test("CRT-001 keeps the gutter plus beside the block and inserts below", async ({
  page,
}) => {
  await openMarkdown(page, "# Keep this heading\n\nFollowing paragraph.")

  const editor = page.getByLabel("Markdown playground editor")
  const heading = editor.locator(".eme-heading-h1")
  await heading.click()
  await page.keyboard.press("End")

  const addBelow = page.getByRole("button", { name: "Add block below" })
  const dragHandle = page.getByRole("button", { name: "Drag block" })
  await expect(addBelow).toBeVisible()
  const headingBox = await heading.boundingBox()
  const triggerBox = await addBelow.boundingBox()
  const handleBox = await dragHandle.boundingBox()
  if (!headingBox || !triggerBox || !handleBox) {
    throw new Error("Gutter insertion geometry is unavailable")
  }
  expect(Math.abs(triggerBox.y - headingBox.y)).toBeLessThan(1)
  expect(Math.abs(handleBox.y - headingBox.y)).toBeLessThan(1)
  expect(handleBox.x).toBeGreaterThan(triggerBox.x)
  expect(handleBox.x - (triggerBox.x + triggerBox.width)).toBeLessThanOrEqual(3)
  const gutterGap = headingBox.x - (handleBox.x + handleBox.width)
  expect(gutterGap).toBeGreaterThanOrEqual(2)
  expect(gutterGap).toBeLessThanOrEqual(6)

  await addBelow.click()
  const menuBox = await page.locator(".eme-insert-menu").boundingBox()
  if (!menuBox) throw new Error("Insert menu geometry is unavailable")
  expect(
    Math.abs(menuBox.x - (handleBox.x + handleBox.width))
  ).toBeLessThanOrEqual(1)
  const search = page.getByRole("combobox", { name: "Filter blocks" })
  await search.fill("h2")
  await search.press("Enter")
  await page.keyboard.type("Added below")

  await expect(
    page.getByRole("heading", { level: 1, name: "Keep this heading" })
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { level: 2, name: "Added below" })
  ).toBeVisible()
  await expect
    .poll(() => currentMarkdown(page))
    .toBe("# Keep this heading\n\n## Added below\n\nFollowing paragraph.")
})

test("SEL-009 reorders top-level blocks from the gutter handle and undoes once", async ({
  page,
}) => {
  const original = "# First block\n\nSecond block.\n\n> Third block."
  await openMarkdown(page, original)

  const editor = page.getByLabel("Markdown playground editor")
  const first = editor.locator(".eme-heading-h1")
  const third = editor.locator(".eme-quote")
  await first.hover()
  const addBelow = page.getByRole("button", { name: "Add block below" })
  const dragHandle = page.getByRole("button", { name: "Drag block" })
  await expect(dragHandle).toBeVisible()

  const addBox = await addBelow.boundingBox()
  const handleBox = await dragHandle.boundingBox()
  const targetBox = await third.boundingBox()
  if (!addBox || !handleBox || !targetBox) {
    throw new Error("Block drag geometry is unavailable")
  }
  expect(handleBox.x).toBeGreaterThan(addBox.x)
  expect(handleBox.x - (addBox.x + addBox.width)).toBeLessThanOrEqual(3)

  await page.mouse.move(
    handleBox.x + handleBox.width / 2,
    handleBox.y + handleBox.height / 2
  )
  await page.mouse.down()
  await page.mouse.move(
    targetBox.x + targetBox.width / 2,
    targetBox.y + targetBox.height - 2,
    { steps: 18 }
  )
  await expect(page.locator(".eme-block-drop-indicator")).toBeVisible()
  await expect(first).toHaveClass(/eme-block-dragging/u)
  await page.mouse.up()

  await expect
    .poll(() => currentMarkdown(page))
    .toBe("Second block.\n\n> Third block.\n\n# First block")
  await dragHandle.press(process.platform === "darwin" ? "Meta+z" : "Control+z")
  await expect.poll(() => currentMarkdown(page)).toBe(original)

  await page.reload()
  const second = editor.locator(".eme-paragraph").first()
  await second.click()
  await dragHandle.focus()
  await dragHandle.press("Alt+ArrowDown")
  await expect
    .poll(() => currentMarkdown(page))
    .toBe("# First block\n\n> Third block.\n\nSecond block.")
  await dragHandle.press(process.platform === "darwin" ? "Meta+z" : "Control+z")
  await expect.poll(() => currentMarkdown(page)).toBe(original)
})

test("SEL-009 drags the block under the handle instead of the caret block", async ({
  page,
}) => {
  await openMarkdown(
    page,
    "# Cursor block\n\nDrag this paragraph.\n\n> Last block."
  )

  const editor = page.getByLabel("Markdown playground editor")
  const heading = editor.locator(".eme-heading-h1")
  const paragraph = editor.locator(".eme-paragraph").first()
  const last = editor.locator(".eme-quote")
  await heading.click()
  await page.keyboard.press("End")
  await paragraph.hover()

  const dragHandle = page.getByRole("button", { name: "Drag block" })
  const handleBox = await dragHandle.boundingBox()
  const paragraphBox = await paragraph.boundingBox()
  const targetBox = await last.boundingBox()
  if (!handleBox || !paragraphBox || !targetBox) {
    throw new Error("Block drag target geometry is unavailable")
  }
  expect(Math.abs(handleBox.y - paragraphBox.y)).toBeLessThan(1)

  await page.mouse.move(
    handleBox.x + handleBox.width / 2,
    handleBox.y + handleBox.height / 2
  )
  await page.mouse.down()
  await page.mouse.move(
    targetBox.x + targetBox.width / 2,
    targetBox.y + targetBox.height - 2,
    { steps: 18 }
  )
  await expect(paragraph).toHaveClass(/eme-block-dragging/u)
  await expect(heading).not.toHaveClass(/eme-block-dragging/u)
  await page.mouse.up()

  await expect
    .poll(() => currentMarkdown(page))
    .toBe("# Cursor block\n\n> Last block.\n\nDrag this paragraph.")

  await dragHandle.press(process.platform === "darwin" ? "Meta+z" : "Control+z")
  await expect
    .poll(() => currentMarkdown(page))
    .toBe("# Cursor block\n\nDrag this paragraph.\n\n> Last block.")

  await heading.click()
  await page.keyboard.press("End")
  await paragraph.hover()
  await dragHandle.focus()
  await dragHandle.press("Alt+ArrowDown")
  await expect
    .poll(() => currentMarkdown(page))
    .toBe("# Cursor block\n\n> Last block.\n\nDrag this paragraph.")
})

test("SEL-009 keeps footnote definitions as a non-sortable document tail", async ({
  page,
}) => {
  const original = "First[^n].\n\nTail paragraph.\n\n[^n]: Footnote body."
  await openMarkdown(page, original)

  const editor = page.getByLabel("Markdown playground editor")
  const footnote = editor.locator(".eme-efm-footnote-definition")
  await footnote.hover({ position: { x: 12, y: 12 } })
  await expect(
    page.getByRole("button", { name: "Add block below" })
  ).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Drag block" })).toHaveCount(0)

  const tail = editor.locator(".eme-paragraph").nth(1)
  await tail.hover()
  const dragHandle = page.getByRole("button", { name: "Drag block" })
  await dragHandle.focus()
  await dragHandle.press("Alt+ArrowDown")
  await expect.poll(() => currentMarkdown(page)).toBe(original)

  const first = editor.locator(".eme-paragraph").first()
  await first.hover()
  const handleBox = await dragHandle.boundingBox()
  const footnoteBox = await footnote.boundingBox()
  if (!handleBox || !footnoteBox) {
    throw new Error("Footnote tail drag geometry is unavailable")
  }

  await page.mouse.move(
    handleBox.x + handleBox.width / 2,
    handleBox.y + handleBox.height / 2
  )
  await page.mouse.down()
  await page.mouse.move(
    footnoteBox.x + footnoteBox.width / 2,
    footnoteBox.y + footnoteBox.height - 2,
    { steps: 18 }
  )
  await expect(page.locator(".eme-block-drop-indicator")).toBeVisible()
  await page.mouse.up()

  await expect
    .poll(() => currentMarkdown(page))
    .toBe("Tail paragraph.\n\nFirst[^n].\n\n[^n]: Footnote body.")
})

test("KEY-001 KEY-002 reorders a list item with its subtree and undoes once", async ({
  page,
}) => {
  const original = [
    "- Alpha",
    "    - Alpha one",
    "    - Alpha two",
    "- Bravo",
    "    - Bravo child",
    "- Charlie",
  ].join("\n")
  await openMarkdown(page, original)

  const editor = page.getByLabel("Markdown playground editor")
  await editor.getByText("Alpha", { exact: true }).click()
  await page.keyboard.press("Alt+ArrowDown")

  await expect
    .poll(() => currentMarkdown(page))
    .toBe(
      [
        "- Bravo",
        "    - Bravo child",
        "- Alpha",
        "    - Alpha one",
        "    - Alpha two",
        "- Charlie",
      ].join("\n")
    )
  await expect
    .poll(() =>
      page.evaluate(() => window.getSelection()?.anchorNode?.textContent ?? "")
    )
    .toContain("Alpha")

  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+z" : "Control+z"
  )
  await expect.poll(() => currentMarkdown(page)).toBe(original)
  const topLevelItems = editor
    .locator(".eme-list-unordered")
    .first()
    .locator(":scope > .eme-list-item:not(.eme-nested-list-item)")
  await expect(topLevelItems).toHaveText(["Alpha", "Bravo", "Charlie"])
})

test("KEY-001 reorders a nested list item only among its siblings", async ({
  page,
}) => {
  const original = [
    "- Alpha",
    "    - Alpha one",
    "    - Alpha two",
    "- Bravo",
    "    - Bravo child",
    "- Charlie",
  ].join("\n")
  await openMarkdown(page, original)

  const editor = page.getByLabel("Markdown playground editor")
  await editor
    .getByText("Alpha one", { exact: true })
    .click({ position: { x: 8, y: 8 } })
  await expect
    .poll(() =>
      page.evaluate(() => window.getSelection()?.anchorNode?.textContent ?? "")
    )
    .toContain("Alpha one")
  await page.keyboard.press("Alt+ArrowDown")
  await expect
    .poll(() => currentMarkdown(page))
    .toBe(
      [
        "- Alpha",
        "    - Alpha two",
        "    - Alpha one",
        "- Bravo",
        "    - Bravo child",
        "- Charlie",
      ].join("\n")
    )

  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+z" : "Control+z"
  )
  await expect.poll(() => currentMarkdown(page)).toBe(original)
})

test("KEY-005 toggles the current checklist item with Mod+Enter", async ({
  page,
}) => {
  const original = "- [ ] Todo\n- [x] Done"
  await openMarkdown(page, original)

  const todo = page.getByRole("checkbox", { name: "Todo" })
  await todo.getByText("Todo", { exact: true }).click()
  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+Enter" : "Control+Enter"
  )

  await expect(todo).toHaveAttribute("aria-checked", "true")
  await expect.poll(() => currentMarkdown(page)).toBe("- [x] Todo\n- [x] Done")

  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+z" : "Control+z"
  )
  await expect.poll(() => currentMarkdown(page)).toBe(original)
})

test("SEL-009 auto-scrolls long documents while dragging a block", async ({
  page,
}) => {
  const original = Array.from(
    { length: 70 },
    (_, index) => `Drag block ${index + 1}.`
  ).join("\n\n")
  await openMarkdown(page, original)

  const editor = page.getByLabel("Markdown playground editor")
  const stage = page.locator(".eme-editor-stage")
  await editor.locator(".eme-paragraph").first().click()
  const dragHandle = page.getByRole("button", { name: "Drag block" })
  const handleBox = await dragHandle.boundingBox()
  const stageBox = await stage.boundingBox()
  if (!handleBox || !stageBox) {
    throw new Error("Long block drag geometry is unavailable")
  }

  await page.mouse.move(
    handleBox.x + handleBox.width / 2,
    handleBox.y + handleBox.height / 2
  )
  await page.mouse.down()
  await page.mouse.move(
    stageBox.x + stageBox.width / 2,
    stageBox.y + stageBox.height - 4,
    { steps: 18 }
  )
  await expect
    .poll(() => stage.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(200)
  await expect(page.locator(".eme-block-drop-indicator")).toBeVisible()
  await page.mouse.up()

  await expect.poll(() => currentMarkdown(page)).not.toBe(original)
  await dragHandle.press(process.platform === "darwin" ? "Meta+z" : "Control+z")
  await expect.poll(() => currentMarkdown(page)).toBe(original)
})

test("CRT-003 CRT-006 creates native and placeholder EFM blocks without source mode", async ({
  page,
}) => {
  await openMarkdown(page, "# Insertions\n\nStart here.")

  const editor = page.locator('[data-markdown-editor="wysiwyg"]')
  const paragraph = editor.locator(".eme-paragraph").last()
  await paragraph.click()
  await page.keyboard.press("End")

  const insertBlock = page.getByRole("button", { name: "Add block below" })
  await insertBlock.click()
  await page.getByRole("option", { name: /Document properties/u }).click()
  await page
    .getByLabel("Properties (YAML)")
    .fill("title: Created visually\nstatus: draft")
  await page.getByRole("button", { name: "Insert", exact: true }).click()
  await expect(editor.locator(".eme-efm-frontmatter")).toContainText(
    "Created visually"
  )

  await insertBlock.click()
  await expect(
    page.getByRole("option", { name: /Document properties/u })
  ).toBeDisabled()
  await page.getByRole("option", { name: /Block equation/u }).click()
  const mathPlaceholder = editor.getByRole("button", {
    name: "Add a TeX equation",
  })
  await expect(mathPlaceholder).toBeVisible()
  await expect.poll(() => currentMarkdown(page)).toContain("$$\n\n$$")
  await page.getByLabel("Edit block equation").press("Escape")
  await expect(page.getByLabel("Edit block equation")).toHaveCount(0)
  await expect(mathPlaceholder).toBeVisible()
  await mathPlaceholder.click()
  await page.getByLabel("Edit block equation").fill("a^2 + b^2 = c^2")
  await page.getByRole("button", { name: "Done", exact: true }).click()
  await expect(editor.locator(".eme-efm-math-display")).toHaveAttribute(
    "data-efm-math-source",
    "a^2 + b^2 = c^2"
  )

  await editor.locator(".eme-paragraph").last().click()
  await insertBlock.click()
  await page.getByRole("option", { name: /Image/u }).click()
  const imagePlaceholder = editor.getByRole("button", {
    name: "Add an image",
  })
  await expect(imagePlaceholder).toBeVisible()
  await expect.poll(() => currentMarkdown(page)).toContain("![]()")
  await page.getByLabel("Image URL").press("Escape")
  await expect(page.getByLabel("Image URL")).toHaveCount(0)
  await expect(imagePlaceholder).toBeVisible()
  await imagePlaceholder.click()
  await page
    .getByLabel("Image URL")
    .fill("https://editor.eidos.space/eidos-file-icon-192.png")
  await page.getByLabel("Description").fill("Created image")
  await page.getByRole("button", { name: "Done", exact: true }).click()
  await expect(editor.locator('img[alt="Created image"]')).toHaveCount(1)

  await editor.locator(".eme-paragraph").last().click()
  await insertBlock.click()
  await page.getByRole("option", { name: /Footnote/u }).click()
  await page.getByLabel("Footnote text").fill("Created footnote body.")
  await page.getByRole("button", { name: "Insert", exact: true }).click()
  await expect(editor.locator(".eme-efm-footnote-reference")).toHaveText("1")
  await expect(editor.locator(".eme-efm-footnote-definition")).toContainText(
    "Created footnote body."
  )

  await expect
    .poll(() => currentMarkdown(page))
    .toMatch(/title: Created visually/u)
  await expect
    .poll(() => currentMarkdown(page))
    .toMatch(/\$\$\na\^2 \+ b\^2 = c\^2\n\$\$/u)
  await expect.poll(() => currentMarkdown(page)).toMatch(/!\[Created image\]/u)
  await expect
    .poll(() => currentMarkdown(page))
    .toMatch(/\[\^note\]: Created footnote body\./u)
})

test("CRT-003 filters the slash insert menu as a keyboard list", async ({
  page,
}) => {
  await page.goto("/")
  const heading = page
    .getByLabel("Markdown playground editor")
    .locator(".eme-heading-h1")
    .first()
  await heading.click()
  await page.keyboard.press("End")
  await page.keyboard.press("Enter")
  await page.keyboard.type("/")

  const menu = page.getByRole("dialog", { name: "Insert block" })
  const search = page.getByRole("combobox", { name: "Filter blocks" })
  await expect(menu).toBeVisible()
  await expect(search).toBeFocused()
  await expect(menu.locator('[data-layout="list"]')).toHaveAttribute(
    "role",
    "listbox"
  )
  await expect(search).toHaveAttribute("aria-activedescendant", /option-/u)
  await expect(page.getByRole("option").first()).toHaveAttribute(
    "aria-selected",
    "true"
  )

  const [firstItemBox, secondItemBox] = await page
    .getByRole("option")
    .evaluateAll((elements) =>
      elements.slice(0, 2).map((element) => {
        const rect = element.getBoundingClientRect()
        return { x: rect.x, y: rect.y }
      })
    )
  if (!firstItemBox || !secondItemBox) {
    throw new Error("Insert menu list items are not visible")
  }
  expect(Math.abs(firstItemBox.x - secondItemBox.x)).toBeLessThan(1)
  expect(secondItemBox.y).toBeGreaterThan(firstItemBox.y)

  await search.fill("missing block type")
  await expect(menu.getByRole("status")).toHaveText("No matching blocks")
  await expect(page.getByRole("option")).toHaveCount(0)

  await search.fill("h3")
  await expect(page.getByRole("option")).toHaveCount(1)
  await expect(page.getByRole("option", { name: /Heading 3/u })).toBeVisible()
  await search.press("Enter")
  await expect(menu).toBeHidden()
  await page.keyboard.type("Created with slash")
  await expect(
    page.getByRole("heading", { level: 3, name: "Created with slash" })
  ).toBeVisible()
})

test("CRT-003 keeps keyboard navigation authoritative while the pointer rests over the menu", async ({
  page,
}) => {
  await openMarkdown(page, "Start")

  await page
    .getByLabel("Markdown playground editor")
    .locator(".eme-paragraph")
    .first()
    .click()
  await page.getByRole("button", { name: "Add block below" }).click()

  const options = page.getByRole("option")
  const hoveredOption = page.getByRole("option", { name: /^Numbered list/u })
  await hoveredOption.hover()
  await expect(hoveredOption).toHaveAttribute("aria-selected", "true")

  const optionCount = await options.count()
  const hoveredIndex = await options.evaluateAll(
    (elements, hoveredId) =>
      elements.findIndex((element) => element.id === hoveredId),
    await hoveredOption.getAttribute("id")
  )
  await page.keyboard.press("ArrowDown")
  const keyboardOption = options.nth(hoveredIndex + 1)
  await expect(keyboardOption).toHaveAttribute("aria-selected", "true")

  await hoveredOption.evaluate((element) => {
    element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }))
  })
  await expect(keyboardOption).toHaveAttribute("aria-selected", "true")
  await expect(hoveredOption).toHaveCSS("background-color", "rgba(0, 0, 0, 0)")

  for (let index = hoveredIndex + 2; index < optionCount; index += 1) {
    await page.keyboard.press("ArrowDown")
  }

  await expect(options.last()).toHaveAttribute("aria-selected", "true")

  const pointerTarget = page.getByRole("option", { name: /^Block equation/u })
  await pointerTarget.hover()
  await expect(pointerTarget).toHaveAttribute("aria-selected", "true")
})

test("keeps insert menu surfaces readable when a dark host token is missing", async ({
  page,
}) => {
  await openMarkdown(page, "# Dark menu\n\nBody")

  const editorShell = page.locator('[data-markdown-editor="wysiwyg"]')
  await editorShell.evaluate((element) => {
    element.setAttribute("data-theme", "dark")
    element.style.setProperty("--background", "oklch(0.21 0.014 255)")
    element.style.setProperty("--foreground", "oklch(0.92 0.01 255)")
    element.style.setProperty("--muted", "var(--missing-muted-token)")
    element.style.setProperty("--muted-foreground", "oklch(0.69 0.02 255)")
    element.style.setProperty("--accent", "oklch(0.31 0.025 255)")
    element.style.setProperty("--border", "oklch(0.34 0.017 255)")
    element.style.setProperty("--ring", "oklch(0.69 0.1 255)")
  })

  const heading = page.getByLabel("Markdown playground editor").locator("h1")
  await heading.click()
  await page.getByRole("button", { name: "Add block below" }).click()

  const contrast = await page
    .locator(".eme-insert-menu-section button[data-selected='true']")
    .evaluate((button) => {
      const canvas = document.createElement("canvas")
      canvas.width = 1
      canvas.height = 1
      const context = canvas.getContext("2d", { willReadFrequently: true })
      if (!context) throw new Error("Canvas context is unavailable")
      const luminance = (color: string) => {
        context.clearRect(0, 0, 1, 1)
        context.fillStyle = color
        context.fillRect(0, 0, 1, 1)
        const channels = Array.from(
          context.getImageData(0, 0, 1, 1).data.slice(0, 3)
        ).map((channel) => {
          const value = channel / 255
          return value <= 0.04045
            ? value / 12.92
            : ((value + 0.055) / 1.055) ** 2.4
        })
        return (
          0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!
        )
      }
      const style = getComputedStyle(button)
      const foreground = luminance(style.color)
      const background = luminance(style.backgroundColor)
      return {
        background,
        ratio:
          (Math.max(foreground, background) + 0.05) /
          (Math.min(foreground, background) + 0.05),
      }
    })

  expect(contrast.background).toBeLessThan(0.2)
  expect(contrast.ratio).toBeGreaterThanOrEqual(4.5)
})

test("renders newly inserted embedded tables as a compact grid", async ({
  page,
}) => {
  await openMarkdown(page, "Start")

  const editor = page.locator('[data-markdown-editor="wysiwyg"]')
  await editor.evaluate((element) => {
    element.setAttribute("data-layout", "embedded")
  })
  await editor.locator(".eme-paragraph").first().click()
  await page.getByRole("button", { name: "Add block below" }).click()
  await page.getByRole("option", { name: /^Table/u }).click()

  const table = editor.locator(".eme-table")
  await expect(table).toBeVisible()
  const geometry = await table.evaluate((element) => ({
    cellBorders: Array.from(
      element.querySelectorAll<HTMLElement>(".eme-table-cell")
    ).map((cell) => ({
      bottom: getComputedStyle(cell).borderBottomStyle,
      bottomWidth: getComputedStyle(cell).borderBottomWidth,
      left: getComputedStyle(cell).borderLeftStyle,
      leftWidth: getComputedStyle(cell).borderLeftWidth,
      right: getComputedStyle(cell).borderRightStyle,
      rightWidth: getComputedStyle(cell).borderRightWidth,
      top: getComputedStyle(cell).borderTopStyle,
      topWidth: getComputedStyle(cell).borderTopWidth,
    })),
    height: element.getBoundingClientRect().height,
    paragraphMargins: Array.from(
      element.querySelectorAll<HTMLElement>(".eme-table-cell > .eme-paragraph")
    ).map((paragraph) => ({
      bottom: getComputedStyle(paragraph).marginBottom,
      top: getComputedStyle(paragraph).marginTop,
    })),
    rowHeights: Array.from(element.querySelectorAll("tr")).map(
      (row) => row.getBoundingClientRect().height
    ),
  }))

  expect(geometry.rowHeights).toHaveLength(3)
  expect(Math.max(...geometry.rowHeights)).toBeLessThan(56)
  expect(geometry.height).toBeLessThan(168)
  expect(geometry.cellBorders).toEqual(
    Array.from({ length: 9 }, () => ({
      bottom: "solid",
      bottomWidth: "1px",
      left: "solid",
      leftWidth: "1px",
      right: "solid",
      rightWidth: "1px",
      top: "solid",
      topWidth: "1px",
    }))
  )
  expect(geometry.paragraphMargins).toEqual(
    Array.from({ length: 9 }, () => ({ bottom: "0px", top: "0px" }))
  )
})

test("keeps embedded block typography aligned with document mode", async ({
  page,
}) => {
  await openMarkdown(
    page,
    `Intro

## Heading

Paragraph with **bold** and \`code\`.

> Quote

- List item

\`\`\`ts
const ready = true
\`\`\`

| A | B |
| --- | --- |
| 1 | 2 |`
  )

  const styles = await page
    .locator('[data-markdown-editor="wysiwyg"]')
    .evaluate((editor) => {
      const selectors = [
        ".eme-paragraph",
        ".eme-heading-h2",
        ".eme-text-bold",
        ".eme-inline-code",
        ".eme-quote",
        ".eme-list",
        ".eme-list-item",
        ".eme-code-block",
        ".eme-table",
        ".eme-table-cell",
        ".eme-table-cell-header",
      ]
      const snapshot = () =>
        Object.fromEntries(
          selectors.map((selector) => {
            const element = editor.querySelector<HTMLElement>(selector)
            if (!element) throw new Error(`Missing ${selector}`)
            const style = getComputedStyle(element)
            return [
              selector,
              {
                backgroundColor: style.backgroundColor,
                borderBottom: style.borderBottom,
                borderLeft: style.borderLeft,
                borderRadius: style.borderRadius,
                borderRight: style.borderRight,
                borderTop: style.borderTop,
                color: style.color,
                fontSize: style.fontSize,
                fontWeight: style.fontWeight,
                letterSpacing: style.letterSpacing,
                lineHeight: style.lineHeight,
                marginBottom: style.marginBottom,
                marginLeft: style.marginLeft,
                marginRight: style.marginRight,
                marginTop: style.marginTop,
                paddingBottom: style.paddingBottom,
                paddingLeft: style.paddingLeft,
                paddingRight: style.paddingRight,
                paddingTop: style.paddingTop,
              },
            ]
          })
        )

      editor.setAttribute("data-layout", "document")
      const document = snapshot()
      editor.setAttribute("data-layout", "embedded")
      return { document, embedded: snapshot() }
    })

  expect(styles.embedded).toEqual(styles.document)
})

test("keeps the embedded empty placeholder aligned with the content column", async ({
  page,
}) => {
  await openMarkdown(page, "")

  const editorShell = page.locator('[data-markdown-editor="wysiwyg"]')
  await editorShell.evaluate((element) => {
    element.setAttribute("data-layout", "embedded")
  })

  const geometry = await page
    .getByLabel("Markdown playground editor")
    .evaluate((editor) => {
      const placeholder =
        editor.parentElement?.querySelector<HTMLElement>(".eme-placeholder")
      if (!placeholder) throw new Error("Empty placeholder is missing")
      const editorRect = editor.getBoundingClientRect()
      const placeholderRect = placeholder.getBoundingClientRect()
      return {
        editor: {
          left: editorRect.left,
          top: editorRect.top,
          width: editorRect.width,
        },
        placeholder: {
          left: placeholderRect.left,
          top: placeholderRect.top,
          width: placeholderRect.width,
        },
      }
    })

  expect(geometry.placeholder.left).toBeCloseTo(geometry.editor.left, 0)
  expect(geometry.placeholder.top).toBeCloseTo(geometry.editor.top, 0)
  expect(geometry.placeholder.width).toBeCloseTo(geometry.editor.width, 0)
})

test("CRT-007 inserts inline commands from a caret-anchored slash menu", async ({
  page,
}) => {
  await openMarkdown(page, "Before  after.")
  const paragraph = page
    .getByLabel("Markdown playground editor")
    .locator(".eme-paragraph")
    .first()
  const caret = await paragraph.evaluate((element) => {
    const text = element.querySelector("[data-lexical-text='true']")?.firstChild
    if (!(text instanceof Text)) throw new Error("Paragraph text is missing")
    const offset = text.data.indexOf("  ") + 1
    const editable = element.closest<HTMLElement>("[contenteditable='true']")
    editable?.focus()
    const range = document.createRange()
    range.setStart(text, offset)
    range.collapse(true)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    document.dispatchEvent(new Event("selectionchange"))
    const rect = range.getBoundingClientRect()
    return { bottom: rect.bottom, left: rect.left }
  })

  await page.keyboard.type("/")
  const menu = page.getByRole("dialog", { name: "Insert inline" })
  const search = page.getByRole("combobox", {
    name: "Filter inline commands",
  })
  await expect(menu).toBeVisible()
  await expect(menu).toHaveAttribute("data-context", "inline")
  await expect(search).toBeFocused()
  await expect(page.getByRole("option")).toHaveCount(2)
  await expect(
    page.getByRole("option", { name: "Inline equation" })
  ).toBeVisible()
  await expect(page.getByRole("option", { name: "Footnote" })).toBeVisible()
  await expect(page.getByRole("option", { name: "Image" })).toHaveCount(0)
  await expect(page.getByRole("option", { name: /Heading/u })).toHaveCount(0)

  const menuBox = await menu.boundingBox()
  if (!menuBox) throw new Error("Inline insertion menu is not visible")
  expect(Math.abs(menuBox.x - caret.left)).toBeLessThan(2)
  expect(Math.abs(menuBox.y - (caret.bottom + 8))).toBeLessThan(2)

  await search.press("Escape")
  await expect(menu).toBeHidden()
  await expect.poll(() => currentMarkdown(page)).toBe("Before  after.")

  await paragraph.evaluate((element) => {
    const text = element.querySelector("[data-lexical-text='true']")?.firstChild
    if (!(text instanceof Text)) throw new Error("Paragraph text is missing")
    const offset = text.data.indexOf("  ") + 1
    const editable = element.closest<HTMLElement>("[contenteditable='true']")
    editable?.focus()
    const range = document.createRange()
    range.setStart(text, offset)
    range.collapse(true)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    document.dispatchEvent(new Event("selectionchange"))
  })
  await page.keyboard.type("/")
  await page.getByRole("option", { name: "Inline equation" }).click()
  const formula = page.getByLabel("LaTeX")
  await expect(formula).toBeFocused()
  await formula.fill("e^{i\\pi} + 1 = 0")
  await formula.press("Enter")

  await expect(paragraph.locator(".eme-efm-inline-math")).toBeVisible()
  await expect
    .poll(() => currentMarkdown(page))
    .toBe("Before $e^{i\\pi} + 1 = 0$ after.")

  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+z" : "Control+z"
  )
  await expect.poll(() => currentMarkdown(page)).toBe("Before  after.")

  await paragraph.evaluate((element) => {
    const text = element.querySelector("[data-lexical-text='true']")?.firstChild
    if (!(text instanceof Text)) throw new Error("Paragraph text is missing")
    const offset = text.data.indexOf("  ") + 1
    const editable = element.closest<HTMLElement>("[contenteditable='true']")
    editable?.focus()
    const range = document.createRange()
    range.setStart(text, offset)
    range.collapse(true)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    document.dispatchEvent(new Event("selectionchange"))
  })
  await page.keyboard.type("/")
  await page.getByRole("option", { name: "Footnote" }).click()
  await page.getByLabel("Footnote text").fill("Inserted at the caret")
  await page.getByRole("button", { name: "Insert", exact: true }).click()

  await expect(paragraph.locator(".eme-efm-footnote-reference")).toBeVisible()
  await expect
    .poll(() => currentMarkdown(page))
    .toBe("Before [^note] after.\n\n[^note]: Inserted at the caret")

  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+z" : "Control+z"
  )
  await expect.poll(() => currentMarkdown(page)).toBe("Before  after.")
})

test("CRT-007 keeps slash literal inside ordinary text", async ({ page }) => {
  await openMarkdown(page, "path")
  const paragraph = page
    .getByLabel("Markdown playground editor")
    .locator(".eme-paragraph")
    .first()
  await paragraph.click()
  await page.keyboard.press("End")
  await page.keyboard.type("/file")

  await expect(page.getByRole("dialog", { name: "Insert inline" })).toHaveCount(
    0
  )
  await expect.poll(() => currentMarkdown(page)).toBe("path/file")
})

test("keeps long documents editable and scrollable", async ({ page }) => {
  const longDocument = Array.from(
    { length: 100 },
    (_, index) => `Scrollable paragraph ${index + 1}.`
  ).join("\n\n")
  await openMarkdown(page, longDocument)

  const canvas = page.getByLabel("Markdown playground editor")
  const stage = page.locator(".eme-editor-stage")
  await expect(canvas).toContainText("Scrollable paragraph 100.")
  const finalParagraph = canvas.locator(".eme-paragraph").last()
  await finalParagraph.click()
  await page.keyboard.press("End")
  await page.keyboard.insertText(" Edited.")
  await expect(finalParagraph).toContainText(
    "Scrollable paragraph 100. Edited."
  )
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

  const checkboxMarkerAlignment = await uncheckedItem.evaluate((element) => {
    const item = element.getBoundingClientRect()
    const itemStyle = getComputedStyle(element)
    const marker = getComputedStyle(element, "::before")
    const markerCenter =
      item.left +
      Number.parseFloat(marker.left) +
      Number.parseFloat(marker.width) / 2
    const markerSlotCenter =
      item.left + Number.parseFloat(itemStyle.paddingInlineStart) / 2
    return Math.abs(markerCenter - markerSlotCenter)
  })
  expect(checkboxMarkerAlignment).toBeLessThanOrEqual(1)

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
  const toggledItem = page.locator(".eme-list-item", {
    hasText: "Keep expanding compatibility coverage",
  })
  await expect(toggledItem).toBeFocused()
  await expect(toggledItem).toHaveCSS("outline-style", "none")
  await expect(toggledItem).toHaveClass(/eme-list-item-checked/u)

  await expect
    .poll(() => currentMarkdown(page))
    .toMatch(/- \[x\] Keep expanding compatibility coverage/u)
})

test("SEL-002 draws one checkbox per nested checklist item", async ({
  page,
}) => {
  await openMarkdown(
    page,
    "- [ ] Parent\n    - [ ] Child\n        - [ ] Grandchild"
  )

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

test("FID-001 SAF-001 renders EFM visually and source-preserving", async ({
  page,
}) => {
  await openMarkdown(
    page,
    `---
title: EFM safety
---

# Document

Formula $x^2$ has a note[^n].

$$
x^2 + y^2 = z^2
$$

[^n]: Footnote body.

[docs]: https://eidos.space "Eidos"

Read [Eidos][docs].

![Preview](/preview.png)

![Unsafe image](javascript:alert)

[Unsafe link](javascript:alert)

<mark>Rendered safe HTML</mark>

<script>window.__efmExecuted = true</script>
`
  )

  const editor = page.locator('[data-markdown-editor="wysiwyg"]')
  await expect(editor).toBeVisible()
  await expect(editor.locator(".eme-efm-frontmatter")).toContainText(
    "EFM safety"
  )
  await expect(editor.locator(".eme-efm-math-inline math")).toHaveCount(1)
  await expect(editor.locator(".eme-efm-math-display math")).toHaveCount(1)
  await expect(editor.locator(".eme-efm-footnote-reference")).toHaveText("1")
  await expect(editor.locator(".eme-efm-footnote-definition")).toContainText(
    "Footnote body."
  )
  await expect(editor.getByRole("link", { name: "Eidos" })).toHaveAttribute(
    "href",
    "https://eidos.space"
  )
  await expect(editor.locator(".eme-efm-image-unavailable")).toContainText(
    "Unsafe image"
  )
  await expect(editor.locator('img[alt="Preview"]')).toHaveCount(1)
  await expect(editor.locator(".eme-efm-html-preview mark")).toHaveText(
    "Rendered safe HTML"
  )
  await expect(editor.locator('[data-efm-source-kind="raw-html"]')).toHaveCount(
    1
  )
  await expect(editor.locator("script")).toHaveCount(0)
  await expect(editor.getByRole("link", { name: "Unsafe link" })).toHaveCount(0)
  await expect(editor).toContainText("[Unsafe link](javascript:alert)")
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { __efmExecuted?: boolean }).__efmExecuted
    )
  ).toBeUndefined()

  await expect.poll(() => currentMarkdown(page)).toMatch(/title: EFM safety/u)
  await expect.poll(() => currentMarkdown(page)).toMatch(/Formula \$x\^2\$/u)
  await expect
    .poll(() => currentMarkdown(page))
    .toMatch(/<script>window\.__efmExecuted/u)
})
