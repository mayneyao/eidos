import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { expect, it } from "vitest"

const rendererRoot = path.dirname(fileURLToPath(import.meta.url))

it("routes file-content focus without changing the active view or route", async () => {
  const [appSource, workbenchSource, textPreviewSource, versionPanelSource] =
    await Promise.all([
      fs.readFile(path.join(rendererRoot, "app.tsx"), "utf8"),
      fs.readFile(path.join(rendererRoot, "eidos-file-workbench.tsx"), "utf8"),
      fs.readFile(path.join(rendererRoot, "text-file-preview.tsx"), "utf8"),
      fs.readFile(path.join(rendererRoot, "version-panel.tsx"), "utf8"),
    ])

  expect(appSource).toContain('workspaceShortcut === "focus-file-content"')
  expect(appSource).toContain("requestFileContentFocus()")
  expect(appSource).toMatch(/<TextFilePreview[\s\S]*?focusRequestToken=/)
  expect(appSource).toMatch(/<EidosFileWorkbench[\s\S]*?focusRequestToken=/)
  expect(appSource).toMatch(/<VersionDiffPreview[\s\S]*?focusRequestToken=/)
  expect(workbenchSource).toMatch(
    /<EidosFileEditorView[\s\S]*?focusRequestToken=/
  )
  expect(textPreviewSource).toMatch(
    /<PierreTextEditorSurface[\s\S]*?focusRequestToken=/
  )
  expect(versionPanelSource).toContain("useFileContentFocusRequest(")

  const focusHandlerStart = appSource.indexOf(
    'workspaceShortcut === "focus-file-content"'
  )
  const focusHandlerEnd = appSource.indexOf(
    'workspaceShortcut === "toggle-version"',
    focusHandlerStart
  )
  const focusHandler = appSource.slice(focusHandlerStart, focusHandlerEnd)
  expect(focusHandlerStart).toBeGreaterThan(-1)
  expect(focusHandlerEnd).toBeGreaterThan(focusHandlerStart)
  expect(focusHandler).not.toContain("setActiveViews")
  expect(focusHandler).not.toContain("recordNavigationLocation")
})
