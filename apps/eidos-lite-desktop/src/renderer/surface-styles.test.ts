import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8")
const themeStyles = readFileSync(
  new URL(
    "../../../../packages/eidos-file-ui/src/host-styles.css",
    import.meta.url
  ),
  "utf8"
)

function rule(selector: string, source = styles): string {
  const start = source.indexOf(`${selector} {`)
  if (start < 0) return ""
  return source.slice(start, source.indexOf("}", start) + 1)
}

function ruleContaining(fragment: string, source = styles): string {
  const match = source.indexOf(fragment)
  if (match < 0) return ""
  const precedingGap = source.lastIndexOf("\n\n", match)
  const start = precedingGap < 0 ? 0 : precedingGap + 2
  return source.slice(start, source.indexOf("}", match) + 1)
}

function rulesContaining(fragment: string, source = styles): string[] {
  const matches: string[] = []
  let offset = 0
  while (offset < source.length) {
    const match = source.indexOf(fragment, offset)
    if (match < 0) break
    const precedingGap = source.lastIndexOf("\n\n", match)
    const start = precedingGap < 0 ? 0 : precedingGap + 2
    const end = source.indexOf("}", match) + 1
    matches.push(source.slice(start, end))
    offset = end
  }
  return matches
}

function ruleAfter(selector: string, after: string, source = styles): string {
  const offset = source.indexOf(after)
  if (offset < 0) return ""
  const start = source.indexOf(`${selector} {`, offset)
  if (start < 0) return ""
  return source.slice(start, source.indexOf("}", start) + 1)
}

describe("Eidos Lite surface hierarchy", () => {
  it("reserves the tinted shell background for the file tree sidebar", () => {
    expect(rule(":root", themeStyles)).toContain(
      "--canvas: var(--theme-surface)"
    )
    expect(rule(":root", themeStyles)).toContain("--surface: var(--canvas)")
    expect(rule(".space-sidebar")).toContain("var(--lite-sidebar)")
    expect(rule(".editor-region")).toContain("background: var(--canvas)")
    expect(rule(".settings-sidebar")).toContain("background: var(--canvas)")
  })

  it("keeps title bars on the default surface with quiet separators", () => {
    expect(rule(".file-titlebar")).toContain("background: transparent")
    expect(rule(".settings-titlebar")).toContain("background: transparent")
    expect(rule(".welcome-titlebar")).toContain("background: transparent")
    expect(rule(":root", themeStyles)).toMatch(
      /--line: light-dark\([\s\S]+\/ 52%\)/
    )
    expect(rule(":root", themeStyles)).toMatch(
      /--hairline: light-dark\([\s\S]+\/ 42%\)/
    )
  })

  it("uses one compact height for title bars, workbars, and panel headers", () => {
    const utilityLayout = rule(
      ".editor-work-area.with-version-panel,\n.editor-work-area.with-utility-panel"
    )

    expect(rule(":root", themeStyles)).toContain(
      "--chrome-header-height: 2.5rem"
    )
    expect(rule(".welcome-shell")).toContain(
      "--window-titlebar-height: var(--chrome-header-height)"
    )
    expect(rule(".welcome-shell")).toContain(
      "padding-top: var(--window-titlebar-height)"
    )
    expect(rule(".welcome-titlebar")).toContain(
      "height: var(--window-titlebar-height)"
    )
    expect(rule(".settings-shell")).toContain(
      "grid-template-rows: var(--window-titlebar-height)"
    )
    expect(rule(".workbench")).toContain(
      "--workbench-titlebar-height: var(--window-titlebar-height)"
    )
    expect(rule(".sync-dialog")).toContain(
      "grid-template-rows: var(--window-titlebar-height)"
    )
    expect(rule(".sync-dialog > header")).toContain(
      "height: var(--window-titlebar-height)"
    )
    expect(utilityLayout).toContain(
      "--eidos-shell-workbar-height: var(--chrome-header-height)"
    )
    expect(utilityLayout).toContain(
      "--version-header-height: var(--chrome-header-height)"
    )
  })

  it("keeps Windows and Linux actions clear of overlaid system controls", () => {
    const overlayShells = ruleContaining("--window-controls-overlay-width")
    const actionRules = rulesContaining("var(--window-controls-overlay-width)")

    expect(actionRules).toHaveLength(3)
    for (const overlayRule of [overlayShells, ...actionRules]) {
      expect(overlayRule).toContain('[data-platform="linux"]')
      expect(overlayRule).toContain('[data-platform="other"]')
    }
    expect(overlayShells).toContain("--window-controls-overlay-width")
    expect(actionRules[0]).toContain(".welcome-settings-button")
    expect(actionRules[1]).toContain(".file-titlebar")
    expect(actionRules[2]).toContain(".sync-dialog")
    expect(actionRules[2]).toContain("> header")
  })

  it("aligns Linux title rows to the system window controls overlay", () => {
    const linuxChrome = ruleContaining("--window-titlebar-height: env(")

    expect(linuxChrome).toContain('.welcome-shell[data-platform="linux"]')
    expect(linuxChrome).toContain('.settings-shell[data-platform="linux"]')
    expect(linuxChrome).toContain('.workbench[data-platform="linux"]')
    expect(linuxChrome).toContain("titlebar-area-height")
    expect(rule(".welcome-titlebar")).toContain(
      "height: var(--window-titlebar-height)"
    )
    expect(rule(".settings-shell")).toContain(
      "grid-template-rows: var(--window-titlebar-height)"
    )
    expect(rule(".workbench")).toContain(
      "--workbench-titlebar-height: var(--window-titlebar-height)"
    )
  })

  it("keeps Recent Spaces visible when the Welcome layout becomes one column", () => {
    const breakpoint = "@media (max-width: 43rem)"
    const compactShell = ruleAfter(".welcome-shell", breakpoint)
    const compactCopy = ruleAfter(".welcome-copy", breakpoint)
    const compactRecents = ruleAfter(".welcome-principles", breakpoint)

    expect(compactShell).toContain(
      "grid-template-rows: minmax(0, 0.95fr) minmax(12rem, 1.05fr)"
    )
    expect(compactShell).toContain("overflow: hidden")
    expect(compactCopy).toContain("overflow-y: auto")
    expect(compactRecents).toContain("overflow: hidden")
    expect(ruleAfter(".welcome-shell", "@media (max-width: 56rem)")).toBe("")
  })

  it("aligns text editor content with the file title without moving the scrollbar", () => {
    expect(rule(".text-file-editor-virtualizer")).not.toContain("padding")
    expect(rule(".text-file-editor-virtualizer-content")).toContain(
      "padding-inline-start: 0.5rem"
    )
  })

  it("lets Markdown preview text be selected and copied", () => {
    expect(rule(".markdown-document")).toContain("cursor: text")
    expect(rule(".markdown-document")).toContain("user-select: text")
    expect(rule(".markdown-document")).toContain("-webkit-user-select: text")
  })

  it("presents recent files as a compact flat list", () => {
    expect(rule(".recent-files-empty-state")).toContain("width: min(32rem")
    expect(rule(".recent-file-list")).toContain(
      "border-top: 1px solid var(--hairline)"
    )
    expect(rule(".recent-file-list button")).toContain(
      "background: transparent"
    )
  })

  it("groups updates above the persistent sidebar Settings entry", () => {
    expect(rule(".sidebar-footer")).toContain("flex-direction: column")
    expect(rule(".sidebar-footer")).not.toContain("border-top")
    expect(rule(".sidebar-settings-button")).toContain(
      "background: transparent"
    )
    expect(rule(".sidebar-settings-button")).toContain("height: 2rem")
    expect(rule(".sidebar-update-action")).not.toContain("border-top")
  })
})
