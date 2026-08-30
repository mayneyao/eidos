import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { expect, it } from "vitest"

const rendererRoot = path.dirname(fileURLToPath(import.meta.url))

it("resizes every auxiliary view through one persistent right boundary", async () => {
  const [appSource, styles] = await Promise.all([
    fs.readFile(path.join(rendererRoot, "app.tsx"), "utf8"),
    fs.readFile(path.join(rendererRoot, "styles.css"), "utf8"),
  ])

  expect(appSource).toContain(
    'const UTILITY_PANEL_WIDTH_STORAGE_KEY = "eidos-lite:utility-panel-width"'
  )
  expect(appSource).toContain(
    'const TERMINAL_PANEL_WIDTH_STORAGE_KEY = "eidos-lite:terminal-panel-width"'
  )
  expect(appSource).toContain(
    'const RIGHT_SIDEBAR_WIDTH_STORAGE_KEY = "eidos-lite:right-sidebar-width"'
  )
  expect(appSource).toContain(
    '"--right-sidebar-width": `${rightSidebarWidth}px`'
  )
  expect(appSource).toContain("data-right-sidebar-resizer")
  expect(appSource).toContain('role="separator"')
  expect(appSource).toContain('aria-label={t("Resize right sidebar")}')
  expect(appSource).toContain(
    'document.documentElement.classList.add("resizing-right-sidebar")'
  )
  expect(appSource).toContain("startWidth + startX - pointerEvent.clientX")
  expect(appSource).toContain("resizer.setPointerCapture(pointerId)")
  expect(appSource).toContain("resizer.releasePointerCapture(pointerId)")
  expect(appSource).toMatch(
    /nativePreviewSuppressed=\{[\s\S]*?sidebarResizing \|\|[\s\S]*?rightSidebarResizing/
  )

  expect(styles).not.toContain("--utility-panel-width")
  expect(styles).toMatch(
    /\.right-sidebar-resizer\s*\{[\s\S]*?grid-column:\s*5;[\s\S]*?width:\s*12px;[\s\S]*?cursor:\s*col-resize;/
  )
  expect(styles).toMatch(
    /\.workbench > \.version-panel,[\s\S]*?\.workbench > \.sync-inspector-host,[\s\S]*?grid-column:\s*6;/
  )
  expect(styles).toContain('.workbench[data-right-sidebar-open="true"]')
})
