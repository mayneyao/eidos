import { expect, test } from "@playwright/test"

test("root and old site routes open the same playground", async ({ page }) => {
  for (const path of [
    "/",
    "/playground",
    "/docs/api",
    "/spec",
    "/builder",
    "/zh/docs",
  ]) {
    await page.goto(path)
    await expect(page.locator(".eme-editor")).toBeVisible()
    await expect(page.locator(".playground-shell > header")).toHaveCount(1)
    await expect(page.locator(".playground-identity img")).toBeVisible()
    await expect(page.getByRole("navigation")).toHaveCount(0)
  }
})

test("minimal toolbar and theme preserve the source draft and read-only state", async ({
  page,
}) => {
  await page.goto("/")
  await expect(page.getByRole("button", { name: "切换到中文" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Load example" })).toHaveCount(
    0
  )
  await expect(
    page.locator(".playground-actions > :last-child")
  ).toHaveAttribute("aria-label", /Switch to .* theme/u)
  await page.getByRole("button", { name: "View source", exact: true }).click()
  await page
    .getByLabel("Markdown source", { exact: true })
    .fill("# 我的草稿\n\nHello")
  await page.getByRole("switch", { name: "Read only" }).check()
  await page.getByRole("button", { name: /Switch to .* theme/u }).click()
  await expect(page.getByLabel("Markdown source", { exact: true })).toHaveValue(
    "# 我的草稿\n\nHello"
  )
  await expect(
    page.getByLabel("Markdown source", { exact: true })
  ).toHaveAttribute("readonly", "")
  await expect(page.getByLabel("Markdown source", { exact: true })).toHaveValue(
    "# 我的草稿\n\nHello"
  )
})

test("Chinese toolbar fits narrow screens in both themes", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await page.goto("/zh")
  for (let i = 0; i < 2; i++) {
    expect(
      await page
        .locator(".playground-header")
        .evaluate((el) => el.scrollWidth <= el.clientWidth)
    ).toBe(true)
    await expect(
      page.getByRole("button", { name: "查看源码", exact: true })
    ).toBeVisible()
    await page.getByRole("button", { name: /切换到.*主题/u }).click()
  }
})
