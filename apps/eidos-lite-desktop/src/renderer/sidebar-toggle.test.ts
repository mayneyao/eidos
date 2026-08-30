import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { expect, it } from "vitest"

const rendererRoot = path.dirname(fileURLToPath(import.meta.url))

it("keeps document navigation inside the active draggable titlebar", async () => {
  const [appSource, styles, textFilePreviewSource] = await Promise.all([
    fs.readFile(path.join(rendererRoot, "app.tsx"), "utf8"),
    fs.readFile(path.join(rendererRoot, "styles.css"), "utf8"),
    fs.readFile(path.join(rendererRoot, "text-file-preview.tsx"), "utf8"),
  ])
  const sidebarHeader = appSource.match(
    /<header className="sidebar-header">([\s\S]*?)<\/header>/
  )?.[1]
  const fileTitlebar = appSource.match(
    /<header className="file-titlebar">([\s\S]*?)<\/header>/
  )?.[1]

  expect(sidebarHeader).toContain("<TitlebarNavigation")
  expect(fileTitlebar).toContain("collapsedTitlebarNavigation")
  expect(appSource.match(/<TitlebarNavigation/g)).toHaveLength(2)
  expect(appSource).toContain(
    'sidebarCollapsed && workbenchSurfaces.terminal === "side"'
  )
  expect(appSource).toContain('data-navigation-action="back"')
  expect(appSource).toContain('data-navigation-action="forward"')
  expect(styles).toMatch(
    /\.icon-button\s*\{[\s\S]*?-webkit-app-region:\s*no-drag;[\s\S]*?\}/
  )
  expect(styles).toMatch(
    /\.titlebar-navigation \.icon-button:active:not\(:disabled\)\s*\{[\s\S]*?transform:\s*none;/
  )
  expect(appSource).not.toContain("navigationOffsetForPointerButton")
  expect(appSource).not.toContain('window.addEventListener("auxclick"')
  expect(appSource).not.toContain("preventAuxiliaryNavigation")
  expect(appSource).toContain("window.history.go(offset)")
  expect(appSource).toContain("onWorkspaceShortcutCommand(")
  expect(appSource).toContain("keyboardShortcuts")
  expect(appSource).toContain('workspaceShortcut === "toggle-theme"')
  expect(appSource).toContain("toggledAppearance(theme)")
  expect(appSource).toContain("onClick={toggleVersionPanel}")
  expect(appSource).toContain("onClick={toggleSyncPanel}")
  expect(appSource).toContain('data-sidebar-action="settings"')
  expect(appSource).not.toContain('data-titlebar-action="settings"')
  expect(appSource.match(/onToggle=\{toggleSidebar\}/g)).toHaveLength(2)
  expect(appSource.match(/workspaceShortcutAriaKeyShortcuts\(/g)).toHaveLength(
    5
  )
  expect(appSource).toContain(
    'workspaceShortcut === "toggle-terminal-position"'
  )
  expect(appSource).toContain(
    'workspaceShortcutLabel(\n    "toggle-terminal-position"'
  )
  expect(appSource).toContain('"--space-sidebar-track-width": sidebarCollapsed')
  expect(appSource).toContain('"--space-sidebar-min-width": sidebarCollapsed')
  expect(appSource).not.toContain("MAX_SIDEBAR_WIDTH")
  expect(styles).toMatch(
    /\.workbench\s*\{[\s\S]*?--sidebar-motion-enter:\s*120ms;[\s\S]*?grid-template-columns:\s*var\(--effective-space-sidebar-width\)/
  )
  expect(styles).not.toMatch(/transition:\s*grid-template-columns/)
  expect(styles).toMatch(
    /\.space-sidebar\s*\{[\s\S]*?width:\s*100%;[\s\S]*?contain:\s*paint;[\s\S]*?will-change:\s*transform, opacity;/
  )
  expect(styles).not.toMatch(
    /\.space-sidebar\s*\{[^}]*width:\s*var\(--effective-space-sidebar-width\);/u
  )
  expect(styles).toMatch(
    /\.workbench\[data-sidebar-collapsed="true"\]\s+\.space-sidebar\s*\{[\s\S]*?transform:\s*translate3d\(-0\.35rem, 0, 0\);[\s\S]*?visibility 0s linear var\(--sidebar-motion-exit\)/
  )
  expect(styles).not.toContain("sidebar-toggle-navigation-enter")
  expect(styles).toMatch(
    /\.resizing-space-sidebar \.workbench,[\s\S]*?\.resizing-space-sidebar \.sidebar-resizer\s*\{\s*transition:\s*none;/
  )
  expect(styles).toMatch(
    /\.sidebar-resizer\s*\{[\s\S]*?z-index:\s*50;[\s\S]*?left:\s*calc\(var\(--effective-space-sidebar-width\) - 12px\);[\s\S]*?width:\s*12px;/
  )
  expect(styles).toMatch(
    /\.sidebar-resizer::after\s*\{[\s\S]*?right:\s*0;[\s\S]*?width:\s*1px;/
  )
  expect(appSource).toContain("resizer.setPointerCapture(pointerId)")
  expect(appSource).toContain("resizer.releasePointerCapture(pointerId)")
  expect(appSource).toContain("flushSync(() => setSidebarResizing(true))")
  expect(appSource).toContain(
    'resizer.addEventListener("lostpointercapture", cleanup)'
  )
  expect(appSource).toMatch(
    /nativePreviewSuppressed=\{[\s\S]*?sidebarResizing[\s\S]*?\}/
  )
  expect(textFilePreviewSource).toMatch(
    /useRendererLayoutEffect\(\(\) => \{[\s\S]*?layoutHtmlPreview\(\{ previewId, bounds, visible \}\)[\s\S]*?\}, \[previewId, visible\]\)/
  )
  expect(styles).toMatch(
    /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?transition-delay:\s*0s !important;[\s\S]*?transition-duration:\s*0\.01ms !important;/
  )
  expect(appSource).not.toContain('keyboardShortcuts["navigate-back"]')
  expect(appSource).not.toContain('keyboardShortcuts["navigate-forward"]')
})
