import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { expect, it } from "vitest"

const rendererRoot = path.dirname(fileURLToPath(import.meta.url))

it("integrates an opt-in, persistent, multi-tab xterm panel into the workbench grid", async () => {
  const [
    appSource,
    panelSource,
    styles,
    appHtml,
    ipcSource,
    controllerSource,
    settingsSource,
  ] = await Promise.all([
    fs.readFile(path.join(rendererRoot, "app.tsx"), "utf8"),
    fs.readFile(path.join(rendererRoot, "terminal-panel.tsx"), "utf8"),
    fs.readFile(path.join(rendererRoot, "styles.css"), "utf8"),
    fs.readFile(path.join(rendererRoot, "../../index.html"), "utf8"),
    fs.readFile(path.join(rendererRoot, "../main/ipc.ts"), "utf8"),
    fs.readFile(
      path.join(rendererRoot, "../main/window-controller.ts"),
      "utf8"
    ),
    fs.readFile(path.join(rendererRoot, "settings-page.tsx"), "utf8"),
  ])

  expect(appSource).toContain('"toggle-terminal"')
  expect(appSource).toContain('"toggle-terminal-position"')
  expect(appSource).toContain("data-terminal-panel-resizer")
  expect(appSource).toContain("data-right-sidebar-resizer")
  expect(appSource).toContain("data-terminal-layout={terminalLayout}")
  expect(appSource).toContain("data-right-sidebar-view")
  const acceptPreferencesSource = appSource.slice(
    appSource.indexOf("const acceptPreferences ="),
    appSource.indexOf("void window.eidosLite.getPreferences().then")
  )
  expect(acceptPreferencesSource).not.toContain("setTerminalPanelOpen(true)")
  expect(appSource).toMatch(
    /const cycleTerminalLayout[\s\S]*?setTerminalPanelOpen\(true\)[\s\S]*?updatePreferences\(\{ terminalLayout: nextLayout \}\)/
  )
  expect(appSource).toContain("nextTerminalLayout(previousLayout)")
  expect(appSource).toContain('return current === "bottom" ? "side" : "bottom"')
  expect(appSource).toContain(
    'workspaceShortcut === "toggle-terminal-position"'
  )
  expect(appSource).toContain(
    "updatePreferences({ terminalLayout: nextLayout })"
  )
  expect(appSource).toContain(
    "updatePreferences({ terminalLayout: resolvedTerminalLayout })"
  )
  expect(appSource).toContain(
    "window.localStorage.removeItem(TERMINAL_PANEL_PLACEMENT_STORAGE_KEY)"
  )
  expect(appSource).toContain("terminalToggleRef.current?.focus()")
  expect(appSource).toContain("terminalOwnsTitlebarNavigation")
  expect(appSource).toContain("titlebarNavigation={")
  expect(appSource).toContain(
    'const TERMINAL_PANEL_HEIGHT_STORAGE_KEY = "eidos-lite:terminal-panel-height"'
  )
  expect(appSource).toContain('"eidos-lite:terminal-panel-placement"')
  expect(appSource).toContain(
    'const TERMINAL_PANEL_WIDTH_STORAGE_KEY = "eidos-lite:terminal-panel-width"'
  )
  expect(appSource).toContain(
    'const RIGHT_SIDEBAR_WIDTH_STORAGE_KEY = "eidos-lite:right-sidebar-width"'
  )
  expect(appSource).toContain(
    '"--terminal-panel-width": `${terminalPanelWidth}px`'
  )
  expect(appSource).toContain(
    '"--right-sidebar-width": `${rightSidebarWidth}px`'
  )
  expect(appSource).not.toContain("MAX_TERMINAL_PANEL_WIDTH")
  expect(appSource).toContain("maximumTerminalPanelWidth(")
  expect(appSource).toContain(
    "startSize + startPosition - pointerEvent.clientY"
  )
  expect(appSource).toContain(
    "startSize + pointerEvent.clientX - startPosition"
  )
  expect(appSource).toContain(
    'document.documentElement.classList.add("resizing-terminal-panel")'
  )
  expect(appSource).toContain(
    'document.documentElement.classList.add("resizing-right-sidebar")'
  )
  expect(appSource).toMatch(
    /nativePreviewSuppressed=\{[\s\S]*?rightSidebarResizing[\s\S]*?terminalPanelResizing/
  )

  expect(panelSource).toContain('import { FitAddon } from "@xterm/addon-fit"')
  expect(panelSource).toContain(
    'import { WebLinksAddon } from "@xterm/addon-web-links"'
  )
  expect(panelSource).toContain(
    'import { Terminal, type ITheme } from "@xterm/xterm"'
  )
  expect(panelSource).toContain('import "@xterm/xterm/css/xterm.css"')
  expect(panelSource).toContain("window.eidosLite.startTerminal(cols, rows)")
  expect(panelSource).toContain(
    "window.eidosLite.writeTerminal(sessionId, data)"
  )
  expect(panelSource).toContain("window.eidosLite.resizeTerminal")
  expect(styles).toMatch(
    /\.workbench\[data-terminal-bottom-open="true"\]\s*\{[\s\S]*?--terminal-panel-height/
  )
  expect(styles).toMatch(
    /\.workbench\[data-right-sidebar-open="true"\]\s*\{[\s\S]*?--effective-right-sidebar-width/
  )
  expect(styles).toContain("--space-sidebar-min-width: 13rem")
  expect(styles).toContain("--workbench-content-min-width: 22.5rem")
  expect(styles).toContain("--terminal-panel-min-width: 18.75rem")
  expect(styles).toContain("--right-sidebar-min-width: 18rem")
  expect(styles).toMatch(
    /grid-template-columns:[\s\S]*?var\(--effective-space-sidebar-width\)[\s\S]*?var\(--effective-terminal-panel-width\)[\s\S]*?minmax\(var\(--workbench-content-min-width\), 1fr\)[\s\S]*?var\(--effective-right-sidebar-width\);/
  )
  expect(styles).toMatch(/\.editor-region\s*\{[\s\S]*?grid-column:\s*4;/)
  expect(styles).toMatch(
    /\[data-terminal-layout="side"\][\s\S]*?> \.terminal-panel\s*\{[\s\S]*?grid-column:\s*2;/
  )
  expect(styles).toMatch(
    /\.terminal-panel-resizer\s*\{[\s\S]*?cursor:\s*row-resize;/
  )
  expect(styles).toMatch(
    /\.terminal-panel-resizer::after\s*\{[^}]*background:\s*var\(--hairline\);/u
  )
  expect(styles).not.toMatch(/\.terminal-panel-header\s*\{[^}]*border-bottom:/u)
  expect(styles).toMatch(
    /\.terminal-panel-header\s*\{[^}]*position:\s*relative;/u
  )
  expect(panelSource).toMatch(
    /<header className="terminal-panel-header">\s*\{titlebarNavigation\}/
  )
  expect(styles).toMatch(
    /\.right-sidebar-resizer\s*\{[\s\S]*?grid-column:\s*5;[\s\S]*?cursor:\s*col-resize;/
  )
  expect(styles).toMatch(
    /\.workbench\[data-terminal-layout="side"\][\s\S]*?\.terminal-panel-header\s*\{[\s\S]*?-webkit-app-region:\s*drag;/
  )
  expect(styles).toMatch(
    /\.workbench:is\([\s\S]*?\)\[data-right-sidebar-open="true"\][\s\S]*?\.file-titlebar\s*\{[\s\S]*?padding-right:\s*0\.75rem;/
  )
  expect(styles).not.toContain('data-right-sidebar-view="terminal"')
  expect(styles).toMatch(
    /\.terminal-panel-actions\s*\{[\s\S]*?-webkit-app-region:\s*no-drag;/
  )
  expect(appSource).toContain("<TerminalPanel")
  expect(appSource).toContain(
    "const terminalPanelVisible = terminalPluginEnabled && terminalPanelOpen"
  )
  expect(appSource).toMatch(
    /\{terminalPluginEnabled \? \([\s\S]*?data-titlebar-action="terminal"/
  )
  const terminalActionIndex = appSource.indexOf(
    'data-titlebar-action="terminal"'
  )
  const historyActionIndex = appSource.indexOf('data-titlebar-action="version"')
  const syncActionIndex = appSource.indexOf('data-titlebar-action="sync"')
  expect(terminalActionIndex).toBeGreaterThan(-1)
  expect(terminalActionIndex).toBeLessThan(historyActionIndex)
  expect(historyActionIndex).toBeLessThan(syncActionIndex)
  expect(settingsSource).toContain('data-built-in-plugin="terminal"')
  expect(settingsSource).toContain("TERMINAL_LAYOUT_OPTIONS")
  expect(settingsSource).toContain("preferences.terminalLayout")
  expect(settingsSource).toContain(".listTerminalShells()")
  expect(settingsSource).toContain("preferences.terminalShell")
  const terminalStartHandler = ipcSource.slice(
    ipcSource.indexOf("IPC_CHANNELS.terminalStart")
  )
  expect(terminalStartHandler).toMatch(
    /if \(!preferences\.builtInPlugins\.terminal\)[\s\S]*?const manager = await terminalSessions\(\)/
  )
  expect(terminalStartHandler).toContain("configuredTerminalShell(")
  expect(terminalStartHandler).toContain("shellExecutable,")
  expect(controllerSource).toContain("isEidosLiteShortcutEnabled")
  expect(controllerSource).toContain(
    "isEidosLiteShortcutEnabled(command, this.builtInPlugins)"
  )
  expect(styles).toMatch(
    /\.terminal-emulator \.xterm\s*\{[\s\S]*?font-family:\s*var\(--font-code\);/
  )
  expect(styles).toMatch(
    /\.terminal-emulator \.xterm \.xterm-viewport\s*\{[\s\S]*?overflow-x:\s*hidden;[\s\S]*?background:\s*var\(--canvas\);/
  )
  expect(styles).toMatch(
    /\.terminal-emulator \.xterm \.composition-view\s*\{[\s\S]*?color:\s*var\(--ink\);[\s\S]*?background:\s*var\(--canvas\);/
  )
  expect(panelSource).toContain('mount.className = "terminal-emulator"')
  expect(panelSource).toContain("terminalRef.current !== terminal")
  expect(panelSource).toContain("terminal.loadAddon(fitAddon)")
  expect(panelSource).toContain("terminal.loadAddon(webLinksAddon)")
  expect(panelSource).toContain("terminal.attachCustomKeyEventHandler")
  expect(panelSource).not.toContain('t("Clear terminal")')
  expect(panelSource).not.toContain("<Eraser")
  expect(panelSource).toContain('role="tablist"')
  expect(panelSource).toContain('role="tab"')
  expect(panelSource).toContain("EIDOS_LITE_TERMINAL_SESSIONS_PER_WINDOW_MAX")
  expect(styles).toMatch(
    /\.terminal-panel-tab-strip\s*\{[\s\S]*?gap:\s*0\.5rem;/
  )
  expect(styles).not.toMatch(
    /\.terminal-panel-tab-strip\s*\{[^}]*-webkit-app-region:\s*no-drag;/u
  )
  expect(styles).toMatch(
    /\.terminal-panel-tabs\s*\{[^}]*overflow-x:\s*auto;[^}]*-webkit-app-region:\s*no-drag;/u
  )
  expect(styles).toMatch(
    /\.terminal-panel-tab-add\s*\{[^}]*-webkit-app-region:\s*no-drag;/u
  )
  expect(styles).toMatch(
    /\.terminal-session-viewport\[hidden\]\s*\{[\s\S]*?display:\s*none;/
  )
  expect(appHtml).toContain("script-src 'self';")
  expect(appHtml).not.toContain("wasm-unsafe-eval")
  expect(appHtml).not.toMatch(/script-src[^;]*\s'unsafe-eval'/u)
})
