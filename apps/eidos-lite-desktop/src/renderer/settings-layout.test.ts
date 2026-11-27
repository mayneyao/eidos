import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"
import { SETTINGS_SECTIONS } from "./settings-catalog"

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
      /\.settings-layout\s*\{[^}]*grid-template-columns:\s*var\(--settings-sidebar-width\) minmax\(0, 1fr\)/
    )
    expect(responsiveStyles).not.toMatch(
      /\.settings-layout\s*\{[^}]*grid-template-columns:/
    )
    expect(styles).toMatch(
      /\.settings-sidebar nav button > span\s*\{[^}]*white-space:\s*nowrap/
    )
    expect(styles).toMatch(
      /\.settings-shortcut-row\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*minmax\(10rem, 1fr\) auto/
    )
    expect(responsiveStyles).not.toMatch(
      /\.settings-shortcut-row\s*\{[^}]*flex-direction/
    )
    expect(settings).toContain('className="settings-sidebar"')
    expect(SETTINGS_SECTIONS.map((page) => page.id)).toEqual([
      "preferences",
      "devices",
      "account-sync",
      "files",
      "shortcuts",
      "updates",
      "experimental",
      "about",
    ])
    expect(settings).toContain('t("Preferences")')
    expect(settings).not.toContain('id: "spaces"')
    expect(settings).not.toContain("Automatic versions")
    expect(settings).not.toContain("automaticCheckpoints")
    expect(settings).not.toContain('id: "plugins"')
    expect(settings).not.toContain('label: "Plugins"')
    expect(settings).not.toContain('id="settings-plugins"')
    expect(settings).not.toContain("PluginManager")
    expect(SETTINGS_SECTIONS).toContainEqual({
      id: "account-sync",
      label: "Account & Services",
    })
    expect(settings).toContain('t("Account & Services")')
    expect(settings).toContain('t("Eidos account")')
    expect(settings).toContain("Sign in to use Eidos Sync and Publish.")
    expect(settings).toContain("data-settings-sync")
    expect(settings).toContain('t("Manage Sync")')
    expect(settings).toContain("UsageMeter")
    expect(settings).toContain('t("Storage")')
    expect(settings).toContain("settings-row-publish-plan")
    expect(styles).toMatch(
      /\.settings-row-publish-plan\s*\{[^}]*flex-wrap:\s*wrap/
    )
    expect(styles).toMatch(/\.usage-meter-bar\s*\{[^}]*display:\s*flex/)
    expect(styles).toMatch(/\.usage-meter-legend\s*\{[^}]*list-style:\s*none/)
    expect(settings).toContain("usePublishAccount")
    expect(settings).toContain("data-settings-publish")
    expect(settings).toContain('t("Publish Free")')
    expect(settings).toContain('t("Manage Publish")')
    expect(settings).toContain('t("View paid plans")')
    expect(settings).not.toContain('"Account & Sync"')
    expect(settings).toContain("<KeyboardShortcutSettings")
    expect(settings).toContain("builtInPlugins={preferences.builtInPlugins}")
    expect(settings).not.toContain("data-terminal-layout")
    expect(settings).not.toContain(".listTerminalShells()")
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
