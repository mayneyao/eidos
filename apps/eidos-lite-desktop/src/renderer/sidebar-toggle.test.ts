import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { expect, it } from "vitest"

const rendererRoot = path.dirname(fileURLToPath(import.meta.url))

it("keeps document navigation inside the active draggable titlebar", async () => {
  const [appSource, styles] = await Promise.all([
    fs.readFile(path.join(rendererRoot, "app.tsx"), "utf8"),
    fs.readFile(path.join(rendererRoot, "styles.css"), "utf8"),
  ])
  const sidebarHeader = appSource.match(
    /<header className="sidebar-header">([\s\S]*?)<\/header>/
  )?.[1]
  const fileTitlebar = appSource.match(
    /<header className="file-titlebar">([\s\S]*?)<\/header>/
  )?.[1]

  expect(sidebarHeader).toContain("<TitlebarNavigation")
  expect(fileTitlebar).toContain("<TitlebarNavigation")
  expect(appSource.match(/<TitlebarNavigation/g)).toHaveLength(2)
  expect(appSource).toContain('data-navigation-action="back"')
  expect(appSource).toContain('data-navigation-action="forward"')
  expect(styles).toMatch(
    /\.icon-button\s*\{[\s\S]*?-webkit-app-region:\s*no-drag;[\s\S]*?\}/
  )
  expect(styles).toMatch(
    /\.titlebar-navigation \.icon-button:active:not\(:disabled\)\s*\{[\s\S]*?transform:\s*none;/
  )
  expect(appSource).toContain('window.addEventListener("pointerdown"')
  expect(appSource).toContain("window.history.go(offset)")
  expect(appSource).toContain("workspaceShortcutForKeyboardEvent(event)")
  expect(appSource).toContain("onClick={toggleVersionPanel}")
  expect(appSource).toContain("onClick={toggleSyncPanel}")
  expect(appSource.match(/onToggle=\{toggleSidebar\}/g)).toHaveLength(2)
  expect(appSource).toContain(
    'aria-keyshortcuts={WORKSPACE_SHORTCUT_ARIA["toggle-version"]}'
  )
  expect(appSource).toContain(
    'aria-keyshortcuts={WORKSPACE_SHORTCUT_ARIA["toggle-sync"]}'
  )
})
