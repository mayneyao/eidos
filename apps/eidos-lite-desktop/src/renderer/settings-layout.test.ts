import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8")
const settings = readFileSync(
  new URL("./settings-page.tsx", import.meta.url),
  "utf8"
)

describe("Settings responsive layout", () => {
  it("keeps sidebar navigation at desktop and compact widths", () => {
    const responsiveStart = styles.indexOf("@media (max-width: 56rem)")
    const responsiveEnd = styles.indexOf(
      "@media (prefers-reduced-motion: reduce)",
      responsiveStart
    )
    const responsiveStyles = styles.slice(responsiveStart, responsiveEnd)

    expect(responsiveStart).toBeGreaterThan(-1)
    expect(responsiveEnd).toBeGreaterThan(responsiveStart)
    expect(styles).toMatch(
      /\.settings-layout\s*\{[^}]*grid-template-columns:\s*12\.5rem minmax\(0, 1fr\)/
    )
    expect(responsiveStyles).toMatch(
      /\.settings-layout\s*\{[^}]*grid-template-columns:\s*12\.5rem minmax\(0, 1fr\)/
    )
    expect(styles).toMatch(
      /\.settings-sidebar button > span\s*\{[^}]*white-space:\s*nowrap/
    )
    expect(styles).toMatch(
      /\.settings-shortcut-row\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*minmax\(10rem, 1fr\) auto/
    )
    expect(responsiveStyles).not.toMatch(
      /\.settings-shortcut-row\s*\{[^}]*flex-direction/
    )
    expect(settings).toContain('className="settings-sidebar"')
    expect(settings).toContain('id: "shortcuts"')
    expect(settings).toContain('id: "preferences"')
    expect(settings).toContain('t("Preferences")')
    expect(settings).toContain('id: "plugins"')
    expect(settings).toContain('label: "Built-in Plugins"')
    expect(settings).toContain('id="settings-plugins"')
    expect(settings).toContain('activePage !== "plugins"')
    expect(settings).toContain('label: "Account & Services"')
    expect(settings).toContain('t("Account & Services")')
    expect(settings).toContain('t("Eidos account")')
    expect(settings).toContain("Sign in once to use Sync and Publish.")
    expect(settings).not.toContain('"Account & Sync"')
    expect(settings).toContain("<KeyboardShortcutSettings")
    expect(settings).toContain("builtInPlugins={preferences.builtInPlugins}")
    expect(settings).toContain('t("Start week on Monday")')
    expect(settings).toContain('t("Terminal layout")')
    expect(settings).toContain("data-terminal-layout")
    expect(settings).toContain(
      "data-segment-count={TERMINAL_LAYOUT_OPTIONS.length}"
    )
    expect(settings).toContain("data-terminal-layout={option.value}")
    expect(settings).toContain("preferences.terminalLayout === option.value")
    expect(settings).toContain("terminalLayout: option.value")
    expect(settings).toContain('data-built-in-plugin="terminal"')
    expect(settings).toContain("preferences.builtInPlugins.terminal")
    expect(settings).toContain("builtInPlugins: {")
    expect(settings).toContain(".listTerminalShells()")
    expect(settings).toContain("data-terminal-shell")
    expect(settings).toContain("preferences.terminalShell")
    expect(settings).toContain("!preferences.builtInPlugins.terminal")
    expect(settings).toContain('className="settings-shell-select"')
    expect(settings).toContain('t("Time zone")')
    expect(settings).toContain("<TimeZonePicker")
    expect(settings).toContain("timeZone })")
    expect(settings).toContain(
      "weekStartsOnMonday: !preferences.weekStartsOnMonday"
    )
    expect(settings).toContain("data-settings-page={activePage}")
    expect(styles).toMatch(
      /\.settings-segmented-control\[data-segment-count="2"\]\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(3\.2rem, 1fr\)\)/
    )
  })
})
