import { expect, test } from "@playwright/test"

test("HTML image height survives host image resets", async ({ page }) => {
  await page.route("https://assets.example/logo.svg", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300"><rect width="600" height="300" fill="gray"/></svg>',
    })
  )
  await page.addInitScript(() => {
    Object.assign(window, {
      __EIDOS_MARKDOWN_TEST_DOCUMENT__:
        '<div align="center"><picture><img src="https://assets.example/logo.svg" height="150" alt="Logo" /></picture></div>',
    })
  })
  await page.goto("/playground")
  await page.addStyleTag({ content: "img { height: auto; width: auto; }" })
  const image = page.getByAltText("Logo", { exact: true })
  await expect
    .poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth))
    .toBe(600)
  await expect(image).toHaveCSS("height", "150px")
  const box = await image.boundingBox()
  expect(box?.height).toBe(150)
  expect(box?.width).toBe(300)
})
