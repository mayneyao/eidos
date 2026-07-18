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

  await page.getByRole("tab", { name: "Indexes" }).click()
  await expect(page.getByText("entries_author_score_idx")).toBeVisible()
  await page.getByRole("tab", { name: "Foreign keys" }).click()
  await expect(page.getByText("references authors.code")).toBeVisible()

  await page.getByRole("button", { name: /entry_summary/ }).click()
  await expect(page.getByText("view · computed")).toBeVisible()
})
