import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

import { expect, test, type Locator, type Page } from "@playwright/test"

const fixturePath = fileURLToPath(
  new URL("../fixtures/project-tracker.eidos", import.meta.url)
)
const featureLabFixturePath = fileURLToPath(
  new URL("../fixtures/feature-lab.eidos", import.meta.url)
)
const fixtureRowCount = 2_500
const gridHeaderHeight = 36
const gridRowHeight = 36

interface EidosFileE2EHarness {
  appendExternalByte(): Promise<void>
  bytes(): Promise<number[]>
  denyReads(value: boolean): void
  failWrites(value: boolean): void
  setPermission(value: "granted" | "prompt" | "denied"): void
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
    permission?: "granted" | "prompt" | "denied"
    fileName?: string
    launchOnRegister?: boolean
  } = {}
): Promise<void> {
  const bytes = await readFile(fixturePath)
  const encoded = bytes.toString("base64")
  await page.addInitScript(
    async ({ base64, fileName, launchOnRegister, permission }) => {
      let denyReads = false
      let failWrites = false
      let currentPermission = permission
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
        queryPermission: async () => currentPermission,
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
        const nativeGetFile = handle.getFile.bind(handle)
        Object.defineProperties(handle, {
          getFile: {
            configurable: true,
            value: async () => {
              if (denyReads) {
                throw new DOMException(
                  "The request is not allowed by the user agent or the platform in the current context.",
                  "NotAllowedError"
                )
              }
              return nativeGetFile()
            },
          },
          queryPermission: {
            configurable: true,
            value: async () => currentPermission,
          },
          requestPermission: {
            configurable: true,
            value: async () => currentPermission,
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
              new Uint8Array(await (await nativeGetFile()).arrayBuffer())
            )
          },
          denyReads(value) {
            denyReads = value
          },
          failWrites(value) {
            failWrites = value
          },
          setPermission(value) {
            currentPermission = value
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
  await waitForSampleEditor(page)
  await clickFileMenuItem(page, "Open .eidos file")
  await expect(page.locator("[data-testid='glide-cell-1-0']")).toContainText(
    "Ship Eidos File Web Editor"
  )
  await expect(
    page.getByRole("tab", { name: "Projects", exact: true })
  ).toBeVisible()
}

async function waitForSampleEditor(page: Page): Promise<void> {
  await page.locator("[data-testid='glide-cell-1-0']").waitFor({
    state: "attached",
  })
}

async function clickFileMenuItem(page: Page, name: string): Promise<void> {
  const trigger = page.locator(".title-file-menu .app-menu-trigger").first()
  const item = page.getByRole("menuitem", { name, exact: true })
  // While the boot sample is still opening, items are disabled and the menu
  // remounts when the file arrives — reopen and retry until it settles.
  await expect(async () => {
    if (!(await item.isVisible().catch(() => false))) {
      const fileMenu = page.getByRole("menu", { name: /^(File|文件)$/ })
      if (!(await fileMenu.isVisible().catch(() => false)))
        await trigger.click()
      const submenuTriggers = fileMenu.locator(
        '[role="menuitem"][aria-haspopup="menu"]'
      )
      for (let index = 0; index < (await submenuTriggers.count()); index += 1) {
        await submenuTriggers.nth(index).hover()
        if (await item.isVisible().catch(() => false)) break
      }
    }
    await item.click({ timeout: 5_000 })
  }).toPass({ timeout: 30_000 })
  // Every File-menu action opens or saves a file; give OPEN_START a tick
  // to surface, then wait for the open to finish before proceeding.
  await page.waitForTimeout(250)
  await expect(page.locator(".save-status")).not.toContainText(
    "Opening local file",
    { timeout: 30_000 }
  )
}

async function selectTitlebarLanguage(
  page: Page,
  language: string
): Promise<void> {
  await page.locator(".title-actions .app-menu-trigger").first().click()
  await page
    .getByRole("menu")
    .getByRole("menuitemradio", { name: language, exact: true })
    .click()
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
  // File opens can still be settling (boot sample vs. user-initiated open);
  // a click issued mid-remount is lost.
  await page.waitForTimeout(250)
  await expect(page.locator(".save-status")).not.toContainText(
    "Opening local file",
    { timeout: 30_000 }
  )

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
    await clickFileMenuItem(page, "Save")
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
    await expect(page.locator("header")).toContainText("direct-save.eidos")
    await expect(page.locator("[data-testid='glide-cell-5-0']")).toHaveText(
      "true"
    )
    await expect(page.getByText("SQLite 1", { exact: true })).toBeVisible()
  })

  test("persists and clears the recent local-file list", async ({ page }) => {
    await installDirectPicker(page, { fileName: "recent-local.eidos" })
    await openDirectEidosFile(page)

    await page.reload()
    await expect(page.locator("header")).toContainText("recent-local.eidos")
    await toggleFirstComplete(page)

    const fileTrigger = page
      .locator(".title-file-menu .app-menu-trigger")
      .first()
    await fileTrigger.click()
    await page
      .getByRole("menuitem", { name: "Recent files", exact: true })
      .click()
    const recentFile = page.getByRole("menuitem", {
      name: "recent-local.eidos",
      exact: true,
    })
    await expect(recentFile).toBeVisible()
    await expect(recentFile).toContainText("Unsaved")

    await page
      .getByRole("menuitem", { name: "Clear recent files", exact: true })
      .click()
    await fileTrigger.click()
    await expect(
      page.getByRole("menuitem", { name: "Recent files", exact: true })
    ).toHaveCount(0)
    await expect(page.locator("header")).toContainText("recent-local.eidos")
    await expect(page.locator(".save-status")).toContainText("Unsaved")
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

  test("reloads a clean working copy when the original changes externally", async ({
    page,
  }) => {
    const peer = await page.context().newPage()
    try {
      await installDirectPicker(page, { fileName: "live-reload.eidos" })
      await installDirectPicker(peer, { fileName: "live-reload.eidos" })
      await openDirectEidosFile(page)
      await openDirectEidosFile(peer)
      await expect(page.locator("[data-testid='glide-cell-5-0']")).toHaveText(
        "false"
      )

      await toggleFirstComplete(peer)
      await clickFileMenuItem(peer, "Save")
      await expect(peer.locator(".save-status")).toContainText(
        "Saved to original"
      )

      await page.bringToFront()
      await page.evaluate(() =>
        document.dispatchEvent(new Event("visibilitychange"))
      )

      await expect(page.locator("[data-testid='glide-cell-5-0']")).toHaveText(
        "true"
      )
      await expect(
        page.getByRole("tab", { name: "Projects", exact: true })
      ).toBeVisible()
      await expect(page.locator(".conflict-bar")).toHaveCount(0)
      await expect(page.locator(".save-status")).toContainText("Saved")
    } finally {
      await peer.close()
    }
  })

  test("protects the working copy when the original changes", async ({
    page,
  }) => {
    await installDirectPicker(page, { fileName: "conflict.eidos" })
    await openDirectEidosFile(page)
    await toggleFirstComplete(page)
    await page.evaluate(async () => window.__eidosFileE2E?.appendExternalByte())
    await page.evaluate(() =>
      document.dispatchEvent(new Event("visibilitychange"))
    )

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

    await clickFileMenuItem(page, "Save")
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
      "Choose the original .eidos file again"
    )
    await expect(
      page.getByRole("button", { name: "Locate original file" })
    ).toBeVisible()
    await page.locator(".title-file-menu .app-menu-trigger").first().click()
    await expect(
      page.getByRole("menuitem", { name: "Save As", exact: true })
    ).toBeVisible()
    await page.keyboard.press("Escape")
  })

  test("reconnects a recovered working copy through a fresh file picker", async ({
    page,
  }) => {
    await installDirectPicker(page, {
      fileName: "reconnect-original.eidos",
      permission: "denied",
    })
    await openDirectEidosFile(page)
    await toggleFirstComplete(page)

    await page.getByRole("button", { name: "Grant write access" }).click()
    await expect(
      page.getByRole("button", { name: "Locate original file" })
    ).toBeVisible()
    await expect(page.locator("[data-testid='glide-cell-5-0']")).toHaveText(
      "true"
    )

    await page.evaluate(() => window.__eidosFileE2E?.setPermission("granted"))
    await page.getByRole("button", { name: "Locate original file" }).click()

    await expect(
      page.getByRole("button", { name: "Locate original file" })
    ).toHaveCount(0)
    await expect(page.getByRole("alert")).toHaveCount(0)
    await expect(page.locator("[data-testid='glide-cell-5-0']")).toHaveText(
      "true"
    )
    await expect(page.locator(".save-status")).toContainText("Unsaved")
  })

  test("pauses monitoring instead of reporting a conflict when file access expires", async ({
    page,
  }) => {
    await installDirectPicker(page, { fileName: "permission-expired.eidos" })
    await openDirectEidosFile(page)

    await page.evaluate(() => window.__eidosFileE2E?.denyReads(true))
    await page.evaluate(() =>
      document.dispatchEvent(new Event("visibilitychange"))
    )

    await expect(page.locator(".conflict-bar")).toHaveCount(0)
    await expect(page.getByRole("alert")).toContainText(
      "Original-file monitoring is paused"
    )
    await expect(
      page.getByRole("button", { name: "Grant write access" })
    ).toBeVisible()
    await expect(page.locator("[data-testid='glide-cell-1-0']")).toContainText(
      "Ship Eidos File Web Editor"
    )

    await page.evaluate(() => window.__eidosFileE2E?.denyReads(false))
    await page.getByRole("button", { name: "Grant write access" }).click()
    await expect(
      page.getByRole("button", { name: "Grant write access" })
    ).toHaveCount(0)
    await expect(page.getByRole("alert")).toHaveCount(0)
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
  await page.locator("input[type=file]").setInputFiles(fixturePath)
  await expect(
    page.locator("header").getByText("Imported copy", { exact: true })
  ).toBeVisible()
  await toggleFirstComplete(page)

  const downloadPromise = page.waitForEvent("download")
  await clickFileMenuItem(page, "Save As")
  const download = await downloadPromise
  const savedPath = testInfo.outputPath("portable-fallback.eidos")
  await download.saveAs(savedPath)
  await expect(page.locator(".save-status")).toContainText("Downloaded a copy")

  await page.reload()
  await page.locator("input[type=file]").setInputFiles(savedPath)
  await expect(page.locator(".file-identity strong")).toHaveText(
    "portable-fallback.eidos"
  )
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

  await clickFileMenuItem(page, "New blank Eidos File")
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
    page.locator(".title-file-menu").getByRole("button", { name: "File" })
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
  await clickFileMenuItem(page, "Save As")
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
  const sampleResponse = page.waitForResponse((response) =>
    response.url().includes("project-tracker")
  )
  await page.goto("/")
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

  await page.keyboard.press("Control+f")
  const rowSearch = page.locator('input[placeholder="Search rows"]')
  await expect(rowSearch).toBeFocused()
  await rowSearch.fill("Ship Eidos File Web Editor")
  await expect(page.locator("[data-testid='glide-cell-1-0']")).toContainText(
    "Ship Eidos File Web Editor"
  )

  await page.getByRole("button", { name: "Filter Eidos File rows" }).focus()
  await page.keyboard.press("Meta+f")
  await expect(rowSearch).toBeFocused()

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
    "oklch(0.99 0.002 220)"
  )
  await expect(filterPopover.getByRole("combobox")).toHaveCSS(
    "border-top-width",
    "1px"
  )

  await clickFileMenuItem(page, "Open sample Eidos File")
  await expect(page.locator("[data-testid='glide-cell-1-0']")).toContainText(
    "Ship Eidos File Web Editor"
  )
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
  await waitForSampleEditor(page)

  await page.locator(".title-file-menu .app-menu-trigger").first().click()
  const menu = page.getByRole("menu", { name: "File" })
  await expect(menu).toBeVisible()
  await expect(menu.getByText("Templates", { exact: true })).toBeHidden()
  await expect(menu.getByRole("menuitem")).toHaveCount(6)
  await menu
    .getByRole("menuitem", { name: "New from template…", exact: true })
    .click()
  await expect(menu.getByRole("menuitem")).toHaveCount(6)
  await expect(
    menu.getByRole("menuitem", { name: "Open .eidos file", exact: true })
  ).toBeVisible()
  const templateMenu = page.getByRole("menu", { name: "New from template…" })
  await expect(
    templateMenu.getByText("Templates", { exact: true })
  ).toBeVisible()
  await expect(templateMenu.getByRole("menuitem")).toHaveCount(8)
  const [rootMenuBounds, templateMenuBounds] = await Promise.all([
    menu.boundingBox(),
    templateMenu.boundingBox(),
  ])
  expect(rootMenuBounds).not.toBeNull()
  expect(templateMenuBounds).not.toBeNull()
  expect(templateMenuBounds!.x).toBeGreaterThanOrEqual(
    rootMenuBounds!.x + rootMenuBounds!.width
  )
  expect(templateMenuBounds!.x + templateMenuBounds!.width).toBeLessThanOrEqual(
    page.viewportSize()!.width
  )

  const templateResponse = page.waitForResponse((response) =>
    response.url().includes("personal-crm")
  )
  await templateMenu.getByRole("menuitem", { name: "Personal CRM" }).click()
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
      button: "Household finance",
      asset: "household-finance",
      table: "Transactions",
      firstRecord: "Monthly salary",
    },
    {
      button: "Reading library",
      asset: "reading-library",
      table: "Books",
      firstRecord: "The Dispossessed",
    },
    {
      button: "Habit journal",
      asset: "habit-journal",
      table: "Daily logs",
      firstRecord: "Morning walk",
    },
    {
      button: "Content calendar",
      asset: "content-calendar",
      table: "Content",
      firstRecord: "Why files still matter",
    },
    {
      button: "Eidos 1.0 Feature Lab",
      asset: "feature-lab",
      table: "Experiments",
      firstRecord: "Feature Lab launch",
    },
    {
      button: "Field capability matrix",
      asset: "field-capability-matrix",
      table: "Field capabilities",
      firstRecord: "Row ID",
    },
  ] as const

  for (const template of templates) {
    await page.goto("/")
    await waitForSampleEditor(page)
    const templateResponse = page.waitForResponse((response) =>
      response.url().includes(template.asset)
    )
    await clickFileMenuItem(page, template.button)
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
      button: "个人关系管理",
      asset: "personal-crm.zh",
      table: "联系人",
      firstRecord: "Avery Stone",
    },
    {
      button: "家庭财务",
      asset: "household-finance.zh",
      table: "流水",
      firstRecord: "月度工资",
    },
    {
      button: "阅读资料库",
      asset: "reading-library.zh",
      table: "书籍",
      firstRecord: "The Dispossessed",
    },
    {
      button: "习惯日志",
      asset: "habit-journal.zh",
      table: "每日日志",
      firstRecord: "晨间散步",
    },
    {
      button: "内容日历",
      asset: "content-calendar.zh",
      table: "内容",
      firstRecord: "为什么文件依然重要",
    },
    {
      button: "Eidos 1.0 全功能实验室",
      asset: "feature-lab.zh",
      table: "实验",
      firstRecord: "全功能实验室启动",
    },
    {
      button: "字段能力矩阵",
      asset: "field-capability-matrix.zh",
      table: "字段能力",
      firstRecord: "行 ID",
    },
  ] as const

  for (const template of templates) {
    await page.goto("/")
    await waitForSampleEditor(page)
    const templateResponse = page.waitForResponse((response) =>
      response.url().includes(template.asset)
    )
    await clickFileMenuItem(page, template.button)
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
  const response = page.waitForResponse((candidate) =>
    candidate.url().includes("feature-lab")
  )
  await clickFileMenuItem(page, "Eidos 1.0 Feature Lab")
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

  await expect(page.locator("[data-eidos-file-editor-shell]")).toBeVisible()
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
  await clickFileMenuItem(page, "Eidos 1.0 Feature Lab")
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
  await expect(
    page.getByRole("checkbox", { name: "Show Experiment" })
  ).toBeVisible()
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
    await canvas.focus()
    await expect(canvas).toBeFocused()
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
  await clickFileMenuItem(page, "Eidos 1.0 Feature Lab")
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
  await clickFileMenuItem(page, "Open sample Eidos File")
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
  await clickFileMenuItem(page, "Open sample Eidos File")
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

  await page.locator(".title-actions .app-menu-trigger").first().click()
  const moreMenu = page.getByRole("menu", { name: "More" })
  await expect(moreMenu).toBeVisible()
  await expect(moreMenu.getByRole("menuitem")).toHaveCount(3)
  await expect(
    moreMenu.getByRole("menuitem", { name: "Open Format" })
  ).toBeVisible()
  await expect(
    moreMenu.getByRole("menuitem", { name: "SQLite Inspector" })
  ).toBeVisible()
  await expect(
    moreMenu.getByRole("menuitem", { name: "Version Control" })
  ).toBeVisible()
  await page.keyboard.press("Escape")
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth
    )
  ).toBe(true)

  await waitForSampleEditor(page)
  const fileTrigger = page.locator(".title-file-menu .app-menu-trigger").first()
  await fileTrigger.click()
  const mobileFileMenu = page.getByRole("menu", { name: "File" })
  await mobileFileMenu
    .getByRole("menuitem", { name: "New from template…", exact: true })
    .click()
  await expect(
    page.getByRole("menu", { name: "New from template…" })
  ).toHaveCount(0)
  await expect(
    mobileFileMenu.getByRole("menuitem", { name: "Back to File" })
  ).toBeVisible()
  await expect(
    mobileFileMenu.getByRole("menuitem", { name: "Personal CRM" })
  ).toBeVisible()
  await mobileFileMenu.getByRole("menuitem", { name: "Back to File" }).click()

  await clickFileMenuItem(page, "Open sample Eidos File")
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
  await clickFileMenuItem(page, "Open sample Eidos File")
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

  const dialog = page.getByRole("dialog").filter({
    has: page.getByRole("heading", {
      name: "plugin-import.csv",
      exact: true,
    }),
  })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText("2 ready")
  const tableName = page.getByLabel("Table name")
  await tableName.fill("CSV projects")
  await page.evaluate(() => {
    const original = File.prototype.arrayBuffer
    File.prototype.arrayBuffer = async function () {
      if (this.name === "plugin-import.csv") {
        await new Promise((resolve) => window.setTimeout(resolve, 500))
      }
      return original.call(this)
    }
  })
  await page.getByRole("button", { name: "Import 2 rows" }).click()

  await expect(dialog.getByRole("status")).toContainText("Importing…")
  await expect(dialog.getByRole("progressbar")).toHaveCount(0)
  await expect(dialog).not.toContainText("0%")

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
  await clickFileMenuItem(page, "Save As")
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
  await selectTitlebarLanguage(page, "简体中文")
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
  await clickFileMenuItem(page, "Open sample Eidos File")
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
  await clickFileMenuItem(page, "Open sample Eidos File")
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
  await formulaExpression.click()
  await formulaExpression.press("ControlOrMeta+a")
  await formulaExpression.pressSequentially('"Estimate" * 2')
  await expect(formulaExpression).toHaveText('"Estimate" * 2')
  await expect(
    formulaCreator.locator('[data-eidos-file-formula-status="valid"]')
  ).toContainText("Preview · Ship Eidos File Web Editor: 4")
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
  await clickFileMenuItem(page, "Open sample Eidos File")
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
  await clickFileMenuItem(page, "Open sample Eidos File")
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
    await clickFileMenuItem(page, "Open sample Eidos File")
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
  const pageErrors: string[] = []
  page.on("pageerror", (error) => pageErrors.push(error.message))
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
  await clickFileMenuItem(page, "Open sample Eidos File")
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

  await page.locator("input[type=file]").setInputFiles(featureLabFixturePath)
  await expect(page.locator(".file-identity strong")).toHaveText(
    "feature-lab.eidos"
  )
  await expect(pageErrors).toEqual([])
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
  await clickFileMenuItem(page, "Open sample Eidos File")
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
  await clickFileMenuItem(page, "Open sample Eidos File")

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
  await waitForSampleEditor(page)

  await selectTitlebarLanguage(page, "简体中文")
  await expect(
    page.locator(".title-file-menu .app-menu-trigger").first()
  ).toContainText("文件")

  // The localized sample ships per locale; user data is never rewritten.
  const chineseSample = page.waitForResponse((response) =>
    response.url().includes("project-tracker.zh")
  )
  await clickFileMenuItem(page, "打开示例 Eidos File")
  await expect((await chineseSample).status()).toBeLessThan(400)
  await expect(page.locator("[data-testid='glide-cell-1-0']")).toContainText(
    "发布 Eidos File Web 编辑器"
  )
  await expect(
    page.getByRole("tab", { name: "项目", exact: true })
  ).toHaveAttribute("aria-selected", "true")
})

test("keeps the editor first and links out to the Eidos File documentation", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "One browser covers the shared landing and documentation links"
  )
  const browserErrors: string[] = []
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text())
  })
  page.on("pageerror", (error) => browserErrors.push(error.message))
  await installFallbackMode(page)
  await page.setViewportSize({ width: 1440, height: 900 })

  await page.goto("/")
  await waitForSampleEditor(page)
  await expect(
    page.locator(".title-file-menu .app-menu-trigger").first()
  ).toContainText("File")

  await page.locator(".title-actions .app-menu-trigger").first().click()
  const moreMenu = page.getByRole("menu", { name: "More" })
  await expect(moreMenu).toBeVisible()
  await expect(
    moreMenu.getByRole("menuitem", { name: "Open Format" })
  ).toBeVisible()
  await expect(
    moreMenu.getByRole("menuitem", { name: "SQLite Inspector" })
  ).toBeVisible()
  await expect(
    moreMenu.getByRole("menuitem", { name: "Version Control" })
  ).toBeVisible()
  await page.keyboard.press("Escape")

  await selectTitlebarLanguage(page, "简体中文")
  await expect(
    page.locator(".title-file-menu .app-menu-trigger").first()
  ).toContainText("文件")
  await page.locator(".title-actions .app-menu-trigger").first().click()
  const zhMoreMenu = page.getByRole("menu", { name: "更多" })
  await expect(zhMoreMenu).toBeVisible()
  await expect(
    zhMoreMenu.getByRole("menuitem", { name: "开放格式" })
  ).toBeVisible()
  await expect(
    zhMoreMenu.getByRole("menuitem", { name: "SQLite 检查器" })
  ).toBeVisible()
  await expect(
    zhMoreMenu.getByRole("menuitem", { name: "版本管理" })
  ).toBeVisible()
  await page.keyboard.press("Escape")
  expect(browserErrors).toEqual([])
})
