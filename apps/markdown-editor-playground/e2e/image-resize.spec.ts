import { expect, test, type Page } from "@playwright/test"

const source =
  '![Caption|400](https://images.test/photo.svg "Title")\n\nUnchanged paragraph.'
const markdown = (page: Page) =>
  page.evaluate(
    () =>
      (window as Window & { __EIDOS_MARKDOWN_TEST_VALUE__?: string })
        .__EIDOS_MARKDOWN_TEST_VALUE__
  )

test.beforeEach(async ({ page }) => {
  await page.route("https://images.test/photo.svg", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><rect width="800" height="400" fill="#507080"/></svg>',
    })
  )
  await page.addInitScript((value) => {
    ;(
      window as Window & { __EIDOS_MARKDOWN_TEST_DOCUMENT__?: string }
    ).__EIDOS_MARKDOWN_TEST_DOCUMENT__ = value
  }, source)
  await page.goto("/")
  await expect(page.locator(".eme-image-resize-handle")).toHaveCount(2)
})

test("image drag preserves ratio, saves width, and undoes as one operation", async ({
  page,
}) => {
  const image = page.locator(".eme-image-resize-frame img")
  await image.hover()
  const handle = page.getByRole("button", { name: "Resize image from right" })
  const box = (await handle.boundingBox())!
  await page.mouse.move(box.x + 10, box.y + 24)
  await page.mouse.down()
  await page.mouse.move(box.x - 40, box.y + 24, { steps: 5 })
  expect(await markdown(page)).toBe(source)
  await page.mouse.up()
  await expect.poll(() => markdown(page)).toBe(source.replace("|400", "|300"))
  expect((await image.boundingBox())!.width).toBeCloseTo(300, 0)
  expect((await image.boundingBox())!.height).toBeCloseTo(150, 0)
  await page.keyboard.press("ControlOrMeta+z")
  await expect.poll(() => markdown(page)).toBe(source)
  await page.getByRole("button", { name: "View source", exact: true }).click()
  await page
    .getByLabel("Markdown source", { exact: true })
    .fill(source.replace("|400", "|300"))
  await page.getByRole("button", { name: "View editor", exact: true }).click()
  await expect(image).toHaveAttribute("width", "300")
})

test("left handle cancels and keyboard resizing is disabled in read-only", async ({
  page,
}) => {
  await page.locator(".eme-image-resize-frame img").hover()
  const handle = page.getByRole("button", { name: "Resize image from left" })
  const box = (await handle.boundingBox())!
  await page.mouse.move(box.x + 10, box.y + 24)
  await page.mouse.down()
  await page.mouse.move(box.x + 50, box.y + 24, { steps: 4 })
  await page.keyboard.press("Escape")
  await page.mouse.up()
  expect(await markdown(page)).toBe(source)
  await handle.focus()
  await page.keyboard.press("ArrowRight")
  await expect.poll(() => markdown(page)).toBe(source.replace("|400", "|408"))
  await page.getByRole("switch", { name: "Read only" }).check()
  await expect(page.locator(".eme-image-resize-handle")).toHaveCount(0)
})

test("embedded images stay inside the column and pointer cancellation does not save", async ({
  page,
}) => {
  await page.goto("/?layout=embedded")
  const frame = page.locator(".eme-image-resize-frame")
  await frame.hover()
  const handle = page.getByRole("button", { name: "Resize image from right" })
  const box = (await handle.boundingBox())!
  await page.mouse.move(box.x + 10, box.y + 24)
  await page.mouse.down()
  await page.mouse.move(1430, box.y + 24)
  expect((await frame.boundingBox())!.width).toBeLessThanOrEqual(760)
  await handle.dispatchEvent("pointercancel")
  await page.mouse.up()
  expect(await markdown(page)).toBe(source)
  await page.getByRole("button", { name: /Switch to dark theme/ }).click()
  await frame.hover()
  await expect(handle).toHaveCSS("opacity", "1")
  await page.screenshot({ path: "/tmp/markdown-image-resize-dark.png" })
})

test("newly pasted images can be resized without reopening the document", async ({
  page,
}) => {
  const canvas = page.getByLabel("Markdown playground editor")
  await canvas.locator(".eme-paragraph").click()
  await canvas.evaluate((element) => {
    const png = atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    )
    const transfer = new DataTransfer()
    transfer.items.add(
      new File([Uint8Array.from(png, (c) => c.charCodeAt(0))], "resize.png", {
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
  const figure = page
    .locator("figure")
    .filter({ has: page.getByAltText("resize", { exact: true }) })
  const handle = figure.getByRole("button", { name: "Resize image from right" })
  await expect(handle).toHaveCount(1)
  await handle.focus()
  await page.keyboard.press("ArrowRight")
  await expect.poll(() => markdown(page)).toContain("![resize|48]")
})
