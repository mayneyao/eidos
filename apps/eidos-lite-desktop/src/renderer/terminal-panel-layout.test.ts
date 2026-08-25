import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { expect, it } from "vitest"

const rendererRoot = path.dirname(fileURLToPath(import.meta.url))

it("integrates one opt-in, persistent, resizable xterm panel into the workbench grid", async () => {
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
  expect(appSource).toContain("terminalToggleRef.current?.focus()")
  expect(appSource).toContain(
    'const TERMINAL_PANEL_HEIGHT_STORAGE_KEY = "eidos-lite:terminal-panel-height"'
  )
  expect(appSource).toContain('"eidos-lite:terminal-panel-placement"')
  expect(appSource).toContain(
    'const TERMINAL_PANEL_WIDTH_STORAGE_KEY = "eidos-lite:terminal-panel-width"'
  )
  expect(appSource).toContain("startHeight + startY - pointerEvent.clientY")
  expect(appSource).toContain("startWidth + startX - pointerEvent.clientX")
  expect(appSource).toContain(
    'document.documentElement.classList.add("resizing-terminal-panel")'
  )
  expect(appSource).toMatch(
    /nativePreviewSuppressed=\{[\s\S]*?terminalPanelResizing/
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
    /\.workbench\[data-terminal-open="true"\]\[data-terminal-placement="bottom"\]\s*\{[\s\S]*?--terminal-panel-height/
  )
  expect(styles).toMatch(
    /\.workbench\[data-terminal-open="true"\]\[data-terminal-placement="right"\]\s*\{[\s\S]*?--terminal-panel-width/
  )
  expect(styles).toMatch(
    /\.terminal-panel-resizer\s*\{[\s\S]*?cursor:\s*row-resize;/
  )
  expect(styles).toMatch(
    /\.workbench\[data-terminal-placement="right"\][\s\S]*?> \.terminal-panel-resizer\s*\{[\s\S]*?cursor:\s*col-resize;/
  )
  expect(styles).toMatch(
    /\.workbench\[data-terminal-placement="right"\] > \.terminal-panel\s*\{[\s\S]*?--terminal-panel-header-height:\s*var\(--workbench-titlebar-height\);/
  )
  expect(styles).toMatch(
    /\.workbench\[data-terminal-placement="right"\][\s\S]*?\.terminal-panel-header\s*\{[\s\S]*?-webkit-app-region:\s*drag;/
  )
  expect(styles).toMatch(
    /\.terminal-panel-actions\s*\{[\s\S]*?-webkit-app-region:\s*no-drag;/
  )
  expect(appSource).toMatch(
    /<\/main>\s*\{terminalPluginEnabled && terminalPanelInitialized \? \([\s\S]*?<TerminalPanel/
  )
  expect(appSource).toContain(
    "const terminalPanelVisible = terminalPluginEnabled && terminalPanelOpen"
  )
  expect(appSource).toMatch(
    /\{terminalPluginEnabled \? \([\s\S]*?data-titlebar-action="terminal"/
  )
  expect(settingsSource).toContain('data-built-in-plugin="terminal"')
  const terminalStartHandler = ipcSource.slice(
    ipcSource.indexOf("IPC_CHANNELS.terminalStart")
  )
  expect(terminalStartHandler).toMatch(
    /if \(!preferences\.builtInPlugins\.terminal\)[\s\S]*?const manager = await terminalSessions\(\)/
  )
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
  expect(appHtml).toContain("script-src 'self';")
  expect(appHtml).not.toContain("wasm-unsafe-eval")
  expect(appHtml).not.toMatch(/script-src[^;]*\s'unsafe-eval'/u)
})
