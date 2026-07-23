import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

import { expect, test, type Locator, type Page } from "@playwright/test"

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
    await expect(page.locator(".save-status")).toContainText(/Unsaved|browser/)
  }
  await expect(cell).toHaveText("true")
}

async function dragSortable(
  page: Page,
  source: Locator,
  target: Locator,
  duringDrag?: () => Promise<void>,
  constraintViewport?: Locator
): Promise<void> {
  const sourceBox = await source.boundingBox()
  const targetBox = await target.boundingBox()
  if (!sourceBox || !targetBox)
    throw new Error("Sortable handle is not visible")
  const sourceX = sourceBox.x + sourceBox.width / 2
  const sourceY = sourceBox.y + sourceBox.height / 2
  const targetX = targetBox.x + targetBox.width / 2
  const targetY = targetBox.y + targetBox.height / 2
  await page.mouse.move(sourceX, sourceY)
  await page.mouse.down()
  await page.mouse.move(sourceX + 12, sourceY + 4, { steps: 3 })
  if (constraintViewport) {
    const viewportBox = await constraintViewport.boundingBox()
    const sortable = source.locator(
      "xpath=ancestor::*[@data-eidos-file-sortable-tab][1]"
    )
    const sortableBox = await sortable.boundingBox()
    if (!viewportBox || !sortableBox) {
      throw new Error("Horizontal sortable track is not visible")
    }
    await page.mouse.move(
      viewportBox.x + viewportBox.width + 240,
      sourceY + 180,
      { steps: 8 }
    )
    await expect
      .poll(async () => {
        const current = await sortable.boundingBox()
        if (!current) {
          return { staysInViewport: false, staysOnTrack: false }
        }
        const staysOnTrack = Math.abs(current.y - sortableBox.y) <= 1
        const staysInViewport =
          current.x >= viewportBox.x - 1 &&
          current.x + current.width <= viewportBox.x + viewportBox.width + 1
        return { staysInViewport, staysOnTrack }
      })
      .toEqual({ staysInViewport: true, staysOnTrack: true })
  }
  await page.mouse.move(targetX, targetY, { steps: 12 })
  await duringDrag?.()
  await page.mouse.up()
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
    await expect(page.locator(".save-status")).toContainText(
      "Saved to original"
    )

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
    await expect(page.locator(".save-status")).toContainText(
      "Saved to original"
    )
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

test("publishes an installable manifest and prompt-ready service worker", async ({
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
  const serviceWorkerResponse = await request.get("/sw.js")
  expect(serviceWorkerResponse.ok()).toBe(true)
  const serviceWorker = await serviceWorkerResponse.text()
  expect(serviceWorker).toContain("SKIP_WAITING")
  expect(serviceWorker).not.toContain("clientsClaim")
  expect(serviceWorker).not.toMatch(/["']use strict["'];self\.skipWaiting\(\)/)
  expect(serviceWorker).toContain("pwa-update-policy.js")
  const updatePolicyResponse = await request.get("/pwa-update-policy.js")
  expect(updatePolicyResponse.ok()).toBe(true)
  const updatePolicy = await updatePolicyResponse.text()
  expect(updatePolicy).toContain("eidos-file-pwa-update-prompt-ready-v1")
  expect(updatePolicy).toContain("self.clients.claim()")
  expect(updatePolicy).toContain("self.clients.matchAll")
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
  await expect(page.locator(".save-status")).toContainText("Downloaded a copy")

  await page.reload()
  await page.locator("input[type=file]").setInputFiles(savedPath)
  await expect(page.locator("[data-testid='glide-cell-5-0']")).toHaveText(
    "true"
  )
  await expect(page.getByText("SQLite 1", { exact: true })).toBeVisible()
})

test("creates a new blank Eidos File and saves an editable copy", async ({
  page,
}, testInfo) => {
  await installFallbackMode(page)
  await page.goto("/")

  await page.getByRole("button", { name: "New blank Eidos File" }).click()
  await expect(page.locator(".file-identity strong")).toHaveText(
    "untitled.eidos"
  )
  await expect(
    page.getByRole("tab", { name: "Table", exact: true })
  ).toHaveAttribute("aria-selected", "true")
  await expect(
    page.getByRole("tab", { name: "Grid", exact: true })
  ).toHaveAttribute("aria-selected", "true")
  await expect(page.locator(".save-status")).toContainText(
    "Changes stay in browser"
  )
  await expect(
    page.locator(".title-actions").getByRole("button", { name: "New" })
  ).toBeVisible()
  await expect(
    page.locator(".eidos-file-content").getByText("Name", { exact: true })
  ).toHaveText("Name")

  await page.getByRole("button", { name: "Add Eidos File table" }).click()
  await page.getByRole("button", { name: /^New table/ }).click()
  await page.getByLabel("Name").fill("Notes")
  await page.getByRole("button", { name: "Create", exact: true }).click()
  await expect(
    page.getByRole("tab", { name: "Notes", exact: true })
  ).toHaveAttribute("aria-selected", "true")

  const downloadPromise = page.waitForEvent("download")
  await page
    .locator(".title-actions .toolbar-button")
    .filter({ hasText: "Save As" })
    .click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe("untitled.eidos")
  const savedPath = testInfo.outputPath("new-blank.eidos")
  await download.saveAs(savedPath)

  await page.reload()
  await page.locator("input[type=file]").setInputFiles(savedPath)
  await expect(
    page.getByRole("tab", { name: "Table", exact: true })
  ).toHaveAttribute("aria-selected", "true")
  await expect(
    page.getByRole("tab", { name: "Notes", exact: true })
  ).toBeVisible()
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

test("opens an advanced starter file from the template picker", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Chromium covers the template picker and SQLite worker handoff"
  )
  await installFallbackMode(page)
  await page.goto("/")

  await page.getByRole("button", { name: "Choose a template" }).click()
  const picker = page.locator("#eidos-file-template-list")
  await expect(picker).toBeVisible()
  await expect(
    picker.getByRole("heading", { name: "Start from a template" })
  ).toBeVisible()
  await expect(picker.getByRole("listitem")).toHaveCount(8)
  await expect(picker).toContainText("Relations · Lookups · Formula · Timeline")

  const templateResponse = page.waitForResponse((response) =>
    response.url().includes("personal-crm")
  )
  await picker
    .getByRole("button", { name: "Open Personal CRM template" })
    .click()
  await expect((await templateResponse).status()).toBeLessThan(400)

  await expect(
    page.getByRole("tab", { name: "People", exact: true })
  ).toHaveAttribute("aria-selected", "true")
  await expect(
    page.getByRole("tab", { name: "Companies", exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole("tab", { name: "Interactions", exact: true })
  ).toBeVisible()
  await expect(page.locator("[data-testid='glide-cell-1-0']")).toContainText(
    "Avery Stone"
  )
  await expect(page.locator("[data-testid='glide-cell-5-0']")).toContainText(
    "100"
  )
})

test("opens every additional template on its primary table", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Chromium covers every generated template through the browser runtime"
  )
  await installFallbackMode(page)

  const templates = [
    {
      button: "Open Household finance template",
      asset: "household-finance",
      table: "Transactions",
      firstRecord: "Monthly salary",
    },
    {
      button: "Open Reading library template",
      asset: "reading-library",
      table: "Books",
      firstRecord: "The Dispossessed",
    },
    {
      button: "Open Habit journal template",
      asset: "habit-journal",
      table: "Daily logs",
      firstRecord: "Morning walk",
    },
    {
      button: "Open Content calendar template",
      asset: "content-calendar",
      table: "Content",
      firstRecord: "Why files still matter",
    },
    {
      button: "Open Eidos 1.0 Feature Lab template",
      asset: "feature-lab",
      table: "Experiments",
      firstRecord: "Feature Lab launch",
    },
    {
      button: "Open Field capability matrix template",
      asset: "field-capability-matrix",
      table: "Field capabilities",
      firstRecord: "Row ID",
    },
  ] as const

  for (const template of templates) {
    await page.goto("/")
    await page.getByRole("button", { name: "Choose a template" }).click()
    const templateResponse = page.waitForResponse((response) =>
      response.url().includes(template.asset)
    )
    await page.getByRole("button", { name: template.button }).click()
    await expect((await templateResponse).status()).toBeLessThan(400)
    await expect(
      page.getByRole("tab", { name: template.table, exact: true })
    ).toHaveAttribute("aria-selected", "true")
    await expect(page.locator("[data-testid='glide-cell-1-0']")).toContainText(
      template.firstRecord
    )
  }
})

test("opens every template with Chinese schema and sample data", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Chromium covers localized fixtures through the browser runtime"
  )
  await installFallbackMode(page)
  await page.addInitScript(() => {
    localStorage.setItem("eidos-file-locale", "zh")
  })

  const templates = [
    {
      button: "打开 个人关系管理模板",
      asset: "personal-crm.zh",
      table: "联系人",
      firstRecord: "Avery Stone",
    },
    {
      button: "打开 家庭财务模板",
      asset: "household-finance.zh",
      table: "流水",
      firstRecord: "月度工资",
    },
    {
      button: "打开 阅读资料库模板",
      asset: "reading-library.zh",
      table: "书籍",
      firstRecord: "The Dispossessed",
    },
    {
      button: "打开 习惯日志模板",
      asset: "habit-journal.zh",
      table: "每日日志",
      firstRecord: "晨间散步",
    },
    {
      button: "打开 内容日历模板",
      asset: "content-calendar.zh",
      table: "内容",
      firstRecord: "为什么文件依然重要",
    },
    {
      button: "打开 Eidos 1.0 全功能实验室模板",
      asset: "feature-lab.zh",
      table: "实验",
      firstRecord: "全功能实验室启动",
    },
    {
      button: "打开 字段能力矩阵模板",
      asset: "field-capability-matrix.zh",
      table: "字段能力",
      firstRecord: "行 ID",
    },
  ] as const

  for (const template of templates) {
    await page.goto("/")
    await page.getByRole("button", { name: "选择体验模板" }).click()
    const templateResponse = page.waitForResponse((response) =>
      response.url().includes(template.asset)
    )
    await page.getByRole("button", { name: template.button }).click()
    await expect((await templateResponse).status()).toBeLessThan(400)
    await expect(
      page.getByRole("tab", { name: template.table, exact: true })
    ).toHaveAttribute("aria-selected", "true")
    await expect(page.locator("[data-testid='glide-cell-1-0']")).toContainText(
      template.firstRecord
    )
  }
})

test("loads Feature Lab with readable Relations and editable dependencies", async ({
  page,
  browserName,
}) => {
  test.setTimeout(90_000)
  test.skip(
    browserName !== "chromium",
    "Chromium covers Feature Lab through the SQLite WASM worker"
  )
  await installFallbackMode(page)
  await page.goto("/")
  await page.getByRole("button", { name: "Choose a template" }).click()
  const response = page.waitForResponse((candidate) =>
    candidate.url().includes("feature-lab")
  )
  await page
    .getByRole("button", { name: "Open Eidos 1.0 Feature Lab template" })
    .click()
  await expect((await response).status()).toBeLessThan(400)

  await expect(
    page.getByRole("tab", { name: "Experiments", exact: true })
  ).toHaveAttribute("aria-selected", "true")
  await expect(
    page.getByRole("tab", { name: "People", exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole("tab", { name: "By stage", exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole("tab", { name: "Lab gallery", exact: true })
  ).toBeVisible()
  await expect(page.locator("[data-testid='glide-cell-1-0']")).toContainText(
    "Feature Lab launch"
  )

  const tableTabList = page.getByRole("tablist", {
    name: "Eidos File tables",
  })
  const tableOrder = () =>
    tableTabList
      .getByRole("tab")
      .evaluateAll((tabs) => tabs.map((tab) => tab.textContent?.trim()))
  const tableOrderBefore = await tableOrder()
  await dragSortable(
    page,
    page.getByRole("button", { name: "Reorder People table" }),
    page.getByRole("button", { name: "Reorder Experiments table" }),
    undefined,
    page.locator("[data-eidos-file-sheet-tabs-viewport]")
  )
  await expect.poll(tableOrder).not.toEqual(tableOrderBefore)

  const viewTabList = page.getByRole("tablist", { name: "Eidos File views" })
  const viewOrder = () =>
    viewTabList
      .getByRole("tab")
      .evaluateAll((tabs) => tabs.map((tab) => tab.textContent?.trim()))
  const viewOrderBefore = await viewOrder()
  await dragSortable(
    page,
    page.getByRole("button", { name: "Reorder Lab gallery view" }),
    page.getByRole("button", { name: "Reorder Grid view" }),
    undefined,
    page.locator("[data-eidos-file-view-tabs-viewport]")
  )
  await expect.poll(viewOrder).not.toEqual(viewOrderBefore)

  const workbarActions = page.locator("[data-eidos-file-workbar-actions]")
  const actionOrder = await workbarActions
    .locator("button")
    .evaluateAll((buttons) =>
      buttons.map(
        (button) =>
          button.getAttribute("aria-label") ?? button.textContent?.trim()
      )
    )
  expect(actionOrder.indexOf("Search Eidos File rows")).toBeLessThan(
    actionOrder.indexOf("Filter Eidos File rows")
  )
  expect(actionOrder.indexOf("Filter Eidos File rows")).toBeLessThan(
    actionOrder.indexOf("Sort Eidos File rows")
  )
  expect(actionOrder.indexOf("Sort Eidos File rows")).toBeLessThan(
    actionOrder.indexOf("Manage fields")
  )
  expect(actionOrder).not.toContain("Property")

  const fieldsButton = page.getByRole("button", { name: "Manage fields" })
  await expect(fieldsButton).toBeVisible()
  const fieldSearch = page.getByRole("textbox", { name: "Search fields" })
  await expect(async () => {
    if (!(await fieldSearch.isVisible())) await fieldsButton.click()
    await expect(fieldSearch).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 15_000 })
  const fieldList = page.locator("[data-eidos-file-view-fields-list]")
  const fieldOrder = () =>
    fieldList
      .locator('button[aria-label^="Reorder "]')
      .evaluateAll((handles) =>
        handles.map((handle) => handle.getAttribute("aria-label"))
      )
  const fieldOrderBefore = await fieldOrder()
  const fieldHandles = fieldList.locator('button[aria-label^="Reorder "]')
  await expect(fieldHandles).toHaveCount(fieldOrderBefore.length)
  await dragSortable(
    page,
    fieldHandles.nth(0),
    fieldHandles.nth(1),
    async () => {
      expect(
        await fieldList.evaluate(
          (element) => element.scrollWidth <= element.clientWidth
        )
      ).toBe(true)
    }
  )
  await expect.poll(fieldOrder).not.toEqual(fieldOrderBefore)
  await expect(
    page.getByRole("button", { name: /Move (up|down)/ })
  ).toHaveCount(0)
  await fieldSearch.fill("Assets")
  const assetsVisibility = page.getByRole("checkbox", {
    name: "Show Assets",
  })
  const assetsVisibilityLabel = page
    .locator("[data-eidos-file-view-fields-list] label")
    .filter({ has: assetsVisibility })
  await expect(assetsVisibility).toBeChecked()
  await assetsVisibilityLabel.click()
  await expect(assetsVisibility).not.toBeChecked()
  await assetsVisibilityLabel.click()
  await expect(assetsVisibility).toBeChecked()
  await fieldSearch.fill("")
  await page.getByRole("button", { name: "Edit Assets properties" }).click()
  await expect(
    page.locator('[data-eidos-file-detail-panel="field"]')
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Close field properties" })
  ).toBeVisible()
  await page.getByRole("button", { name: "Close field properties" }).click()

  await page.getByRole("tab", { name: "By stage", exact: true }).click()
  await fieldsButton.click()
  await page.getByRole("button", { name: "Edit Stage properties" }).click()
  await expect(
    page.locator('[data-eidos-file-detail-panel="field"]')
  ).toBeVisible()
  await page.getByRole("button", { name: "Close field properties" }).click()

  await page.getByRole("tab", { name: "Lab gallery", exact: true }).click()
  const firstCard = page
    .locator("[data-eidos-file-gallery-scroll]")
    .getByRole("listitem")
    .filter({ hasText: "Feature Lab launch" })
    .first()
  await expect(firstCard).toContainText("Avery Chen")
  await expect(firstCard).toContainText("Mina Park, Theo Martin")
  await expect(firstCard).not.toContainText(
    /[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/
  )
  const galleryScroll = page.locator("[data-eidos-file-gallery-scroll]")
  const galleryWidthBeforeInspector = await galleryScroll.evaluate(
    (element) => element.clientWidth
  )
  await firstCard.locator("h3").click()

  const inspector = page.locator('[data-eidos-file-detail-panel="record"]')
  await expect(inspector).toBeVisible()
  await expect(inspector).toHaveCSS("position", "absolute")
  const inspectorBounds = await inspector.boundingBox()
  if (!inspectorBounds) throw new Error("Record inspector is not visible")
  expect(inspectorBounds.width).toBeGreaterThanOrEqual(470)
  expect(await galleryScroll.evaluate((element) => element.clientWidth)).toBe(
    galleryWidthBeforeInspector
  )
  const summary = inspector.getByRole("textbox", { name: "Summary" })
  await summary.fill("Edited in the Feature Lab")
  await summary.press("Control+Enter")
  await expect(summary).toHaveValue("Edited in the Feature Lab")

  const progress = inspector.getByRole("spinbutton", { name: "Progress" })
  await progress.fill("0.5")
  await progress.press("Enter")
  const weightedBudget = inspector
    .getByText("Weighted budget", { exact: true })
    .locator("..")
  await expect(weightedBudget).toContainText("62500.25")

  await page.getByRole("button", { name: "Close record details" }).click()
  await page.getByRole("tab", { name: "Grid", exact: true }).click()
  await page.locator("[data-testid='glide-cell-1-0']").waitFor({
    state: "attached",
  })
  const canvas = page.locator(
    ".eidos-file-content canvas[data-testid='data-grid-canvas']"
  )
  const bounds = await canvas.boundingBox()
  if (!bounds) throw new Error("Feature Lab Grid is not visible")
  const recordMenu = page.getByRole("menu", { name: "Record actions" })
  await expect(async () => {
    await page.mouse.click(bounds.x + 44 + 140, bounds.y + 54, {
      button: "right",
    })
    await expect(recordMenu).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 15_000 })
  await recordMenu.getByRole("menuitem", { name: "Open record" }).click()
  await expect(inspector).toBeVisible()
  const gridBoundsWithInspector = await canvas.boundingBox()
  if (!gridBoundsWithInspector) throw new Error("Feature Lab Grid disappeared")
  expect(Math.abs(gridBoundsWithInspector.width - bounds.width)).toBeLessThan(1)

  const stage = inspector.getByRole("combobox", { name: "Stage" })
  await expect(
    stage.locator('[data-eidos-file-option-color="blue"]')
  ).toBeVisible()
  await stage.click()
  const runningOption = page.getByRole("option", {
    name: "Running",
    exact: true,
  })
  await expect(
    runningOption.locator('[data-eidos-file-option-color="blue"]')
  ).toBeVisible()
  await runningOption.click()

  const owner = inspector.getByRole("button", { name: "Owner", exact: true })
  await expect(owner).toHaveText(/Avery Chen/)
  await owner.click()
  await page.getByRole("option", { name: "Mina Park", exact: true }).click()
  await expect(owner).toHaveText(/Mina Park/)
  const relationBackedLoad = inspector
    .getByText("Relation-backed load", { exact: true })
    .locator("..")
  await expect(relationBackedLoad).toContainText("34")
  await expect(page.locator(".save-status")).toContainText(/Unsaved|browser/)
})

test("persists a Grid multi-select edit when its popover closes", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Chromium covers the multi-select overlay and SQLite WASM commit"
  )
  await installFallbackMode(page)
  await page.goto("/")
  await page.getByRole("button", { name: "Choose a template" }).click()
  await page
    .getByRole("button", { name: "Open Eidos 1.0 Feature Lab template" })
    .click()
  await expect(
    page.getByRole("tab", { name: "Experiments", exact: true })
  ).toHaveAttribute("aria-selected", "true")

  await page.getByRole("button", { name: "Manage fields" }).click()
  await page.getByRole("textbox", { name: "Search fields" }).fill("Signals")
  const signalsVisibility = page.getByRole("checkbox", {
    name: "Show Signals",
  })
  if (!(await signalsVisibility.isChecked())) {
    await page
      .locator("[data-eidos-file-view-fields-list] label")
      .filter({ has: signalsVisibility })
      .click()
  }
  await expect(signalsVisibility).toBeChecked()
  await page.getByRole("textbox", { name: "Search fields" }).fill("")
  const visibleFieldNames = await page
    .locator("[data-eidos-file-view-fields-list]")
    .getByRole("checkbox")
    .evaluateAll((checkboxes) =>
      checkboxes.flatMap((checkbox) => {
        if (!(checkbox instanceof HTMLInputElement) || !checkbox.checked) {
          return []
        }
        return [checkbox.getAttribute("aria-label")?.replace(/^Show /, "")]
      })
    )
  const titleColumn = visibleFieldNames.indexOf("Experiment") + 1
  const signalsColumn = visibleFieldNames.indexOf("Signals") + 1
  expect(titleColumn).toBeGreaterThan(0)
  expect(signalsColumn).toBeGreaterThan(titleColumn)
  await page.keyboard.press("Escape")

  const signalsCell = page.locator(
    `[data-testid='glide-cell-${signalsColumn}-0']`
  )
  const titleCell = page.locator(`[data-testid='glide-cell-${titleColumn}-0']`)
  const canvas = page.locator(
    ".eidos-file-content canvas[data-testid='data-grid-canvas']"
  )
  const openSignalsCell = async () => {
    const bounds = await canvas.boundingBox()
    if (!bounds) throw new Error("Feature Lab Grid is not visible")
    await page.mouse.click(bounds.x + 44 + 140, bounds.y + 54)
    await expect(titleCell).toHaveAttribute("aria-selected", "true")
    for (let column = titleColumn + 1; column <= signalsColumn; column += 1) {
      await page.keyboard.press("ArrowRight")
      await expect(
        page.locator(`[data-testid='glide-cell-${column}-0']`)
      ).toHaveAttribute("aria-selected", "true")
    }
    await page.keyboard.press("Enter")
  }
  await expect(signalsCell).toBeAttached()
  await openSignalsCell()

  const speedOption = page.locator("[cmdk-item]").filter({ hasText: "Speed" })
  await expect(speedOption).toBeVisible()
  await speedOption.click()
  await page.locator(".file-identity").click()

  await expect(
    page.locator("[data-eidos-file-grid-write-recovery]")
  ).toHaveCount(0)
  await page.getByRole("tab", { name: "People", exact: true }).click()
  await page.getByRole("tab", { name: "Experiments", exact: true }).click()
  await expect(signalsCell).toBeAttached()
  await openSignalsCell()
  await expect(page.locator('svg[data-id="Speed"]')).toBeVisible()
})

test("exports the current Eidos File view as readable CSV", async ({
  page,
  browserName,
}, testInfo) => {
  test.skip(
    browserName !== "chromium",
    "Chromium covers the SQLite WASM CSV download"
  )
  await installFallbackMode(page)
  await page.goto("/")
  await page.getByRole("button", { name: "Choose a template" }).click()
  await page
    .getByRole("button", { name: "Open Eidos 1.0 Feature Lab template" })
    .click()
  await expect(
    page.getByRole("tab", { name: "Experiments", exact: true })
  ).toHaveAttribute("aria-selected", "true")

  await page.getByRole("button", { name: "Search Eidos File rows" }).click()
  await page.locator("input[type='search']").fill("Relation labels")
  await expect(page.locator("[data-testid='glide-cell-1-0']")).toContainText(
    "Relation labels"
  )

  const downloadPromise = page.waitForEvent("download")
  await page.getByRole("tab", { name: "Grid", exact: true }).click({
    button: "right",
  })
  await page
    .getByRole("menuitem", { name: "Export current view as CSV" })
    .click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe(
    "eidos-1.0-feature-lab - Experiments - Grid.csv"
  )
  const csvPath = testInfo.outputPath("feature-lab-grid.csv")
  await download.saveAs(csvPath)
  const csv = await readFile(csvPath, "utf8")
  const lines = csv
    .replace(/^\uFEFF/, "")
    .trimEnd()
    .split("\r\n")

  expect(lines).toHaveLength(2)
  expect(lines[0]).toContain("Experiment")
  expect(lines[0]).toContain("Owner")
  expect(lines[0]).not.toContain("Summary")
  expect(lines[1]).toContain("Relation labels")
  expect(lines[1]).toContain("Mina Park")
  expect(lines[1]).toContain("Theo Martin")
  expect(lines[1]).not.toMatch(
    /[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/
  )

  const tableDownloadPromise = page.waitForEvent("download")
  await page.getByRole("tab", { name: "Experiments", exact: true }).click({
    button: "right",
  })
  await page
    .getByRole("menuitem", { name: "Export entire table as CSV" })
    .click()
  const tableDownload = await tableDownloadPromise
  expect(tableDownload.suggestedFilename()).toBe(
    "eidos-1.0-feature-lab - Experiments.csv"
  )
  const tableCsvPath = testInfo.outputPath("feature-lab-experiments.csv")
  await tableDownload.saveAs(tableCsvPath)
  const tableCsv = await readFile(tableCsvPath, "utf8")
  const tableLines = tableCsv
    .replace(/^\uFEFF/, "")
    .trimEnd()
    .split("\r\n")

  expect(tableLines).toHaveLength(181)
  expect(tableLines[0]).toContain("Summary")
  expect(tableLines[0]).toContain("Signals")
  expect(tableCsv).toContain("Feature Lab launch")
  expect(tableCsv).toContain("Feature experiment 180")
})

test("embeds the template-backed field matrix as a read-only documentation table", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Chromium covers the documentation SQLite WASM worker"
  )
  await installFallbackMode(page)
  await page.goto("/docs/format/")

  const embed = page.locator('[data-eidos-file-doc-embed="field-capabilities"]')
  await expect(embed).toHaveAttribute("data-eidos-file-readonly", "true")
  await expect(embed).toContainText(
    "Read-only · same file as the editor template"
  )
  await embed.locator("[data-testid='glide-cell-1-0']").waitFor({
    state: "attached",
  })
  await expect(embed.locator("[data-testid='glide-cell-1-0']")).toContainText(
    "Row ID"
  )
  await embed
    .getByRole("textbox", { name: "Search fields and capabilities" })
    .fill("FileEntry JSON array")
  await expect(embed.locator("[data-testid='glide-cell-1-0']")).toContainText(
    "File"
  )

  await embed.getByRole("button", { name: "Maximize table in page" }).click()
  await expect(embed).toHaveAttribute("data-maximized", "true")
  const maximizedBounds = await embed.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    return {
      width: bounds.width,
      height: bounds.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    }
  })
  expect(maximizedBounds.width).toBeGreaterThan(
    maximizedBounds.viewportWidth - 40
  )
  expect(maximizedBounds.height).toBeGreaterThan(
    maximizedBounds.viewportHeight - 40
  )
  expect(maximizedBounds.width).toBeLessThan(maximizedBounds.viewportWidth)
  expect(maximizedBounds.height).toBeLessThan(maximizedBounds.viewportHeight)
  await expect
    .poll(() =>
      page.evaluate(() => ({
        fullscreen: document.fullscreenElement !== null,
        overflow: document.body.style.overflow,
      }))
    )
    .toEqual({ fullscreen: false, overflow: "hidden" })

  await page.keyboard.press("Escape")
  await expect(embed).toHaveAttribute("data-maximized", "false")
  await expect(
    embed.getByRole("button", { name: "Maximize table in page" })
  ).toBeFocused()
})

test("keeps the documentation header visible when the TOC scrolls the article", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Chromium covers the desktop documentation scroll-container contract"
  )
  await page.goto("/docs/format/")

  await page.locator(".docs-toc button").first().click()
  await expect
    .poll(() =>
      page.locator(".docs-article").evaluate((article) => article.scrollTop)
    )
    .toBeGreaterThan(0)

  const scrollState = await page.evaluate(() => ({
    headerTop:
      document.querySelector(".docs-header")?.getBoundingClientRect().top ?? -1,
    windowScrollY: window.scrollY,
  }))
  expect(scrollState).toEqual({ headerTop: 0, windowScrollY: 0 })
})

test("uses the filtered row count for the Grid virtual height", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Chromium covers the SQLite worker count and Grid virtual-scroll boundary"
  )
  await installFallbackMode(page)
  await page.goto("/")
  await page.getByRole("button", { name: "Open sample Eidos File" }).click()
  await page.locator("[data-testid='glide-cell-1-0']").waitFor({
    state: "attached",
  })

  await page.getByRole("button", { name: "Filter Eidos File rows" }).click()
  const filterPopover = page.locator("[data-eidos-file-filter-popover]")
  await filterPopover.getByRole("button", { name: "Add filter" }).click()
  await page.getByRole("button", { name: "Add condition" }).click()
  const filterSelects = filterPopover.getByRole("combobox")
  await filterSelects.nth(1).click()
  await page.getByRole("option", { name: "Estimate", exact: true }).click()
  await filterSelects.nth(2).click()
  await page.getByRole("option", { name: "is greater than" }).click()
  await filterPopover.getByPlaceholder("Value").fill("10")
  await filterPopover.getByRole("button", { name: "Apply" }).click()

  const scroller = page.locator(".eidos-file-content .dvn-scroller")
  await expect
    .poll(() => scroller.evaluate((element) => element.scrollHeight))
    .toBeLessThan(30_000)
  await scroller.evaluate((element) => {
    element.scrollTop = element.scrollHeight
    element.dispatchEvent(new Event("scroll"))
  })
  await expect(page.locator("[data-testid='glide-cell-1-575']")).toContainText(
    "Project 2495"
  )
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
    return {
      demo: demo?.toJSON(),
      documentHeight: document.documentElement.scrollHeight,
      grid: grid?.toJSON(),
      pageOverflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      panel: panel?.toJSON(),
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
      grid: rect(".live-demo-grid"),
      panel: rect(".launch-panel"),
      workbench: rect(".launch-workbench"),
      documentHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
      scroller: scroller
        ? {
            clientHeight: scroller.clientHeight,
            scrollHeight: scroller.scrollHeight,
          }
        : null,
    }
  })

  expect(geometry.workbench?.height).toBeLessThanOrEqual(
    geometry.viewportHeight
  )
  expect(geometry.workbench?.bottom).toBeLessThanOrEqual(
    geometry.viewportHeight + 1
  )
  expect(geometry.panel?.bottom).toBeLessThanOrEqual(
    (geometry.workbench?.bottom ?? 0) + 1
  )
  expect(geometry.copy?.top).toBeGreaterThanOrEqual(
    geometry.workbench?.top ?? 0
  )
  expect(geometry.grid?.height).toBeLessThan(geometry.viewportHeight)
  expect(geometry.documentHeight).toBeLessThanOrEqual(
    geometry.viewportHeight + 1
  )
  expect(geometry.scroller?.clientHeight).toBeLessThan(geometry.viewportHeight)
  expect(geometry.scroller?.scrollHeight).toBeGreaterThan(
    geometry.scroller?.clientHeight ?? 0
  )
  await expect(
    page.getByRole("heading", { name: /Open an Eidos File/i })
  ).toBeInViewport()
  await expect(
    page.getByRole("button", { name: "Open .eidos file" })
  ).toBeInViewport()
  await expect(page.locator(".landing-section")).toHaveCount(0)
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
  await expect(primaryNavigation).toHaveCount(4)
  const primaryNavigationRegion = page.locator(".site-nav")
  await expect(
    primaryNavigationRegion.getByRole("link", { name: "Editor" })
  ).toBeVisible()
  await expect(
    primaryNavigationRegion.getByRole("link", { name: "Open Format" })
  ).toBeVisible()
  const versionControlLink = primaryNavigationRegion.getByRole("link", {
    name: /Version Control/,
  })
  await expect(versionControlLink).toBeVisible()
  await expect(
    versionControlLink.locator(".site-nav-compact-label")
  ).toHaveText("Version")
  const sqliteInspectorLink = primaryNavigationRegion.getByRole("link", {
    name: "Open the read-only SQLite Inspector in a new tab",
  })
  await expect(sqliteInspectorLink).toBeVisible()
  await expect(sqliteInspectorLink).toHaveAttribute(
    "href",
    "https://sqlite.eidos.space/"
  )
  await expect(sqliteInspectorLink).toHaveAttribute("target", "_blank")
  await expect(
    sqliteInspectorLink.locator("svg.lucide-arrow-up-right")
  ).toBeVisible()
  expect(
    await primaryNavigation.evaluateAll((links) =>
      links.map((link) => link.getAttribute("href"))
    )
  ).toEqual([
    "/",
    "/docs/",
    "https://sqlite.eidos.space/",
    "https://graft.eidos.space/",
  ])
  expect(
    await primaryNavigation.evaluateAll((links) =>
      links.every((link) => link.getBoundingClientRect().height >= 44)
    )
  ).toBe(true)
  expect(
    await primaryNavigation.evaluateAll((links) => {
      const rects = links.map((link) => link.getBoundingClientRect())
      return (
        new Set(rects.map((rect) => Math.round(rect.top))).size === 1 &&
        rects.every((rect) => rect.left >= 0 && rect.right <= window.innerWidth)
      )
    })
  ).toBe(true)
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth
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
  await expect(page.locator(".save-status")).toContainText(/Unsaved|browser/)

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
  await page.getByRole("combobox", { name: "Language" }).selectOption("zh")
  await page.getByRole("button", { name: "添加 Eidos File 数据表" }).click()
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
  test.setTimeout(90_000)
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
  const propertyForm = page.locator("[data-eidos-file-field-create='true']")
  await propertyForm.getByLabel("Name").fill("After title")
  await propertyForm.getByRole("button", { name: "Create field" }).click()
  await expect(page.locator("[data-testid='glide-cell-3-0']")).toHaveText(
    "Backlog"
  )

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

  await page.getByRole("button", { name: "Add Eidos File view" }).click()
  await page.getByLabel("View name").fill("Browser cards")
  await page.getByRole("button", { name: "Gallery", exact: true }).click()
  await page.getByRole("button", { name: "Create", exact: true }).click()
  await expect(
    page.getByRole("tab", { name: "Browser cards", exact: true })
  ).toBeVisible()

  const browserCardsTab = page.getByRole("tab", {
    name: "Browser cards",
    exact: true,
  })
  await browserCardsTab.click({ button: "right" })
  await expect(
    page.getByRole("menuitem", { name: "Rename view" })
  ).toBeVisible()
  await expect(
    page.getByRole("menuitem", { name: "Configure view" })
  ).toBeVisible()
  await expect(
    page.getByRole("menuitem", { name: "Delete view" })
  ).toBeVisible()
  await page.getByRole("menuitem", { name: "Rename view" }).click()
  await page.getByLabel("View name").fill("Reviewed cards")
  await page.getByRole("button", { name: "Save", exact: true }).click()
  const reviewedCardsTab = page.getByRole("tab", {
    name: "Reviewed cards",
    exact: true,
  })
  await expect(reviewedCardsTab).toBeVisible()
  await page.keyboard.press("Escape")
  await reviewedCardsTab.click({ button: "right" })
  await page.getByRole("menuitem", { name: "Delete view" }).click()
  await expect(page.getByText("Delete “Reviewed cards”?")).toBeVisible()
  await page.getByRole("button", { name: "Delete", exact: true }).click()
  await expect(reviewedCardsTab).toBeHidden()
  const gridTab = page.getByRole("tab", { name: "Grid", exact: true })
  await expect(gridTab).toHaveAttribute("aria-selected", "true")
  await gridTab.click({ button: "right" })
  await expect(
    page.getByRole("menuitem", { name: "Delete view" })
  ).toHaveAttribute("data-disabled", "")
  const protectedViewMenu = page.getByRole("menu")
  await protectedViewMenu.press("Escape")
  await expect(protectedViewMenu).toBeHidden()

  await page.getByRole("button", { name: "Add Eidos File table" }).click()
  await page.getByRole("button", { name: /^New table/ }).click()
  await page.getByLabel("Name").fill("Browser table")
  await page.getByRole("button", { name: "Create", exact: true }).click()
  const browserTableTab = page.getByRole("tab", {
    name: "Browser table",
    exact: true,
  })
  await expect(browserTableTab).toHaveAttribute("aria-selected", "true")
  await browserTableTab.click({ button: "right" })
  await expect(
    page.getByRole("menuitem", { name: "Rename table" })
  ).toBeVisible()
  await expect(
    page.getByRole("menuitem", { name: "Delete table" })
  ).toBeVisible()
  await page.getByRole("menuitem", { name: "Rename table" }).click()
  await page.getByLabel("Name").fill("Reviewed table")
  await page.getByRole("button", { name: "Rename", exact: true }).click()
  const reviewedTableTab = page.getByRole("tab", {
    name: "Reviewed table",
    exact: true,
  })
  await expect(reviewedTableTab).toBeVisible()
  await reviewedTableTab.click({ button: "right" })
  await page.getByRole("menuitem", { name: "Delete table" }).click()
  await expect(page.getByText("Delete table “Reviewed table”?")).toBeVisible()
  await page.getByRole("button", { name: "Delete table", exact: true }).click()
  await expect(reviewedTableTab).toBeHidden()
  const projectsTableTab = page.getByRole("tab", {
    name: "Projects",
    exact: true,
  })
  await expect(projectsTableTab).toHaveAttribute("aria-selected", "true")
  await projectsTableTab.click({ button: "right" })
  await expect(
    page.getByRole("menuitem", { name: "Delete table" })
  ).not.toHaveAttribute("data-disabled", "")
})

test("creates Formula, Relation, and Lookup fields through the shared editor UI", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Chromium covers the browser worker and advanced shared field editors"
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

  const openFieldCreator = async (name: string, type: string) => {
    const creator = page.locator("[data-eidos-file-field-create='true']")
    const fieldsButton = page
      .locator("[data-eidos-file-workbar-actions]")
      .getByRole("button", { name: "Manage fields" })
    await expect(async () => {
      if (!(await creator.isVisible())) {
        await fieldsButton.click()
        await page.getByRole("button", { name: "New field" }).click()
      }
      await expect(creator).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 15_000 })
    await creator.getByLabel("Name").fill(name)
    await creator.locator("[data-eidos-file-field-type-trigger]").click()
    await expect(
      page.locator(
        `[data-eidos-file-field-type='${type}'] [data-eidos-file-field-type-icon='${type}']`
      )
    ).toBeVisible()
    await page.locator(`[data-eidos-file-field-type='${type}']`).click()
    return creator
  }

  const formulaCreator = await openFieldCreator("Double estimate", "formula")
  const formulaExpression = formulaCreator.getByLabel("Formula expression")
  const estimateReference = formulaCreator
    .locator("[data-formula-reference]")
    .filter({ hasText: "Estimate" })
  await expect(formulaCreator.locator(".cm-editor")).toBeVisible()
  await expect(estimateReference).toContainText("Estimate")
  await estimateReference.click()
  await expect(formulaExpression).toContainText('"Estimate"')
  await formulaExpression.fill("")
  await formulaCreator
    .locator('[data-formula-reference="function:abs"]')
    .click()
  await expect(formulaExpression).toContainText("ABS()")
  await formulaCreator.locator(".eidos-file-formula-display-select").click()
  const numberDisplayType = page.getByRole("option", {
    name: "Number",
    exact: true,
  })
  await expect(
    numberDisplayType.locator('[data-eidos-file-field-type-icon="number"]')
  ).toBeVisible()
  await numberDisplayType.click()
  await formulaExpression.fill('"Estimate" * 2')
  await expect(formulaCreator).toContainText(
    "Preview · Ship Eidos File Web Editor: 4"
  )
  await formulaExpression.press("ControlOrMeta+s")
  await expect(formulaCreator).toBeHidden()

  const relationCreator = await openFieldCreator("Related project", "relation")
  await expect(relationCreator).toContainText("Related table")
  await relationCreator
    .locator("label")
    .filter({ hasText: "Related table" })
    .getByRole("combobox")
    .click()
  await page
    .getByRole("option", { name: "Projects (this table)", exact: true })
    .click()
  await relationCreator.getByRole("button", { name: "Create field" }).click()
  await expect(relationCreator).toBeHidden()

  const lookupCreator = await openFieldCreator("Related estimate", "lookup")
  await lookupCreator
    .locator("label")
    .filter({ hasText: "Relation" })
    .getByRole("combobox")
    .click()
  await page
    .getByRole("option", { name: "Related project", exact: true })
    .click()
  await lookupCreator
    .locator("label")
    .filter({ hasText: "Target field" })
    .getByRole("combobox")
    .click()
  await page.getByRole("option", { name: "Estimate" }).click()
  await lookupCreator.getByRole("button", { name: "Create field" }).click()
  await expect(lookupCreator).toBeHidden()

  await expect
    .poll(() =>
      page.evaluate(() => {
        const messages = window.__eidosFileWorkerMessages ?? []
        const fields = new Map<string, string>()
        for (let index = messages.length - 1; index >= 0; index -= 1) {
          const message = messages[index]
          if (typeof message !== "object" || message === null) continue
          const transport = (message as { transport?: unknown }).transport
          if (typeof transport !== "object" || transport === null) continue
          const envelope = (transport as { envelope?: unknown }).envelope
          if (typeof envelope !== "object" || envelope === null) continue
          const response = envelope as {
            kind?: unknown
            ok?: unknown
            result?: unknown
          }
          if (
            response.kind !== "response" ||
            response.ok !== true ||
            typeof response.result !== "object" ||
            response.result === null
          )
            continue
          const objects = (response.result as { objects?: unknown }).objects
          if (!Array.isArray(objects)) continue
          for (const field of objects) {
            if (
              typeof field !== "object" ||
              field === null ||
              !("object" in field) ||
              field.object !== "field" ||
              !("name" in field) ||
              !("kind" in field)
            )
              continue
            const name = String(field.name)
            if (
              [
                "Double estimate",
                "Related project",
                "Related estimate",
              ].includes(name)
            )
              fields.set(name, String(field.kind))
          }
        }
        return [...fields]
          .map(([name, type]) => ({ name, type }))
          .sort((left, right) => left.name.localeCompare(right.name))
      })
    )
    .toEqual([
      { name: "Double estimate", type: "formula" },
      { name: "Related estimate", type: "lookup" },
      { name: "Related project", type: "relation" },
    ])
})

test("shows Relation metadata as readable names instead of identifiers", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Chromium covers the shared Relation property panel"
  )
  await installFallbackMode(page)
  await page.goto("/")
  await page.getByRole("button", { name: "Open sample Eidos File" }).click()
  await page.locator("[data-testid='glide-cell-1-0']").waitFor({
    state: "attached",
  })
  await page.getByRole("tab", { name: "Teams", exact: true }).click()

  const scroller = page.locator(".eidos-file-content .dvn-scroller")
  await scroller.evaluate((element) => {
    element.scrollLeft = element.scrollWidth
    element.dispatchEvent(new Event("scroll"))
  })
  await expect
    .poll(() => scroller.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0)

  const canvasBounds = await page
    .locator(".eidos-file-content canvas[data-testid='data-grid-canvas']")
    .boundingBox()
  if (!canvasBounds) {
    throw new Error("The Projects Relation header is not visible")
  }
  // At the horizontal end, Teams keeps Name frozen, then shows Active and
  // Projects. Hit the Projects header using the shared Grid column widths.
  await page.mouse.click(
    canvasBounds.x + 44 + 280 + 180 + 90,
    canvasBounds.y + 18,
    { button: "right" }
  )
  const menu = page.getByRole("menu", { name: "Actions for Projects" })
  await expect(menu).toBeVisible()
  await menu.getByRole("menuitem", { name: "Edit property" }).click()

  const panel = page.locator('[data-eidos-file-detail-panel="field"]')
  const relationSummary = panel.locator("[data-eidos-file-relation-summary]")
  await expect(relationSummary).toContainText("Projects")
  await expect(relationSummary).not.toContainText(
    /[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/
  )
  await expect(
    panel.locator("[data-eidos-file-technical-details]")
  ).not.toHaveAttribute("open")
  await expect(
    panel.locator("[data-eidos-file-technical-details] code")
  ).toBeHidden()
})

test("clears an existing Relation while background reads settle", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Chromium covers the browser Transport and shared record inspector"
  )
  await installFallbackMode(page)
  await page.goto("/")
  await page.getByRole("button", { name: "Open sample Eidos File" }).click()
  const rawRelation = page.locator("[data-testid='glide-cell-6-0']")
  await expect(rawRelation).toContainText(/\["[0-9a-f-]+"\]/i)

  const canvas = page.locator(
    ".eidos-file-content canvas[data-testid='data-grid-canvas']"
  )
  const bounds = await canvas.boundingBox()
  if (!bounds) throw new Error("The shared Eidos File Grid is not visible")

  const openRecord = async () => {
    await page.mouse.click(bounds.x + 44 + 140, bounds.y + 54, {
      button: "right",
    })
    const menu = page.getByRole("menu", { name: "Record actions" })
    await expect(menu).toBeVisible()
    await menu.getByRole("menuitem", { name: "Open record" }).click()
  }

  await openRecord()
  const inspector = page.locator('[data-eidos-file-detail-panel="record"]')
  const relation = inspector.getByRole("button", {
    name: "Team",
    exact: true,
  })
  await expect(relation).toHaveText("Runtime Core")
  await relation.click()
  await page.getByRole("button", { name: "Clear", exact: true }).click()

  await expect(inspector).not.toHaveAttribute("aria-busy", "true")
  await expect(relation).toHaveText("No linked records")
  await expect(page.getByText("Unable to save record")).toHaveCount(0)
  await expect(page.getByRole("alert")).toHaveCount(0)

  await page.getByRole("button", { name: "Close record details" }).click()
  await expect(inspector).toBeHidden()
  await openRecord()
  await expect(
    inspector.getByRole("button", { name: "Team", exact: true })
  ).toHaveText("No linked records")
})

test("keeps the Formula editor focused and reachable in a dark touch viewport", async ({
  baseURL,
  browser,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Chromium covers the shared touch and container-query formula layout"
  )
  const context = await browser.newContext({
    baseURL,
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 720 },
  })
  const page = await context.newPage()
  try {
    await installFallbackMode(page)
    await page.goto("/")
    await page.getByRole("button", { name: "Use dark theme" }).click()
    await page.getByRole("button", { name: "Open sample Eidos File" }).click()
    await page.locator("[data-testid='glide-cell-1-0']").waitFor({
      state: "attached",
    })
    await page
      .locator("[data-eidos-file-workbar-actions]")
      .getByRole("button", { name: "Manage fields" })
      .click()
    await page.getByRole("button", { name: "New field" }).click()
    const creator = page.locator("[data-eidos-file-field-create='true']")
    await creator.getByLabel("Name").fill("Touch formula")
    await creator.locator("[data-eidos-file-field-type-trigger]").click()
    await page.locator("[data-eidos-file-field-type='formula']").click()

    const expression = creator.getByLabel("Formula expression")
    await expect(expression).toBeFocused()
    await expression.fill("randomblob(100)")
    await expect(
      creator.locator('[data-eidos-file-formula-status="error"]')
    ).toContainText("Unsupported Eidos File formula function")
    await creator.locator(".eidos-file-formula-display-select").click()
    await page.getByRole("option", { name: "Number", exact: true }).click()
    await expression.click()
    await expression.press("ControlOrMeta+a")
    await expression.pressSequentially('"Estimate" * 2')
    await expect(
      creator.locator('[data-eidos-file-formula-status="valid"]')
    ).toContainText("Preview")

    const layout = await creator.evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      const references = element.querySelector(
        ".eidos-file-formula-reference-browser"
      )
      const createButton = Array.from(
        element.querySelectorAll<HTMLButtonElement>("button")
      ).find((button) => button.textContent?.trim() === "Create field")
      return {
        bounds: bounds.toJSON(),
        columns: references
          ? getComputedStyle(references).gridTemplateColumns
          : null,
        createButton: createButton?.getBoundingClientRect().toJSON(),
        overflow:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
        theme: document.documentElement.classList.contains("dark")
          ? "dark"
          : "light",
      }
    })
    expect(layout.bounds.left).toBeGreaterThanOrEqual(0)
    expect(layout.bounds.right).toBeLessThanOrEqual(390)
    expect(layout.columns?.trim().split(/\s+/)).toHaveLength(1)
    expect(layout.createButton?.top).toBeGreaterThanOrEqual(0)
    expect(layout.createButton?.bottom).toBeLessThanOrEqual(720)
    expect(layout.overflow).toBe(0)
    expect(layout.theme).toBe("dark")
  } finally {
    await context.close()
  }
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
          if (typeof message !== "object" || message === null) continue
          const transport = (message as { transport?: unknown }).transport
          if (typeof transport !== "object" || transport === null) continue
          const envelope = (transport as { envelope?: unknown }).envelope
          if (typeof envelope !== "object" || envelope === null) continue
          const response = envelope as {
            kind?: unknown
            ok?: unknown
            result?: unknown
          }
          if (
            response.kind !== "response" ||
            response.ok !== true ||
            typeof response.result !== "object" ||
            response.result === null
          )
            continue
          const results = (response.result as { results?: unknown }).results
          if (!Array.isArray(results)) continue
          const result = results.find(
            (entry) =>
              typeof entry === "object" &&
              entry !== null &&
              "key" in entry &&
              entry.key === "0"
          )
          if (
            result &&
            "value" in result &&
            typeof result.value === "number" &&
            result.value === 17_486
          )
            return result.value
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
  await expect(
    page.getByRole("tab", { name: "Teams", exact: true })
  ).toBeVisible()

  await page.getByRole("tab", { name: "Project cards" }).click()
  const gallery = page.locator("[data-eidos-file-gallery-scroll]")
  await expect(gallery).toBeVisible()
  const firstCard = gallery
    .getByRole("listitem")
    .filter({ hasText: "Ship Eidos File Web Editor" })
    .first()
  await expect(firstCard).toContainText("Ship Eidos File Web Editor")
  await expect(firstCard.getByText("Team", { exact: true })).toBeVisible()
  await expect(firstCard).toContainText("Runtime Core")
  await expect(firstCard.getByText("Team lead", { exact: true })).toBeVisible()
  await expect(firstCard).toContainText("Maya Chen")
  await expect(
    firstCard.getByText("Effort score", { exact: true })
  ).toBeVisible()
  await expect(firstCard.getByText("10", { exact: true })).toBeVisible()
  await firstCard.locator("h3").click()

  const inspector = page.locator('[data-eidos-file-detail-panel="record"]')
  await expect(inspector).toBeVisible()
  const title = inspector.getByRole("textbox", { name: "Title" })
  await title.fill("Ship Eidos File Web Editor — verified")
  await title.press("Control+Enter")
  await expect(page.locator(".save-status")).toContainText(/browser|Unsaved/)
  await page.getByRole("button", { name: "Close record details" }).click()
  await expect(firstCard).toContainText("verified")

  await page.getByRole("tab", { name: "Teams", exact: true }).click()
  await page.getByRole("tab", { name: "Capacity cards" }).click()
  const teamCard = page
    .locator("[data-eidos-file-gallery-scroll]")
    .getByRole("listitem")
    .filter({ hasText: "Runtime Core" })
    .first()
  await expect(teamCard).toContainText("Maya Chen")
  await expect(
    teamCard.getByText("Project count", { exact: true })
  ).toBeVisible()
  await expect(
    teamCard.getByText("Total effort", { exact: true })
  ).toBeVisible()

  await page.getByRole("tab", { name: "Projects", exact: true }).click()
  await page.getByRole("tab", { name: "By status" }).click()
  const kanban = page.locator("[data-eidos-file-kanban-scroll]")
  await expect(kanban).toBeVisible()
  const backlog = page.getByRole("region", { name: /Backlog, \d+ records/ })
  await expect(backlog).toBeVisible()
  await expect(backlog).toHaveAttribute(
    "aria-label",
    /Backlog, [1-9]\d* records/
  )
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
  const chineseSample = page.waitForResponse((response) =>
    response.url().includes("project-tracker.zh")
  )
  await page.getByRole("combobox", { name: "Language" }).selectOption("zh")
  await expect((await chineseSample).status()).toBeLessThan(400)

  await expect(
    page.getByRole("heading", { name: /打开 Eidos File。/ })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "打开 .eidos 文件" })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "新建空白 Eidos File" })
  ).toBeVisible()
  await expect(page.getByRole("button", { name: "选择体验模板" })).toBeVisible()
  await expect(page.locator(".landing-section")).toHaveCount(0)

  await expect(
    page.locator(".live-demo-grid [data-testid='glide-cell-1-0']")
  ).toContainText("发布 Eidos File Web 编辑器")
  await page.getByPlaceholder("搜索示例").fill("项目 2442")
  await expect(
    page.locator(".live-demo-grid [data-testid='glide-cell-1-0']")
  ).toContainText("项目 2442")

  await page.getByRole("button", { name: "打开完整编辑器" }).click()
  await expect(
    page.getByRole("tab", { name: "项目", exact: true })
  ).toHaveAttribute("aria-selected", "true")
  await expect(page.locator("[data-testid='glide-cell-1-0']")).toContainText(
    "发布 Eidos File Web 编辑器"
  )
  await expect(
    page.getByRole("button", { name: "搜索 Eidos File 记录" })
  ).toBeVisible()
  const filterButton = page.getByRole("button", {
    name: "筛选 Eidos File 记录",
  })
  await expect(filterButton).toBeVisible()
  await expect(
    page.getByRole("button", { name: "排序 Eidos File 记录" })
  ).toBeVisible()
  await filterButton.click()
  await expect(page.getByRole("button", { name: "添加筛选" })).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.locator("[data-eidos-file-sheet-tabs]")).toContainText(
    "导入的副本"
  )
  await page.getByRole("combobox", { name: "语言" }).selectOption("en")
  await expect(page.locator("[data-eidos-file-sheet-tabs]")).toContainText(
    "Imported copy"
  )
})

test("keeps the editor first and publishes server-rendered Eidos File documentation", async ({
  page,
  browserName,
  request,
}) => {
  test.skip(
    browserName !== "chromium",
    "One browser covers the shared landing and documentation UI"
  )
  const browserErrors: string[] = []
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text())
  })
  page.on("pageerror", (error) => browserErrors.push(error.message))
  await installFallbackMode(page)
  await page.setViewportSize({ width: 1440, height: 900 })

  const staticResponse = await request.get("/docs/")
  expect(staticResponse.status()).toBe(200)
  const staticHtml = await staticResponse.text()
  expect(staticHtml).toContain(
    "<h1>Eidos File: an open, local-first table format</h1>"
  )
  expect(staticHtml).toContain(
    '<link rel="canonical" href="https://editor.eidos.space/docs/" />'
  )
  expect(staticHtml).toContain(
    '<link rel="alternate" hreflang="zh-CN" href="https://editor.eidos.space/zh/docs/" />'
  )
  expect(staticHtml).toContain('<script type="application/ld+json">')
  expect(staticHtml).not.toContain("#/docs/")

  const chineseStaticResponse = await request.get("/zh/docs/build/")
  expect(chineseStaticResponse.status()).toBe(200)
  const chineseStaticHtml = await chineseStaticResponse.text()
  expect(chineseStaticHtml).toContain('<html lang="zh-CN">')
  expect(chineseStaticHtml).toContain("<h1>基于 Eidos File 1.0 构建</h1>")

  await page.goto("/")

  await expect(
    page.getByRole("button", { name: "Open .eidos file" })
  ).toBeVisible()
  await expect(
    page.locator(".live-demo-grid canvas[data-testid='data-grid-canvas']")
  ).toBeVisible()
  await expect(
    page
      .locator('.site-nav a[href="https://graft.eidos.space/"]')
      .locator(".site-nav-full-label")
  ).toHaveText("Version Control")
  await expect(
    page.locator('.site-nav a[href="https://sqlite.eidos.space/"]')
  ).toContainText("SQLite Inspector")
  await expect(page.locator('.site-nav a[href="/docs/"]')).toHaveText(
    "Open Format"
  )

  await page.locator('.site-nav a[href="/docs/"]').click()
  await expect(page).toHaveURL(/\/docs\/$/)
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Eidos File: an open, local-first table format",
    })
  ).toBeVisible()
  await expect(page.getByText("Start here")).toBeVisible()
  await expect(
    page.locator('.markdown-body img[src="/eidos-file-model.png"]')
  ).toBeVisible()

  await page.locator('.docs-list a[href="/docs/build/"]').click()
  await expect(page).toHaveURL(/\/docs\/build\/$/)
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Build with Eidos File",
    })
  ).toBeVisible()
  await expect(
    page.locator("code").filter({ hasText: "EidosFileUIProvider" }).first()
  ).toBeVisible()
  await expect(
    page.locator('.markdown-body pre[data-highlighted="true"]').first()
  ).toBeVisible()
  await expect(
    page.locator(".markdown-body .token.keyword").first()
  ).toBeVisible()

  await page.getByRole("combobox", { name: "Language" }).selectOption("zh")
  await expect(page).toHaveURL(/\/zh\/docs\/build\/$/)
  await expect(page.locator('.site-nav a[href="/"]')).toHaveText("编辑工具")
  await expect(page.locator('.site-nav a[href="/zh/docs/"]')).toHaveText(
    "开放格式"
  )
  await expect(
    page
      .locator('.site-nav a[href="https://graft.eidos.space/"]')
      .locator(".site-nav-full-label")
  ).toHaveText("版本管理")
  await expect(
    page.locator('.site-nav a[href="https://sqlite.eidos.space/"]')
  ).toContainText("SQLite 检查器")
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "基于 Eidos File 1.0 构建",
    })
  ).toBeVisible()
  expect(browserErrors).toEqual([])
})
