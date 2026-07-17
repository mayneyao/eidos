import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

import { expect, test, type Page } from "@playwright/test"

const fixturePath = fileURLToPath(
  new URL("../fixtures/project-tracker.base", import.meta.url)
)

interface BaseE2EHarness {
  appendExternalByte(): Promise<void>
  bytes(): Promise<number[]>
  failWrites(value: boolean): void
}

declare global {
  interface Window {
    __baseE2E?: BaseE2EHarness
  }
}

async function installDirectPicker(
  page: Page,
  options: { permission?: "granted" | "denied"; fileName?: string } = {}
): Promise<void> {
  const bytes = await readFile(fixturePath)
  const encoded = bytes.toString("base64")
  await page.addInitScript(
    async ({ base64, fileName, permission }) => {
      let failWrites = false
      const ready = (async () => {
        const root = await navigator.storage.getDirectory()
        const handle = await root.getFileHandle(fileName, { create: true })
        const existing = await handle.getFile()
        if (existing.size === 0) {
          const decoded = Uint8Array.from(atob(base64), (value) =>
            value.charCodeAt(0)
          )
          const writable = await handle.createWritable()
          await writable.write(decoded)
          await writable.close()
        }

        const nativeCreateWritable = handle.createWritable.bind(handle)
        Object.defineProperties(handle, {
          queryPermission: {
            configurable: true,
            value: async () => permission,
          },
          requestPermission: {
            configurable: true,
            value: async () => permission,
          },
          createWritable: {
            configurable: true,
            value: async (writeOptions?: FileSystemCreateWritableOptions) => {
              if (failWrites) throw new Error("Simulated disk full")
              return nativeCreateWritable(writeOptions)
            },
          },
        })

        window.__baseE2E = {
          async appendExternalByte() {
            const file = await handle.getFile()
            const writable = await nativeCreateWritable({
              keepExistingData: true,
            })
            await writable.seek(file.size)
            await writable.write(new Uint8Array([0]))
            await writable.close()
          },
          async bytes() {
            return Array.from(
              new Uint8Array(await (await handle.getFile()).arrayBuffer())
            )
          },
          failWrites(value) {
            failWrites = value
          },
        }
        return handle
      })()

      Object.defineProperties(window, {
        showOpenFilePicker: {
          configurable: true,
          value: async () => [await ready],
        },
        showSaveFilePicker: {
          configurable: true,
          value: undefined,
        },
      })
    },
    {
      base64: encoded,
      fileName: options.fileName ?? "project-tracker.base",
      permission: options.permission ?? "granted",
    }
  )
}

async function installFallbackMode(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperties(window, {
      showOpenFilePicker: { configurable: true, value: undefined },
      showSaveFilePicker: { configurable: true, value: undefined },
    })
  })
}

async function openDirectBase(page: Page): Promise<void> {
  await page.goto("/")
  await page.getByRole("button", { name: "Open .base file" }).click()
  await expect(page.locator("[data-grid-cell='0:0']")).toContainText(
    "Ship Base Web Editor"
  )
  await expect(page.getByText("2,500 records", { exact: true })).toBeVisible()
}

async function editFirstTitle(page: Page, title: string): Promise<void> {
  const cell = page.locator("[data-grid-cell='0:0']")
  await cell.focus()
  await cell.press("Enter")
  const input = page.locator(".grid-cell-input")
  await input.fill(title)
  await input.press("Enter")
  await expect(page.getByRole("status")).toContainText(/Unsaved|browser/)
  await expect(page.locator("[data-grid-cell='0:0']")).toContainText(title)
}

test.describe("Chromium original-file editing", () => {
  test.beforeEach(({ browserName }) => {
    test.skip(
      browserName !== "chromium",
      "Direct File System Access is a Chromium capability"
    )
  })

  test("edits, saves to the same handle, and reopens valid SQLite", async ({
    page,
  }) => {
    await installDirectPicker(page, { fileName: "direct-save.base" })
    await openDirectBase(page)
    await expect(page.locator(".editor-statusbar")).toContainText(
      "Original file"
    )

    await editFirstTitle(page, "Saved through Chromium handle")
    await page
      .locator(".title-actions .toolbar-button")
      .filter({ hasText: "Save" })
      .click()
    await expect(page.getByRole("status")).toContainText("Saved to original")

    const savedBytes = await page.evaluate(
      async () => (await window.__baseE2E?.bytes()) ?? []
    )
    expect(String.fromCharCode(...savedBytes.slice(0, 16))).toBe(
      "SQLite format 3\u0000"
    )

    await page.reload()
    await page.getByRole("button", { name: "Open .base file" }).click()
    await expect(page.locator("[data-grid-cell='0:0']")).toContainText(
      "Saved through Chromium handle"
    )
    await expect(page.getByText("SQLite 1", { exact: true })).toBeVisible()
  })

  test("protects the working copy when the original changes", async ({
    page,
  }) => {
    await installDirectPicker(page, { fileName: "conflict.base" })
    await openDirectBase(page)
    await editFirstTitle(page, "Conflict-safe edit")
    await page.evaluate(async () => window.__baseE2E?.appendExternalByte())

    await page
      .locator(".title-actions .toolbar-button")
      .filter({ hasText: "Save" })
      .click()
    await expect(page.getByRole("alert")).toContainText(
      "changed outside this tab"
    )
    await expect(page.locator("[data-grid-cell='0:0']")).toContainText(
      "Conflict-safe edit"
    )

    await page.getByRole("button", { name: "Overwrite original" }).click()
    await expect(page.getByRole("status")).toContainText("Saved to original")
  })

  test("keeps a recoverable copy after an interrupted write", async ({
    page,
  }, testInfo) => {
    await installDirectPicker(page, { fileName: "write-failure.base" })
    await openDirectBase(page)
    await editFirstTitle(page, "Survives failed save")
    await page.evaluate(() => window.__baseE2E?.failWrites(true))

    await page
      .locator(".title-actions .toolbar-button")
      .filter({ hasText: "Save" })
      .click()
    await expect(page.getByRole("alert")).toContainText("Simulated disk full")
    await expect(page.locator("[data-grid-cell='0:0']")).toContainText(
      "Survives failed save"
    )

    const downloadPromise = page.waitForEvent("download")
    await page.getByRole("button", { name: "Save recoverable copy" }).click()
    const download = await downloadPromise
    await download.saveAs(testInfo.outputPath("write-failure-recovery.base"))
    expect(download.suggestedFilename()).toBe("write-failure.base")
  })

  test("explains denied write permission without claiming a save", async ({
    page,
  }) => {
    await installDirectPicker(page, {
      fileName: "permission-denied.base",
      permission: "denied",
    })
    await openDirectBase(page)
    await expect(
      page.getByRole("button", { name: "Grant write access" })
    ).toBeVisible()
    await page.getByRole("button", { name: "Grant write access" }).click()
    await expect(page.getByRole("alert")).toContainText(
      "Write access was not granted"
    )
    await expect(
      page
        .locator(".title-actions .toolbar-button")
        .filter({ hasText: "Save As" })
    ).toBeVisible()
  })
})

test("fallback imports a copy, downloads it, and reopens the edit", async ({
  page,
}, testInfo) => {
  await installFallbackMode(page)
  await page.goto("/")
  await expect(page.getByText(/imports a private working copy/)).toBeVisible()
  await page.locator("input[type=file]").setInputFiles(fixturePath)
  await expect(page.getByText("Imported copy", { exact: true })).toBeVisible()
  await editFirstTitle(page, "Portable fallback edit")

  const downloadPromise = page.waitForEvent("download")
  await page
    .locator(".title-actions .toolbar-button")
    .filter({ hasText: "Save As" })
    .click()
  const download = await downloadPromise
  const savedPath = testInfo.outputPath("portable-fallback.base")
  await download.saveAs(savedPath)
  await expect(page.getByRole("status")).toContainText("Downloaded a copy")

  await page.reload()
  await page.locator("input[type=file]").setInputFiles(savedPath)
  await expect(page.locator("[data-grid-cell='0:0']")).toContainText(
    "Portable fallback edit"
  )
  await expect(page.getByText("SQLite 1", { exact: true })).toBeVisible()
})

test("opens the bundled sample without a picker", async ({ page }) => {
  await installFallbackMode(page)
  await page.goto("/")
  const sampleResponse = page.waitForResponse((response) =>
    response.url().includes("project-tracker")
  )
  await page.getByRole("button", { name: "Open sample Base" }).click()
  await expect((await sampleResponse).ok()).toBeTruthy()
  await expect(page.locator("[data-grid-cell='0:0']")).toContainText(
    "Ship Base Web Editor"
  )
  await expect(page.getByText("2,500 records", { exact: true })).toBeVisible()
  await expect(page.locator(".editor-statusbar")).toContainText("Imported copy")
})

test("switches the live Base experience between English and Chinese", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "One browser covers the shared React UI"
  )
  await installFallbackMode(page)
  await page.goto("/")
  await page.getByRole("button", { name: "切换到中文" }).click()

  await expect(page.getByRole("heading", { name: /打开 Base。/ })).toBeVisible()
  await expect(page.getByText("从底层向上，全部自主实现。")).toBeVisible()
  await expect(page.getByText("SQLite 版本引擎")).toBeVisible()

  const demoCell = page.locator(".live-demo-grid [data-grid-cell='0:0']")
  await expect(demoCell).toContainText("Ship Base Web Editor")
  await demoCell.focus()
  await demoCell.press("Enter")
  await page.locator(".live-demo-grid .grid-cell-input").fill("实时示例修改")
  await page.locator(".live-demo-grid .grid-cell-input").press("Enter")
  await expect(page.locator(".live-demo-state")).toContainText("本地示例已修改")
  await expect(demoCell).toContainText("实时示例修改")

  await page.getByRole("button", { name: "打开完整编辑器" }).click()
  await expect(page.locator(".editor-statusbar")).toContainText("导入的副本")
  await page.getByRole("button", { name: "Switch to English" }).click()
  await expect(page.locator(".editor-statusbar")).toContainText("Imported copy")
})
