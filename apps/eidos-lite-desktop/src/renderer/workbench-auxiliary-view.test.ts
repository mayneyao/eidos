import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { expect, it } from "vitest"

const rendererRoot = path.dirname(fileURLToPath(import.meta.url))

it("splits Terminal only inside the middle work area", async () => {
  const [appSource, panelSource, styles] = await Promise.all([
    fs.readFile(path.join(rendererRoot, "app.tsx"), "utf8"),
    fs.readFile(path.join(rendererRoot, "terminal-panel.tsx"), "utf8"),
    fs.readFile(path.join(rendererRoot, "styles.css"), "utf8"),
  ])

  expect(appSource).toContain("resolveWorkbenchSurfaces({")
  expect(appSource).toContain('workbenchSurfaces.right === "history"')
  expect(appSource).toContain('workbenchSurfaces.right === "sync"')
  expect(appSource).toContain('workbenchSurfaces.content === "diff"')
  expect(appSource).not.toContain('workbenchSurfaces.right === "file"')
  expect(appSource).not.toContain('data-terminal-action="files"')
  expect(appSource).not.toContain("auxiliaryActions={")
  expect(panelSource).not.toContain("auxiliaryActions")
  expect(appSource).not.toContain('terminalLayout === "right"')
  expect(appSource).not.toContain('workbenchSurfaces.right === "terminal"')
  expect(appSource).toContain("onClick={toggleTerminalPanel}")
  expect(styles).not.toContain('data-terminal-layout="right"')
  expect(styles).not.toContain('data-right-sidebar-view="terminal"')

  const closeDiffRoute = appSource.match(
    /const closeVersionDiffRoute = useCallback\(\(\) => \{([\s\S]*?)\n  \}, \[[^\]]*\]\)/
  )?.[1]
  expect(closeDiffRoute).toContain(
    "recordNavigationLocation(activeDocumentPath)"
  )
  expect(closeDiffRoute).not.toContain("navigateHistory(-1)")
  expect(closeDiffRoute).not.toContain("canNavigateHistory")

  expect(appSource).not.toContain("showFileSurface")
  expect(appSource).not.toContain("toggleFileSidebar")

  expect(appSource).not.toContain("with-utility-panel")
  expect(appSource).not.toContain("data-utility-panel-resizer")
  expect(styles).not.toContain(".editor-primary-area.with-utility-panel")
  expect(styles).toMatch(
    /\.workbench > \.version-panel,[\s\S]*?\.workbench > \.sync-inspector-host,[\s\S]*?grid-column:\s*6;/
  )
  expect(styles).toMatch(
    /\.workbench > \.version-inspector-route,[\s\S]*?grid-column:\s*4;/
  )
  const editorRegionStart = appSource.indexOf('className="editor-region"')
  const editorRegionEnd = appSource.indexOf("</main>", editorRegionStart)
  const diffRouteStart = appSource.indexOf(
    '{workbenchSurfaces.content === "diff" ? (',
    editorRegionEnd
  )
  expect(editorRegionStart).toBeGreaterThan(-1)
  expect(editorRegionEnd).toBeGreaterThan(editorRegionStart)
  expect(diffRouteStart).toBeGreaterThan(editorRegionEnd)
  expect(styles).toMatch(
    /\.terminal-panel-resizer\s*\{[\s\S]*?grid-column:\s*2 \/ 5;[\s\S]*?cursor:\s*row-resize;/
  )
  expect(styles).toMatch(
    /\.right-sidebar-resizer\s*\{[\s\S]*?grid-row:\s*1 \/ -1;[\s\S]*?grid-column:\s*5;/
  )
  expect(styles).toMatch(
    /\[data-terminal-layout="side"\] > \.terminal-panel-resizer\s*\{[\s\S]*?grid-column:\s*3;[\s\S]*?cursor:\s*col-resize;/
  )
})
