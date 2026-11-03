import fs from "node:fs/promises"
import path from "node:path"
import { BrowserWindow } from "electron"
import { translateEidosLite } from "../shared/i18n"
import type { WindowController } from "./window-controller"

// Exercise the distributed renderer in its real native window on every platform.
export async function verifyPackagedReleaseNotes(
  controller: WindowController,
  evidenceDirectory: string
): Promise<void> {
  const preferences = await controller.getPreferences()
  const existing = new Set(BrowserWindow.getAllWindows())
  controller.showWhatsNew()
  const notes = BrowserWindow.getAllWindows().find(
    (item) => !existing.has(item)
  )
  if (!notes) throw new Error("Release notes did not create a native window")
  try {
    const deadline = Date.now() + 20000
    while (!notes.isVisible() && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 50))
    if (!notes.isVisible())
      throw new Error("Release notes never became visible")
    if (!notes.webContents.getURL().endsWith("#/release-notes"))
      throw new Error("Release notes opened the wrong route")
    if (
      !["Release notes", translateEidosLite("zh", "Release notes")].includes(
        notes.getTitle()
      )
    )
      throw new Error("Release notes native title is missing")
    controller.showWhatsNew()
    if (BrowserWindow.getAllWindows().length !== existing.size + 1)
      throw new Error("Release notes created a duplicate window")
    for (const locale of ["en", "zh"] as const) {
      for (const scale of [0.8, 1, 1.25, 1.5]) {
        notes.webContents.setZoomFactor(scale)
        for (const width of [640, 920]) {
          notes.setSize(width, 620)
          await notes.webContents.executeJavaScript(`
            (async () => {
              document.querySelector('a[href="#whats-new-${locale}"]')?.click()
              await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
              const page = document.querySelector('.whats-new-page')
              const article = page?.querySelector('article.markdown-document')
              if (!article || article.getBoundingClientRect().height <= 0)
                throw new Error('Static release notes are not visible')
              if (page.querySelector('[contenteditable="true"]'))
                throw new Error('Release notes must be read-only')
              if (!article.textContent.includes(${JSON.stringify(locale === "en" ? "What's new" : "新功能")}))
                throw new Error('Release notes language switch failed')
              if (location.hash !== '#/release-notes')
                throw new Error('Language switch left the native notes route')
              const bounds = article.getBoundingClientRect()
              if (bounds.left < -1 || bounds.right > innerWidth + 1 ||
                  document.documentElement.scrollWidth > innerWidth + 1)
                throw new Error('Release notes overflow at ${width}px / ${scale}')
            })()
          `)
        }
      }
      notes.webContents.setZoomFactor(1)
      await fs.writeFile(
        path.join(evidenceDirectory, `release-notes-${locale}.png`),
        (await notes.webContents.capturePage()).toPNG()
      )
    }
    if ((await controller.getPreferences()).language !== preferences.language)
      throw new Error("Release notes switch changed the app language")
  } finally {
    if (!notes.isDestroyed()) {
      const closed = new Promise<void>((resolve) =>
        notes.once("closed", resolve)
      )
      notes.close()
      await closed
    }
  }
  if (!notes.isDestroyed()) throw new Error("Release notes did not close")
}
