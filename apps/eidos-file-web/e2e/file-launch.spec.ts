import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

import { expect, test } from "@playwright/test"

test("starts with a quiet file launcher without loading a sample", async ({
  page,
}, testInfo) => {
  const fixtureRequests: string[] = []
  page.on("request", (request) => {
    if (request.url().includes(".eidos")) fixtureRequests.push(request.url())
  })
  await page.goto("/")
  await expect(
    page.getByRole("heading", { name: "Eidos File", exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Open .eidos file", exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "New blank Eidos File", exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Try a sample", exact: true })
  ).toBeVisible()
  await expect(page.locator(".boot-loading")).toHaveCount(0)
  await expect(page.locator(".eidos-file-content")).toHaveCount(0)
  expect(fixtureRequests).toEqual([])
  await page.screenshot({ path: testInfo.outputPath("launcher-desktop.png") })

  await page.getByRole("button", { name: "File", exact: true }).click()
  const menu = page.getByRole("menu", { name: "File", exact: true })
  await expect(menu.getByRole("menuitem")).toHaveCount(5)
  await expect(menu).not.toContainText("template")
  await page.keyboard.press("Escape")

  await page.setViewportSize({ width: 320, height: 720 })
  await expect(
    page.getByRole("button", { name: "Open .eidos file", exact: true })
  ).toBeInViewport()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
  await page.screenshot({ path: testInfo.outputPath("launcher-mobile.png") })
})

for (const locale of ["en", "zh"] as const) {
  test(`opens a small editable ${locale} sample only on request`, async ({
    page,
    browserName,
  }, testInfo) => {
    await page.addInitScript((language) => {
      localStorage.setItem("eidos-file-locale", language)
      Object.defineProperty(window, "showSaveFilePicker", {
        configurable: true,
        value: undefined,
      })
    }, locale)
    await page.goto("/")
    await expect(page.locator(".file-launch")).toBeVisible()
    await page.screenshot({
      path: testInfo.outputPath(`launcher-${locale}.png`),
    })
    await page
      .getByRole("button", {
        name: locale === "zh" ? "试用示例" : "Try a sample",
        exact: true,
      })
      .click()
    await expect(page.locator(".file-identity strong")).toHaveText(
      locale === "zh" ? "示例.eidos" : "sample.eidos"
    )
    await expect(
      page.getByRole("tab", {
        name: locale === "zh" ? "待办事项" : "Tasks",
        exact: true,
      })
    ).toHaveAttribute("aria-selected", "true")
    await expect(page.locator("[data-testid='glide-cell-1-0']")).toContainText(
      locale === "zh" ? "双击单元格修改内容" : "Double-click a cell to edit"
    )
    await expect(page.locator("[data-testid='glide-cell-1-2']")).toContainText(
      locale === "zh" ? "保存你的文件" : "Save your file"
    )
    await expect(
      page
        .getByRole("tablist", { name: /Eidos File (tables|数据表)/ })
        .getByRole("tab")
    ).toHaveCount(1)
    await page.screenshot({ path: testInfo.outputPath(`sample-${locale}.png`) })

    // Exercise persistent recovery on Chromium; other engines may use the
    // existing in-memory fallback when the OPFS SQLite VFS is unavailable.
    if (browserName === "chromium") {
      await page.reload()
      await expect(page.locator(".file-identity strong")).toHaveText(
        locale === "zh" ? "示例.eidos" : "sample.eidos"
      )
      await expect(
        page.locator("[data-testid='glide-cell-1-2']")
      ).toContainText(locale === "zh" ? "保存你的文件" : "Save your file")
    }
    const downloadPromise = page.waitForEvent("download")
    await page
      .getByRole("button", {
        name: locale === "zh" ? "文件" : "File",
        exact: true,
      })
      .click()
    await page
      .getByRole("menuitem", {
        name: locale === "zh" ? "下载副本" : "Download a copy",
        exact: true,
      })
      .click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe(
      locale === "zh" ? "示例.eidos" : "sample.eidos"
    )
    await download.saveAs(testInfo.outputPath("sample.eidos"))
  })
}

test("opens a local file dropped onto the launcher", async ({ page }) => {
  const bytes = Array.from(
    await readFile(
      fileURLToPath(
        new URL("../fixtures/project-tracker.eidos", import.meta.url)
      )
    )
  )
  await page.goto("/")
  await expect(page.locator(".file-launch")).toBeVisible()
  const data = await page.evaluateHandle((contents) => {
    const transfer = new DataTransfer()
    transfer.items.add(
      new File([new Uint8Array(contents)], "project-tracker.eidos", {
        type: "application/vnd.eidos+sqlite3",
      })
    )
    return transfer
  }, bytes)
  await page
    .locator(".file-launch")
    .dispatchEvent("drop", { dataTransfer: data })
  await expect(
    page.getByRole("tab", { name: "Projects", exact: true })
  ).toHaveAttribute("aria-selected", "true")
  await expect(page.locator("[data-testid='glide-cell-1-0']")).toContainText(
    "Ship Eidos File Web Editor"
  )
})
