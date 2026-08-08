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
      "padding-top: var(--chrome-header-height)"
    )
    expect(rule(".welcome-titlebar")).toContain(
      "height: var(--chrome-header-height)"
    )
    expect(rule(".settings-shell")).toContain(
      "grid-template-rows: var(--chrome-header-height)"
    )
    expect(rule(".workbench")).toContain(
      "--workbench-titlebar-height: var(--chrome-header-height)"
    )
    expect(rule(".sync-dialog")).toContain(
      "grid-template-rows: var(--chrome-header-height)"
    )
    expect(rule(".sync-dialog > header")).toContain(
      "height: var(--chrome-header-height)"
    )
    expect(utilityLayout).toContain(
      "--eidos-shell-workbar-height: var(--chrome-header-height)"
    )
    expect(utilityLayout).toContain(
      "--version-header-height: var(--chrome-header-height)"
    )
  })

  it("aligns text editor content with the file title without moving the scrollbar", () => {
    expect(rule(".text-file-editor-virtualizer")).not.toContain("padding")
    expect(rule(".text-file-editor-virtualizer-content")).toContain(
      "padding-inline-start: 0.5rem"
    )
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
})
