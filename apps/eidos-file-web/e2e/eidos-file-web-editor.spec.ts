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

  const dialog = page.getByText("Import CSV as a new table").locator("..")
  await expect(dialog).toContainText("2 rows")
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
  await expect(
    page.getByRole("button", {
      name: "将 CSV 导入为新的 Eidos File 数据表",
    })
  ).toBeVisible()
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
