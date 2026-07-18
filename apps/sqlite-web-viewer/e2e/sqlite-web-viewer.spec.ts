import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

import { expect, test } from "@playwright/test"

const fixturePath = fileURLToPath(
  new URL("../fixtures/sqlite-viewer-fixture.eidos", import.meta.url)
)

test("opens a .eidos SQLite database and inspects data and metadata", async ({
  page,
}) => {
  await page.goto("/")
  await expect(
    page.getByRole("heading", { name: "See what is inside the database." })
  ).toBeVisible()
  await page.locator('input[type="file"]').setInputFiles(fixturePath)

  await expect(page.getByText("sqlite-viewer-fixture.eidos")).toBeVisible()
  await expect(page.getByText("Local only")).toBeVisible()
  await expect(page.getByText("Read-only")).toBeVisible()
  await expect(page.getByRole("button", { name: /authors/ })).toBeVisible()

  await page.getByRole("button", { name: /entries/ }).click()
  await expect(page.getByRole("heading", { name: "entries" })).toBeVisible()
  await expect(page.locator("canvas").first()).toBeVisible()
  await expect(page.getByText("rowid · rowid")).toBeVisible()

  const canvas = page.getByTestId("data-grid-canvas")
  const canvasBounds = await canvas.boundingBox()
  expect(canvasBounds).not.toBeNull()
  const rowidEdge = canvasBounds!.x + 36 + 96
  const headerCenter = canvasBounds!.y + 17
  const scroller = page.locator(".dvn-scroller")
  await page.mouse.move(rowidEdge, headerCenter)
  await expect
    .poll(() => scroller.evaluate((node) => node.style.cursor))
    .toBe("col-resize")
  await page.mouse.down()
  await page.mouse.move(rowidEdge + 64, headerCenter, { steps: 4 })
  await page.mouse.up()
  await page.mouse.move(rowidEdge, headerCenter)
  await expect
    .poll(() => scroller.evaluate((node) => node.style.cursor))
    .not.toBe("col-resize")
  await page.mouse.move(rowidEdge + 64, headerCenter)
  await expect
    .poll(() => scroller.evaluate((node) => node.style.cursor))
    .toBe("col-resize")

  const inspector = page.locator(".schema-inspector")
  const inspectorContent = page.locator(".inspector-content")
  const inspectorBounds = await inspector.boundingBox()
  const inspectorOverflow = await inspectorContent.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }))
  expect(inspectorBounds).not.toBeNull()
  expect(inspectorBounds!.x + inspectorBounds!.width).toBeLessThanOrEqual(
    await page.evaluate(() => window.innerWidth)
  )
  expect(inspectorOverflow.scrollWidth).toBeLessThanOrEqual(
    inspectorOverflow.clientWidth
  )

  await page.getByRole("tab", { name: "Indexes" }).click()
  await expect(page.getByText("entries_author_score_idx")).toBeVisible()
  await page.getByRole("tab", { name: "Foreign keys" }).click()
  await expect(page.getByText("references authors.code")).toBeVisible()

  await page.getByRole("button", { name: /entry_summary/ }).click()
  await expect(page.getByText("view · computed")).toBeVisible()
})

test("persists and opens a configured SQLite file suffix", async ({ page }) => {
  await page.goto("/")
  await page
    .getByRole("button", { name: "Configure SQLite file suffixes" })
    .click()
  await page.getByLabel("Add a file suffix").fill("anki2")
  await page.getByRole("button", { name: "Add", exact: true }).click()
  await expect(
    page.getByRole("button", { name: "Remove .anki2" })
  ).toBeVisible()
  await expect(page.locator('input[type="file"]')).toHaveAttribute(
    "accept",
    /\.anki2/
  )

  await page.reload()
  await page
    .getByRole("button", { name: "Configure SQLite file suffixes" })
    .click()
  await expect(
    page.getByRole("button", { name: "Remove .anki2" })
  ).toBeVisible()

  await page.locator('input[type="file"]').setInputFiles({
    buffer: await readFile(fixturePath),
    mimeType: "application/octet-stream",
    name: "configured.anki2",
  })
  await expect(page.getByText("configured.anki2")).toBeVisible()
  await expect(page.getByRole("button", { name: /entries/ })).toBeVisible()
})
