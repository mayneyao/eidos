import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

import { expect, test, type Page } from "@playwright/test"

const fixturePath = fileURLToPath(
  new URL("../fixtures/project-tracker.base", import.meta.url)
)
const fixtureRowCount = 2_500
const gridHeaderHeight = 36
const gridRowHeight = 36

interface BaseE2EHarness {
  appendExternalByte(): Promise<void>
  bytes(): Promise<number[]>
  failWrites(value: boolean): void
  launchFile(): Promise<void>
}

declare global {
  interface Window {
    __baseE2E?: BaseE2EHarness
  }
}

async function installDirectPicker(
  page: Page,
  options: {
    permission?: "granted" | "denied"
    fileName?: string
    launchOnRegister?: boolean
  } = {}
): Promise<void> {
  const bytes = await readFile(fixturePath)
  const encoded = bytes.toString("base64")
  await page.addInitScript(
    async ({ base64, fileName, launchOnRegister, permission }) => {
      let failWrites = false
      const launchBytes = Uint8Array.from(atob(base64), (value) =>
        value.charCodeAt(0)
      )
      const autoLaunchHandle = {
        kind: "file",
        name: fileName,
        getFile: async () =>
          new File([launchBytes], fileName, {
            lastModified: 7,
            type: "application/vnd.eidos.base+sqlite3",
          }),
        queryPermission: async () => permission,
      } as unknown as FileSystemFileHandle
      let launchConsumer:
        | ((params: { files: FileSystemFileHandle[] }) => void | Promise<void>)
        | undefined
      let didAutoLaunch = false
      Object.defineProperty(window, "launchQueue", {
        configurable: true,
        value: {
          setConsumer(
            consumer: (params: {
              files: FileSystemFileHandle[]
            }) => void | Promise<void>
          ) {
            launchConsumer = consumer
            if (launchOnRegister && !didAutoLaunch) {
              didAutoLaunch = true
              void consumer({ files: [autoLaunchHandle] })
            }
          },
        },
      })
      const ready = (async () => {
        const root = await navigator.storage.getDirectory()
        const handle = await root.getFileHandle(fileName, { create: true })
        const existing = await handle.getFile()
        if (existing.size === 0) {
          const writable = await handle.createWritable()
          await writable.write(launchBytes)
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
          async launchFile() {
            if (!launchConsumer) {
              throw new Error("The PWA launch consumer is not registered")
            }
            await launchConsumer({ files: [handle] })
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
      launchOnRegister: options.launchOnRegister ?? false,
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

async function emulateClassicScrollbarWidth(
  page: Page,
  scrollbarWidth = 14
): Promise<void> {
  await page.addInitScript((width) => {
    const descriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "offsetWidth"
    )
    const nativeOffsetWidth = descriptor?.get
    if (!descriptor || !nativeOffsetWidth) return

    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
      ...descriptor,
      get: function (this: HTMLElement) {
        const measuredWidth = nativeOffsetWidth.call(this)
        const parent = this.parentElement
        const isGlideMeasurement =
          this instanceof HTMLParagraphElement && parent?.id === "testScrollbar"
        const isEidosMeasurement =
          this.style.width === "100%" &&
          parent?.style.overflow === "scroll" &&
          parent.style.visibility === "hidden"
        return isGlideMeasurement || isEidosMeasurement
          ? Math.max(0, measuredWidth - width)
          : measuredWidth
      },
    })
  }, scrollbarWidth)
}

async function openDirectBase(page: Page): Promise<void> {
  await page.goto("/")
  await page.getByRole("button", { name: "Open .base file" }).click()
  await expect(page.locator("[data-testid='glide-cell-1-0']")).toContainText(
    "Ship Base Web Editor"
  )
  await expect(
    page.getByRole("tab", { name: "Projects", exact: true })
  ).toBeVisible()
}

async function toggleFirstComplete(
  page: Page,
  scope = page.locator(".base-content"),
  expectSaveState = true
): Promise<void> {
  const canvas = scope.locator("canvas[data-testid='data-grid-canvas']")
  const cell = scope.locator("[data-testid='glide-cell-5-0']")
  await cell.waitFor({ state: "attached" })
  await expect(cell).toHaveText("false")
  await canvas.scrollIntoViewIfNeeded()
  const bounds = await canvas.boundingBox()
  if (!bounds) throw new Error("The shared Base Grid canvas is not visible")

  // Desktop's canonical Grid uses a 44px row marker, a 280px title, then
  // 180px property columns. Click the first row's Complete checkbox.
  await page.mouse.click(bounds.x + 954, bounds.y + 54)
  if (expectSaveState) {
    await expect(page.getByRole("status")).toContainText(/Unsaved|browser/)
  }
  await expect(cell).toHaveText("true")
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
    await expect(page.locator("[data-base-sheet-tabs]")).toContainText(
      "Original file"
    )

    await toggleFirstComplete(page)
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
    await expect(page.locator("[data-testid='glide-cell-5-0']")).toHaveText(
      "true"
    )
    await expect(page.getByText("SQLite 1", { exact: true })).toBeVisible()
  })

  test("opens a .base file delivered by the installed PWA launch queue", async ({
    page,
  }) => {
    await installDirectPicker(page, {
      fileName: "pwa-launch.base",
      launchOnRegister: true,
    })
    await page.goto("/")

    await expect(page.locator("[data-testid='glide-cell-1-0']")).toContainText(
      "Ship Base Web Editor"
    )
    await expect(page.locator("[data-base-sheet-tabs]")).toContainText(
      "Original file"
    )
    await expect(page.locator("header")).toContainText("pwa-launch.base")
  })

  test("protects the working copy when the original changes", async ({
    page,
  }) => {
    await installDirectPicker(page, { fileName: "conflict.base" })
    await openDirectBase(page)
    await toggleFirstComplete(page)
    await page.evaluate(async () => window.__baseE2E?.appendExternalByte())

    await page
      .locator(".title-actions .toolbar-button")
      .filter({ hasText: "Save" })
      .click()
    await expect(page.getByRole("alert")).toContainText(
      "changed outside this tab"
    )
    await expect(page.locator("[data-testid='glide-cell-5-0']")).toHaveText(
      "true"
    )

    await page.getByRole("button", { name: "Overwrite original" }).click()
    await expect(page.getByRole("status")).toContainText("Saved to original")
  })

  test("keeps a recoverable copy after an interrupted write", async ({
    page,
  }, testInfo) => {
    await installDirectPicker(page, { fileName: "write-failure.base" })
    await openDirectBase(page)
    await toggleFirstComplete(page)
    await page.evaluate(() => window.__baseE2E?.failWrites(true))

    await page
      .locator(".title-actions .toolbar-button")
      .filter({ hasText: "Save" })
      .click()
    await expect(page.getByRole("alert")).toContainText("Simulated disk full")
    await expect(page.locator("[data-testid='glide-cell-5-0']")).toHaveText(
      "true"
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

test("publishes an installable manifest with a .base file handler", async ({
  browserName,
  request,
}) => {
  test.skip(
    browserName !== "chromium",
    "Manifest output is browser-independent"
  )
  const response = await request.get("/manifest.webmanifest")
  expect(response.ok()).toBe(true)
  const manifest = await response.json()

  expect(manifest.name).toBe("Eidos Base")
  expect(manifest.icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ sizes: "192x192" }),
      expect.objectContaining({ sizes: "512x512" }),
    ])
  )
  expect(manifest.file_handlers).toContainEqual(
    expect.objectContaining({
      action: "./",
      accept: {
        "application/vnd.eidos.base+sqlite3": [".base"],
      },
      launch_type: "multiple-clients",
    })
  )
  await expect((await request.get("/sw.js")).ok()).toBe(true)
  await expect((await request.get("/base-icon-512.png")).ok()).toBe(true)
})

test("fallback imports a copy, downloads it, and reopens the edit", async ({
  page,
}, testInfo) => {
  await installFallbackMode(page)
  await page.goto("/")
  await expect(page.getByText(/imports a private working copy/)).toBeVisible()
  await page.locator("input[type=file]").setInputFiles(fixturePath)
  await expect(
    page.locator("header").getByText("Imported copy", { exact: true })
  ).toBeVisible()
  await toggleFirstComplete(page)

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
  await expect(page.locator("[data-testid='glide-cell-5-0']")).toHaveText(
    "true"
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
  await expect((await sampleResponse).status()).toBeLessThan(400)
  await expect(page.locator("[data-testid='glide-cell-1-0']")).toContainText(
    "Ship Base Web Editor"
  )
  await expect(
    page.getByRole("tab", { name: "Projects", exact: true })
  ).toBeVisible()
  await expect(page.locator("[data-base-sheet-tabs]")).toContainText(
    "Imported copy"
  )

  await page.getByRole("button", { name: "Filter Base rows" }).click()
  const filterPopover = page.locator("[data-base-filter-popover]")
  await expect(filterPopover).toBeVisible()
  expect(
    await filterPopover.evaluate(
      (element) => getComputedStyle(element).backgroundColor
    )
  ).not.toBe("rgba(0, 0, 0, 0)")
  await expect(filterPopover.getByRole("button", { name: "Apply" })).toHaveCSS(
    "color",
    "rgb(249, 250, 251)"
  )
  await expect(filterPopover.getByRole("combobox")).toHaveCSS(
    "border-top-width",
    "1px"
  )
})

test("uses the shared Gallery and Kanban renderers for the sample", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Chromium covers the shared card views and worker mutation path"
  )
  await installFallbackMode(page)
  await page.goto("/")
  await page.getByRole("button", { name: "Open sample Base" }).click()

  await page.getByRole("tab", { name: "Project cards" }).click()
  const gallery = page.locator("[data-base-gallery-scroll]")
  await expect(gallery).toBeVisible()
  const firstCard = gallery.locator('[data-base-row-id="project_00001"]')
  await expect(firstCard).toContainText("Ship Base Web Editor")
  await firstCard.locator("h3").click()

  const inspector = page.locator('[data-base-detail-panel="record"]')
  await expect(inspector).toBeVisible()
  const title = inspector.getByRole("textbox", { name: "Title" })
  await title.fill("Ship Base Web Editor — verified")
  await title.press("Control+Enter")
  await expect(page.locator(".save-status")).toContainText(/browser|Unsaved/)
  await page.getByRole("button", { name: "Close record details" }).click()
  await expect(firstCard).toContainText("verified")

  await page.getByRole("tab", { name: "By status" }).click()
  const kanban = page.locator("[data-base-kanban-scroll]")
  await expect(kanban).toBeVisible()
  const backlog = page.getByRole("region", { name: /Backlog, \d+ records/ })
  await expect(backlog).toBeVisible()
  const backlogCount = Number(
    (await backlog.getAttribute("aria-label"))?.match(/\d+/)?.[0] ?? "0"
  )
  await backlog.getByRole("button", { name: "Add record" }).click()
  const recordTitle = backlog.getByPlaceholder("Record title")
  await recordTitle.fill("Browser-created project")
  await recordTitle.press("Enter")
  await expect(backlog).toHaveAttribute(
    "aria-label",
    `Backlog, ${backlogCount + 1} records`
  )
})

test("does not reserve a blank scrollbar row when columns fit", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Chromium covers classic non-overlay scrollbar geometry"
  )
  await page.setViewportSize({ width: 1_440, height: 800 })
  await emulateClassicScrollbarWidth(page)
  await installFallbackMode(page)
  await page.goto("/")
  await page.getByRole("button", { name: "Open sample Base" }).click()

  const scroller = page.locator(".base-content .dvn-scroller")
  await expect(scroller).toBeVisible()
  await expect
    .poll(() =>
      scroller.evaluate((element) => element.scrollWidth <= element.clientWidth)
    )
    .toBe(true)
  await scroller.evaluate((element) => {
    element.scrollTop = element.scrollHeight
    element.dispatchEvent(new Event("scroll"))
  })

  await expect
    .poll(() => scroller.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0)
  expect(await scroller.evaluate((element) => element.scrollHeight)).toBe(
    gridHeaderHeight + (fixtureRowCount + 1) * gridRowHeight
  )

  await page.setViewportSize({ width: 900, height: 800 })
  await expect
    .poll(() =>
      scroller.evaluate((element) => element.scrollWidth > element.clientWidth)
    )
    .toBe(true)
  await scroller.evaluate((element) => {
    element.scrollLeft = element.scrollWidth
    element.dispatchEvent(new Event("scroll"))
  })
  await expect
    .poll(() => scroller.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0)
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

  await expect(
    page.locator(".live-demo-grid [data-testid='glide-cell-1-0']")
  ).toContainText("Ship Base Web Editor")
  await toggleFirstComplete(page, page.locator(".live-demo-grid"), false)
  await expect(page.locator(".live-demo-state")).toContainText("本地示例已修改")
  await expect(
    page.locator(".live-demo-grid [data-testid='glide-cell-5-0']")
  ).toHaveText("true")

  await page.getByRole("button", { name: "打开完整编辑器" }).click()
  await expect(page.locator("[data-base-sheet-tabs]")).toContainText(
    "导入的副本"
  )
  await page.getByRole("button", { name: "Switch to English" }).click()
  await expect(page.locator("[data-base-sheet-tabs]")).toContainText(
    "Imported copy"
  )
})
