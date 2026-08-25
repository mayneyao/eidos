import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { expect, it } from "vitest"

const rendererRoot = path.dirname(fileURLToPath(import.meta.url))

it("resizes Sync and Versions through one persistent accessible boundary", async () => {
  const [appSource, styles] = await Promise.all([
    fs.readFile(path.join(rendererRoot, "app.tsx"), "utf8"),
    fs.readFile(path.join(rendererRoot, "styles.css"), "utf8"),
  ])

  expect(appSource).toContain(
    'const UTILITY_PANEL_WIDTH_STORAGE_KEY = "eidos-lite:utility-panel-width"'
  )
  expect(appSource).toContain(
    '"--utility-panel-width": `${utilityPanelWidth}px`'
  )
  expect(appSource).toContain("data-utility-panel-resizer")
  expect(appSource).toContain('role="separator"')
  expect(appSource).toContain('syncPanelMode ? "Resize Sync panel"')
  expect(appSource).toContain(
    'document.documentElement.classList.add("resizing-utility-panel")'
  )
  expect(appSource).toContain("startWidth + startX - pointerEvent.clientX")
  expect(appSource).toContain("resizer.setPointerCapture(pointerId)")
  expect(appSource).toContain("resizer.releasePointerCapture(pointerId)")
  expect(appSource).toMatch(
    /nativePreviewSuppressed=\{[\s\S]*?sidebarResizing \|\|[\s\S]*?utilityPanelResizing/
  )

  expect(styles).toContain(
    "min(var(--utility-panel-width, 22rem), calc(100% - 19rem))"
  )
  expect(styles).toMatch(
    /\.utility-panel-resizer\s*\{[\s\S]*?grid-column:\s*2;[\s\S]*?width:\s*12px;[\s\S]*?cursor:\s*col-resize;/
  )
  expect(styles).toMatch(
    /\.editor-primary-area\.with-utility-panel > \.version-panel,[\s\S]*?grid-column:\s*3;/
  )
})
