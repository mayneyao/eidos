import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

import { expect, test, type Page } from "@playwright/test"

const fixturePath = fileURLToPath(
  new URL("../fixtures/project-tracker.eidos", import.meta.url)
)
const fixtureRowCount = 2_500
const gridHeaderHeight = 36
const gridRowHeight = 36

interface EidosFileE2EHarness {
  appendExternalByte(): Promise<void>
  bytes(): Promise<number[]>
  failWrites(value: boolean): void
  launchFile(): Promise<void>
}

declare global {
  interface Window {
    __eidosFileE2E?: EidosFileE2EHarness
    __eidosFileWorkerMessages?: unknown[]
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
            type: "application/vnd.eidos+sqlite3",
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

        window.__eidosFileE2E = {
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
      fileName: options.fileName ?? "project-tracker.eidos",
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

async function openDirectEidosFile(page: Page): Promise<void> {
  await page.goto("/")
  await page.getByRole("button", { name: "Open .eidos file" }).click()
  await expect(page.locator("[data-testid='glide-cell-1-0']")).toContainText(
    "Ship Eidos File Web Editor"
  )
  await expect(
    page.getByRole("tab", { name: "Projects", exact: true })
  ).toBeVisible()
}

async function toggleFirstComplete(
  page: Page,
  scope = page.locator(".eidos-file-content"),
  expectSaveState = true
): Promise<void> {
  const canvas = scope.locator("canvas[data-testid='data-grid-canvas']")
  const cell = scope.locator("[data-testid='glide-cell-5-0']")
  await cell.waitFor({ state: "attached" })
  await expect(cell).toHaveText("false")
  await canvas.scrollIntoViewIfNeeded()
  const bounds = await canvas.boundingBox()
  if (!bounds)
    throw new Error("The shared Eidos File Grid canvas is not visible")

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
    await installDirectPicker(page, { fileName: "direct-save.eidos" })
    await openDirectEidosFile(page)
    await expect(page.locator("[data-eidos-file-sheet-tabs]")).toContainText(
      "Original file"
    )

    await toggleFirstComplete(page)
    await page
      .locator(".title-actions .toolbar-button")
      .filter({ hasText: "Save" })
      .click()
    await expect(page.getByRole("status")).toContainText("Saved to original")

    const savedBytes = await page.evaluate(
      async () => (await window.__eidosFileE2E?.bytes()) ?? []
    )
    expect(String.fromCharCode(...savedBytes.slice(0, 16))).toBe(
      "SQLite format 3\u0000"
    )

    await page.reload()
    await page.getByRole("button", { name: "Open .eidos file" }).click()
    await expect(page.locator("[data-testid='glide-cell-5-0']")).toHaveText(
      "true"
    )
    await expect(page.getByText("SQLite 1", { exact: true })).toBeVisible()
  })

  test("opens a .eidos file delivered by the installed PWA launch queue", async ({
    page,
  }) => {
    await installDirectPicker(page, {
      fileName: "pwa-launch.eidos",
      launchOnRegister: true,
    })
    await page.goto("/")

    await expect(page.locator("[data-testid='glide-cell-1-0']")).toContainText(
      "Ship Eidos File Web Editor"
    )
    await expect(page.locator("[data-eidos-file-sheet-tabs]")).toContainText(
      "Original file"
    )
    await expect(page.locator("header")).toContainText("pwa-launch.eidos")
  })

  test("protects the working copy when the original changes", async ({
    page,
  }) => {
    await installDirectPicker(page, { fileName: "conflict.eidos" })
    await openDirectEidosFile(page)
    await toggleFirstComplete(page)
    await page.evaluate(async () => window.__eidosFileE2E?.appendExternalByte())

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
    await installDirectPicker(page, { fileName: "write-failure.eidos" })
    await openDirectEidosFile(page)
    await toggleFirstComplete(page)
    await page.evaluate(() => window.__eidosFileE2E?.failWrites(true))

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
    await download.saveAs(testInfo.outputPath("write-failure-recovery.eidos"))
    expect(download.suggestedFilename()).toBe("write-failure.eidos")
  })

  test("explains denied write permission without claiming a save", async ({
    page,
  }) => {
    await installDirectPicker(page, {
      fileName: "permission-denied.eidos",
      permission: "denied",
    })
    await openDirectEidosFile(page)
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

test("publishes an installable manifest with a .eidos file handler", async ({
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

  expect(manifest.name).toBe("Eidos File")
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
        "application/vnd.eidos+sqlite3": [".eidos"],
      },
      launch_type: "multiple-clients",
    })
  )
  await expect((await request.get("/sw.js")).ok()).toBe(true)
  await expect((await request.get("/eidos-file-icon-512.png")).ok()).toBe(true)
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
  const savedPath = testInfo.outputPath("portable-fallback.eidos")
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
  await page.getByRole("button", { name: "Open sample Eidos File" }).click()
  await expect((await sampleResponse).status()).toBeLessThan(400)
  await expect(page.locator("[data-testid='glide-cell-1-0']")).toContainText(
    "Ship Eidos File Web Editor"
  )
  await expect(
    page.getByRole("tab", { name: "Projects", exact: true })
  ).toBeVisible()
  await expect(page.locator("[data-eidos-file-sheet-tabs]")).toContainText(
    "Imported copy"
  )

  await page.getByRole("button", { name: "Filter Eidos File rows" }).click()
  const filterPopover = page.locator("[data-eidos-file-filter-popover]")
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

  await page.getByRole("link", { name: "Return to Eidos File home" }).click()
  await expect(
    page.getByRole("button", { name: "Open .eidos file" })
  ).toBeVisible()
})

test("keeps the landing-page live demo bounded in a narrow window", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Chromium covers the shared responsive landing-page grid"
  )
  await page.setViewportSize({ width: 600, height: 900 })
  await installFallbackMode(page)
  await page.goto("/")

  await page
    .locator(".live-demo-grid [data-testid='glide-cell-1-0']")
    .waitFor({ state: "attached" })

  const demoGeometry = await page.evaluate(() => {
    const workbench = document
      .querySelector(".launch-workbench")
      ?.getBoundingClientRect()
    const demo = document
      .querySelector(".live-demo-embedded")
      ?.getBoundingClientRect()
    const grid = document
      .querySelector(".live-demo-grid")
      ?.getBoundingClientRect()
    const scroller = document.querySelector<HTMLElement>(
      ".live-demo-grid .dvn-scroller"
    )
    const panel = document
      .querySelector(".launch-panel")
      ?.getBoundingClientRect()
    const detailRows = Array.from(
      document.querySelectorAll(".launch-details > div")
    ).map((element) => element.getBoundingClientRect().toJSON())
    return {
      demo: demo?.toJSON(),
      documentHeight: document.documentElement.scrollHeight,
      grid: grid?.toJSON(),
      pageOverflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      panel: panel?.toJSON(),
      detailRows,
      scroller: scroller
        ? {
            clientHeight: scroller.clientHeight,
            scrollHeight: scroller.scrollHeight,
          }
        : null,
      workbench: workbench?.toJSON(),
    }
  })

  expect(demoGeometry.pageOverflow).toBe(0)
  expect(
    demoGeometry.detailRows.every(
      (row) => row.bottom <= (demoGeometry.panel?.bottom ?? 0) + 1
    )
  ).toBe(true)
  expect(demoGeometry.demo?.height).toBeLessThanOrEqual(512)
  expect(demoGeometry.demo?.height).toBeGreaterThanOrEqual(384)
  expect(demoGeometry.grid?.height).toBeLessThan(450)
  expect(demoGeometry.workbench?.height).toBeLessThan(1_500)
  expect(demoGeometry.documentHeight).toBeLessThan(10_000)
  expect(demoGeometry.scroller?.clientHeight).toBeLessThan(500)
  expect(demoGeometry.scroller?.scrollHeight).toBeGreaterThan(
    demoGeometry.scroller?.clientHeight ?? 0
  )
})

test("keeps landing content visible while only the demo canvas loads", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Chromium covers the landing-page loading boundary"
  )
  let releaseSample: (() => void) | undefined
  const sampleGate = new Promise<void>((resolve) => {
    releaseSample = resolve
  })
  await page.route("**/project-tracker.eidos", async (route) => {
    await sampleGate
    await route.continue()
  })
  await page.setViewportSize({ width: 1_600, height: 1_000 })
  await installFallbackMode(page)
  await page.goto("/")

  const launchTitle = page.getByRole("heading", {
    name: /Open an Eidos File/i,
  })
  const demoGrid = page.locator(".live-demo-grid")
  const demoLoading = demoGrid.locator(".live-demo-loading")
  await expect(launchTitle).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Open .eidos file" })
  ).toBeVisible()
  await expect(demoGrid).toHaveAttribute("aria-busy", "true")
  await expect(demoLoading).toBeVisible()

  const loadingBoundary = await page.evaluate(() => {
    const grid = document
      .querySelector(".live-demo-grid")
      ?.getBoundingClientRect()
    const loading = document
      .querySelector(".live-demo-loading")
      ?.getBoundingClientRect()
    return {
      contained:
        Boolean(grid && loading) &&
        loading!.top >= grid!.top &&
        loading!.right <= grid!.right &&
        loading!.bottom <= grid!.bottom &&
        loading!.left >= grid!.left,
      documentHeight: document.documentElement.scrollHeight,
    }
  })
  expect(loadingBoundary.contained).toBe(true)
  expect(loadingBoundary.documentHeight).toBeLessThan(10_000)

  releaseSample?.()
  await page
    .locator(".live-demo-grid [data-testid='glide-cell-1-0']")
    .waitFor({ state: "attached" })
  await expect(demoGrid).toHaveAttribute("aria-busy", "false")
})

test("keeps the desktop landing workbench bounded after rows load", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Chromium covers the desktop virtualized Grid layout"
  )
  await page.setViewportSize({ width: 1_920, height: 1_280 })
  await installFallbackMode(page)
  await page.goto("/")
  await page
    .locator(".live-demo-grid [data-testid='glide-cell-1-0']")
    .waitFor({ state: "attached" })

  const geometry = await page.evaluate(() => {
    const rect = (selector: string) =>
      document.querySelector(selector)?.getBoundingClientRect().toJSON()
    const scroller = document.querySelector<HTMLElement>(
      ".live-demo-grid .dvn-scroller"
    )
    return {
      copy: rect(".launch-copy"),
      details: rect(".launch-details"),
      grid: rect(".live-demo-grid"),
      panel: rect(".launch-panel"),
      workbench: rect(".launch-workbench"),
      documentHeight: document.documentElement.scrollHeight,
      scroller: scroller
        ? {
            clientHeight: scroller.clientHeight,
            scrollHeight: scroller.scrollHeight,
          }
        : null,
    }
  })

  expect(geometry.workbench?.height).toBeLessThanOrEqual(961)
  expect(geometry.panel?.bottom).toBeLessThanOrEqual(
    (geometry.workbench?.bottom ?? 0) + 1
  )
  expect(geometry.copy?.top).toBeGreaterThanOrEqual(
    geometry.workbench?.top ?? 0
  )
  expect(geometry.details?.bottom).toBeLessThanOrEqual(
    (geometry.workbench?.bottom ?? 0) + 1
  )
  expect(geometry.grid?.height).toBeLessThan(900)
  expect(geometry.documentHeight).toBeLessThan(10_000)
  expect(geometry.scroller?.clientHeight).toBeLessThan(900)
  expect(geometry.scroller?.scrollHeight).toBeGreaterThan(
    geometry.scroller?.clientHeight ?? 0
  )
  await expect(
    page.getByRole("heading", { name: /Open an Eidos File/i })
  ).toBeInViewport()
  await expect(
    page.getByRole("button", { name: "Open .eidos file" })
  ).toBeInViewport()
})

test("anchors landing-page field menus to their grid headers", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Chromium covers the shared Grid field menu positioning"
  )
  await page.setViewportSize({ width: 1_600, height: 1_000 })
  await installFallbackMode(page)
  await page.goto("/")

  await page
    .locator(".live-demo-grid [data-testid='glide-cell-1-0']")
    .waitFor({ state: "attached" })
  const canvas = page.locator(
    ".live-demo-grid canvas[data-testid='data-grid-canvas']"
  )
  const canvasBounds = await canvas.boundingBox()
  if (!canvasBounds) throw new Error("The landing-page Grid is not visible")

  await page.mouse.click(canvasBounds.x + 100, canvasBounds.y + 18, {
    button: "right",
  })
  const menu = page.getByRole("menu", { name: "Actions for title" })
  await expect(menu).toBeVisible()
  const menuBounds = await menu.boundingBox()
  if (!menuBounds) throw new Error("The field menu is not visible")

  expect(menuBounds.x).toBeGreaterThanOrEqual(canvasBounds.x)
  expect(menuBounds.x).toBeLessThan(canvasBounds.x + 100)
  expect(menuBounds.y).toBeGreaterThan(canvasBounds.y + 30)
  expect(menuBounds.y).toBeLessThan(canvasBounds.y + 50)
  await expect(page.locator(".launch-workbench")).toHaveCSS("transform", "none")
})

test("keeps Grid field menus open after a touch header tap", async ({
  baseURL,
  browser,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Chromium covers the shared touch interaction path"
  )
  const context = await browser.newContext({
    baseURL,
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    viewport: { width: 650, height: 1_400 },
  })
  const page = await context.newPage()
  await installFallbackMode(page)
  await page.goto("/")
  await page.getByRole("button", { name: "Open sample Eidos File" }).click()
  await page.locator("[data-testid='glide-cell-1-0']").waitFor({
    state: "attached",
  })

  const canvas = page.locator("canvas[data-testid='data-grid-canvas']")
  const canvasBounds = await canvas.boundingBox()
  if (!canvasBounds) throw new Error("The Grid canvas is not visible")
  await page.touchscreen.tap(canvasBounds.x + 100, canvasBounds.y + 18)

  const menu = page.getByRole("menu", { name: "Actions for title" })
  await expect(menu).toBeVisible()
  await page.waitForTimeout(500)
  await expect(menu).toBeVisible()
  await menu.getByRole("menuitem", { name: "Sort ascending" }).tap()
  await expect(menu).toBeHidden()
  await context.close()
})

test("keeps navigation and editor controls usable on a phone", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Chromium covers the shared responsive editor shell"
  )
  await page.setViewportSize({ width: 320, height: 720 })
  await installFallbackMode(page)
  await page.goto("/")

  const primaryNavigation = page.locator(".site-nav a")
  await expect(primaryNavigation).toHaveCount(3)
  const primaryNavigationRegion = page.locator(".site-nav")
  await expect(
    primaryNavigationRegion.getByRole("link", { name: "Editor" })
  ).toBeVisible()
  await expect(
    primaryNavigationRegion.getByRole("link", { name: "Open Format" })
  ).toBeVisible()
  await expect(
    primaryNavigationRegion.getByRole("link", { name: /Version Control/ })
  ).toBeVisible()
  expect(
    await primaryNavigation.evaluateAll((links) =>
      links.every((link) => link.getBoundingClientRect().height >= 44)
    )
  ).toBe(true)

  await page.getByRole("button", { name: "Open sample Eidos File" }).click()
  await page.locator(".editor-titlebar").waitFor()
  await page.locator("[data-testid='glide-cell-1-0']").waitFor({
    state: "attached",
  })

  const responsiveChrome = await page.evaluate(() => {
    const titlebar = document
      .querySelector(".editor-titlebar")
      ?.getBoundingClientRect()
    const workbar = document
      .querySelector("[data-eidos-file-workbar]")
      ?.getBoundingClientRect()
    const views = document
      .querySelector("[data-eidos-file-view-tabs]")
      ?.getBoundingClientRect()
    const actions = document
      .querySelector("[data-eidos-file-workbar-actions]")
      ?.getBoundingClientRect()
    const status = document
      .querySelector("[data-eidos-file-sheet-status]")
      ?.getBoundingClientRect()
    const statusCopy = document.querySelector(
      "[data-eidos-file-sheet-status-copy]"
    )
    const actionButtons = Array.from(
      document.querySelectorAll<HTMLButtonElement>(
        "[data-eidos-file-workbar-actions] button"
      )
    )
      .filter((button) => getComputedStyle(button).display !== "none")
      .map((button) => button.getBoundingClientRect().toJSON())
    return {
      actionButtons,
      actions: actions?.toJSON(),
      pageOverflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      status: status?.toJSON(),
      statusCopyDisplay: statusCopy
        ? getComputedStyle(statusCopy).display
        : null,
      titlebar: titlebar?.toJSON(),
      views: views?.toJSON(),
      workbar: workbar?.toJSON(),
    }
  })

  expect(responsiveChrome.pageOverflow).toBe(0)
  expect(responsiveChrome.titlebar?.height).toBe(48)
  expect(responsiveChrome.workbar?.height).toBe(80)
  expect(responsiveChrome.views?.width).toBe(320)
  expect(responsiveChrome.actions?.width).toBe(320)
  expect(responsiveChrome.actions?.top).toBe(responsiveChrome.views?.bottom)
  expect(responsiveChrome.status?.width).toBe(40)
  expect(responsiveChrome.statusCopyDisplay).toBe("none")
  expect(responsiveChrome.actionButtons).toHaveLength(4)
  expect(
    responsiveChrome.actionButtons.every(
      (button) => button.height >= 40 && button.left >= 0 && button.right <= 320
    )
  ).toBe(true)

  await page.getByRole("button", { name: "Search Eidos File rows" }).click()
  const mobileSearch = page.locator(".eidos-file-workbar-search")
  await expect(mobileSearch).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Filter Eidos File rows" })
  ).toBeHidden()
  const searchBounds = await mobileSearch.boundingBox()
  expect(searchBounds?.x).toBeGreaterThanOrEqual(4)
  expect(
    (searchBounds?.x ?? 0) + (searchBounds?.width ?? 0)
  ).toBeLessThanOrEqual(316)
  await page.getByRole("button", { name: "Close search" }).click()

  const scroller = page.locator(".eidos-file-content .dvn-scroller")
  await scroller.evaluate((element) => {
    element.scrollLeft = element.scrollWidth
    element.dispatchEvent(new Event("scroll"))
  })
  await expect
    .poll(() => scroller.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0)
})

test("imports CSV through the explicitly composed editor plugin", async ({
  page,
  browserName,
}, testInfo) => {
  test.skip(
    browserName !== "chromium",
    "Chromium covers the CSV plugin and SQLite WASM worker path"
  )
  await installFallbackMode(page)
  await page.goto("/")
  await page.getByRole("button", { name: "Open sample Eidos File" }).click()
  await page.locator("[data-testid='glide-cell-1-0']").waitFor({
    state: "attached",
  })

  const chooserPromise = page.waitForEvent("filechooser")
  await page.getByRole("button", { name: "Add Eidos File table" }).click()
  await page
    .getByRole("button", {
      name: "Import CSV as a new Eidos File table",
    })
    .click()
  const chooser = await chooserPromise
  await chooser.setFiles({
    name: "plugin-import.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "Name,Estimate,Done\nAlpha,12.5,true\nBeta,7,false\n",
      "utf8"
    ),
  })

  const dialog = page
    .getByRole("dialog")
    .filter({ hasText: "Import as a new table" })
  await expect(dialog).toContainText("Import as a new table")
  await expect(dialog).toContainText("2 ready")
  const tableName = page.getByLabel("Table name")
  await tableName.fill("CSV projects")
  await page.getByRole("button", { name: "Import 2 rows" }).click()

  await expect(
    page.getByRole("tab", { name: "CSV projects", exact: true })
  ).toBeVisible()
  await expect(page.locator("[data-testid='glide-cell-1-0']")).toHaveText(
    "Alpha"
  )
  await expect(page.locator("[data-testid='glide-cell-2-0']")).toHaveText(
    "12.5"
  )
  await expect(page.locator("[data-testid='glide-cell-3-0']")).toHaveText(
    "true"
  )
  await expect(page.getByRole("status")).toContainText(/Unsaved|browser/)

  const downloadPromise = page.waitForEvent("download")
  await page
    .locator(".title-actions .toolbar-button")
    .filter({ hasText: "Save As" })
    .click()
  const savedPath = testInfo.outputPath("csv-plugin-import.eidos")
  await (await downloadPromise).saveAs(savedPath)

  await page.reload()
  await page.locator("input[type=file]").setInputFiles(savedPath)
  await expect(
    page.getByRole("tab", { name: "CSV projects", exact: true })
  ).toBeVisible()
  await page.getByRole("tab", { name: "CSV projects", exact: true }).click()
  await expect(page.locator("[data-testid='glide-cell-1-0']")).toHaveText(
    "Alpha"
  )
  await page.getByRole("button", { name: "切换到中文" }).click()
  await page.getByRole("button", { name: "Add Eidos File table" }).click()
  await expect(
    page.getByRole("button", {
      name: "将 CSV 导入为新的 Eidos File 数据表",
    })
  ).toBeVisible()
})

test("matches Desktop table, view, Grid edit, field placement, and row delete workflows", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Chromium covers the browser worker mutation and shared Desktop controls"
  )
  await installFallbackMode(page)
  await page.goto("/")
  await page.getByRole("button", { name: "Open sample Eidos File" }).click()
  await page.locator("[data-testid='glide-cell-1-0']").waitFor({
    state: "attached",
  })

  const canvas = page.locator(
    ".eidos-file-content canvas[data-testid='data-grid-canvas']"
  )
  const bounds = await canvas.boundingBox()
  if (!bounds) throw new Error("The shared Eidos File Grid is not visible")

  await page.mouse.dblclick(bounds.x + 44 + 140, bounds.y + 54)
  const titleEditor = page.locator("textarea.gdg-input")
  await titleEditor.fill("Edited in Web")
  await titleEditor.press("Enter")
  await expect(page.locator("[data-testid='glide-cell-1-0']")).toContainText(
    "Edited in Web"
  )

  await page.mouse.click(bounds.x + 44 + 140, bounds.y + 18, {
    button: "right",
  })
  await page.getByRole("menuitem", { name: "Insert field right" }).click()
  const propertyForm = page.locator(".add-property-popover")
  await propertyForm.getByLabel("Name").fill("After title")
  await propertyForm.getByRole("button", { name: "Add property" }).click()
  await expect(page.locator("[data-testid='glide-cell-3-0']")).toHaveText(
    "Backlog"
  )

  await page.getByRole("button", { name: "Add Eidos File view" }).click()
  await page.getByLabel("View name").fill("Browser cards")
  await page.getByRole("button", { name: "Gallery", exact: true }).click()
  await page.getByRole("button", { name: "Create", exact: true }).click()
  await expect(
    page.getByRole("tab", { name: "Browser cards", exact: true })
  ).toBeVisible()

  await page.getByRole("button", { name: "Manage Eidos File views" }).click()
  await page.getByRole("button", { name: "Manage Browser cards view" }).click()
  await page.getByLabel("View name").fill("Reviewed cards")
  await page.getByRole("button", { name: "Save", exact: true }).click()
  await expect(
    page.getByRole("tab", { name: "Reviewed cards", exact: true })
  ).toBeVisible()

  await page.getByRole("tab", { name: "Grid", exact: true }).click()
  const gridBounds = await canvas.boundingBox()
  if (!gridBounds) throw new Error("The shared Eidos File Grid is not visible")
  await page.mouse.click(gridBounds.x + 44 + 140, gridBounds.y + 54, {
    button: "right",
  })
  await page.getByRole("menu", { name: "Record actions" }).waitFor()
  page.once("dialog", (dialog) => dialog.accept())
  await page.getByRole("menuitem", { name: "Delete record" }).click()
  await expect(
    page.locator("[data-testid='glide-cell-1-0']")
  ).not.toContainText("Edited in Web")

  await page.getByRole("button", { name: "Add Eidos File table" }).click()
  await page.getByRole("button", { name: /^New table/ }).click()
  await page.getByLabel("Name").fill("Browser table")
  await page.getByRole("button", { name: "Create", exact: true }).click()
  await expect(
    page.getByRole("tab", { name: "Browser table", exact: true })
  ).toHaveAttribute("aria-selected", "true")
})

test("calculates Grid column summaries through the browser runtime", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Chromium covers the shared Grid and SQLite WASM worker path"
  )
  await installFallbackMode(page)
  await page.addInitScript(() => {
    const messages: unknown[] = []
    const NativeWorker = window.Worker
    class InstrumentedWorker extends NativeWorker {
      constructor(scriptURL: string | URL, options?: WorkerOptions) {
        super(scriptURL, options)
        this.addEventListener("message", (event) => messages.push(event.data))
      }
    }
    Object.defineProperties(window, {
      __eidosFileWorkerMessages: { configurable: true, value: messages },
      Worker: { configurable: true, value: InstrumentedWorker },
    })
  })
  await page.goto("/")
  await page.getByRole("button", { name: "Open sample Eidos File" }).click()
  await page.locator("[data-testid='glide-cell-1-0']").waitFor({
    state: "attached",
  })

  const canvas = page.locator(
    ".eidos-file-content canvas[data-testid='data-grid-canvas']"
  )
  const bounds = await canvas.boundingBox()
  if (!bounds) throw new Error("The shared Eidos File Grid is not visible")

  // Row marker (44), Title (280), Status (180), then the Estimate header.
  const estimateHeaderX = bounds.x + 44 + 280 + 180 + 90
  await page.mouse.click(estimateHeaderX, bounds.y + 18, { button: "right" })
  await page.getByRole("menu", { name: "Actions for Estimate" }).waitFor()
  await page.getByRole("menuitem", { name: "Calculate" }).click()
  await page.getByRole("menu", { name: "Calculate Estimate" }).waitFor()
  await page.getByRole("menuitemradio", { name: "Sum" }).click()

  await expect
    .poll(() =>
      page.evaluate(() => {
        for (const message of window.__eidosFileWorkerMessages ?? []) {
          if (
            typeof message !== "object" ||
            message === null ||
            !("ok" in message) ||
            message.ok !== true ||
            !("result" in message) ||
            !Array.isArray(message.result)
          ) {
            continue
          }
          const result = message.result.find(
            (entry) =>
              typeof entry === "object" &&
              entry !== null &&
              entry.columnName === "estimate" &&
              entry.type === "sum"
          )
          if (result && typeof result.value === "number") return result.value
        }
        return null
      })
    )
    .toBe(17_486)

  await page.mouse.click(estimateHeaderX, bounds.y + 18, { button: "right" })
  await expect(
    page.getByRole("menuitem", { name: "Calculate · Sum" })
  ).toBeVisible()
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
  await page.getByRole("button", { name: "Open sample Eidos File" }).click()

  await page.getByRole("tab", { name: "Project cards" }).click()
  const gallery = page.locator("[data-eidos-file-gallery-scroll]")
  await expect(gallery).toBeVisible()
  const firstCard = gallery.locator('[data-eidos-file-row-id="project_00001"]')
  await expect(firstCard).toContainText("Ship Eidos File Web Editor")
  await firstCard.locator("h3").click()

  const inspector = page.locator('[data-eidos-file-detail-panel="record"]')
  await expect(inspector).toBeVisible()
  const title = inspector.getByRole("textbox", { name: "Title" })
  await title.fill("Ship Eidos File Web Editor — verified")
  await title.press("Control+Enter")
  await expect(page.locator(".save-status")).toContainText(/browser|Unsaved/)
  await page.getByRole("button", { name: "Close record details" }).click()
  await expect(firstCard).toContainText("verified")

  await page.getByRole("tab", { name: "By status" }).click()
  const kanban = page.locator("[data-eidos-file-kanban-scroll]")
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
  await page.getByRole("button", { name: "Open sample Eidos File" }).click()

  const scroller = page.locator(".eidos-file-content .dvn-scroller")
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

test("switches the live Eidos File experience between English and Chinese", async ({
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

  await expect(
    page.getByRole("heading", { name: /打开 Eidos File。/ })
  ).toBeVisible()
  await expect(page.getByText("格式、历史与应用。")).toBeVisible()
  await expect(page.getByText("SQLite 版本引擎")).toBeVisible()

  await expect(
    page.locator(".live-demo-grid [data-testid='glide-cell-1-0']")
  ).toContainText("Ship Eidos File Web Editor")
  await page.getByPlaceholder("搜索示例").fill("Project 2442")
  await expect(
    page.locator(".live-demo-grid [data-testid='glide-cell-1-0']")
  ).toContainText("Project 2442")

  await page.getByRole("button", { name: "打开完整编辑器" }).click()
  await expect(page.locator("[data-eidos-file-sheet-tabs]")).toContainText(
    "导入的副本"
  )
  await page.getByRole("button", { name: "Switch to English" }).click()
  await expect(page.locator("[data-eidos-file-sheet-tabs]")).toContainText(
    "Imported copy"
  )
})

test("keeps the editor first and publishes Eidos File documentation", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "One browser covers the shared landing and documentation UI"
  )
  await installFallbackMode(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto("/")

  await expect(
    page.getByRole("button", { name: "Open .eidos file" })
  ).toBeVisible()
  await expect(
    page.locator(".live-demo-grid canvas[data-testid='data-grid-canvas']")
  ).toBeVisible()
  await expect(
    page.locator('.site-nav a[href="https://graft.eidos.space/"]')
  ).toHaveText("Version Control")
  await expect(page.locator('.site-nav a[href="#/docs/overview"]')).toHaveText(
    "Open Format"
  )

  await page.locator('.site-nav a[href="#/docs/overview"]').click()
  await expect(page).toHaveURL(/#\/docs\/overview$/)
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Eidos File: an open, local-first table format",
    })
  ).toBeVisible()
  await expect(page.getByText("Start here")).toBeVisible()

  await page.locator('.docs-list a[href="#/docs/runtime"]').click()
  await expect(page).toHaveURL(/#\/docs\/runtime$/)
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Build an Eidos File editor with the runtime",
    })
  ).toBeVisible()
  await expect(
    page
      .locator("code")
      .filter({ hasText: "EidosFileEditorDataSource" })
      .first()
  ).toBeVisible()
  await expect(
    page.locator('.markdown-body pre[data-highlighted="true"]').first()
  ).toBeVisible()
  await expect(
    page.locator(".markdown-body .token.keyword").first()
  ).toBeVisible()

  await page.locator('.docs-list a[href="#/docs/custom-views"]').click()
  await expect(page).toHaveURL(/#\/docs\/custom-views$/)
  await page.getByRole("button", { name: "切换到中文" }).click()
  await expect(page.locator('.site-nav a[href="#/"]')).toHaveText("编辑工具")
  await expect(page.locator('.site-nav a[href="#/docs/overview"]')).toHaveText(
    "开放格式"
  )
  await expect(
    page.locator('.site-nav a[href="https://graft.eidos.space/"]')
  ).toHaveText("版本管理")
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "为 Eidos File 构建自定义视图",
    })
  ).toBeVisible()
})
