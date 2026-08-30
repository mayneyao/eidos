import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8")

describe("Version panel layout", () => {
  it("owns a dedicated draggable main workbench route", () => {
    const routeRule = styles.match(
      /\.workbench > \.version-inspector-route,\s*\.workbench > \.sync-merge-editor,\s*\.workbench > \.workbench-main-loading\s*\{([^}]*)\}/
    )?.[1]
    const headerRule = styles.match(
      /\.version-inspector-bar\s*\{([^}]*)\}/
    )?.[1]
    const headerButtonRule = styles.match(
      /\.version-inspector-bar button\s*\{([^}]*)\}/
    )?.[1]

    expect(routeRule).toContain("grid-row: 1")
    expect(routeRule).toContain("grid-column: 4")
    expect(headerRule).toContain("-webkit-app-region: drag")
    expect(headerButtonRule).toContain("-webkit-app-region: no-drag")
  })

  it("inherits the compact inspector header height from the whole workbench", () => {
    const workbenchRule = styles.match(/\.workbench\s*\{([^}]*)\}/)?.[1]
    const inspectorRule = styles.match(/\.version-inspector\s*\{([^}]*)\}/)?.[1]

    expect(workbenchRule).toContain(
      "--version-header-height: var(--workbench-titlebar-height)"
    )
    expect(inspectorRule).toContain(
      "grid-template-rows: var(--version-header-height) minmax(0, 1fr)"
    )
  })

  it("keeps the changes panel on summary, content, and save rows", () => {
    const changesPanelRule = styles.match(
      /\.version-panel-body\.version-panel-changes\s*\{([^}]*)\}/
    )?.[1]

    expect(changesPanelRule).toBeDefined()
    expect(changesPanelRule).toContain(
      "grid-template-rows: auto minmax(0, 1fr) auto"
    )
  })

  it("keeps table and text diffs aligned without a redundant heading row", () => {
    const tableInspectorRule = styles.match(
      /\.version-inspector-scroll\.version-inspector-table-layout\s*\{([^}]*)\}/
    )?.[1]
    const textInspectorRule = styles.match(
      /\.version-inspector-scroll\.version-inspector-text-layout\s*\{([^}]*)\}/
    )?.[1]
    const sharedDiffBarRule = styles.match(
      /\.version-inspector-diff-bar\s*\{([^}]*)\}/
    )?.[1]
    const tableViewportRule = styles.match(
      /\.version-inspector-table \.version-table-diff-viewport,\s*\.version-inspector-table\s+\.version-table-diff-viewport\[data-scrollable="true"\]\s*\{([^}]*)\}/
    )?.[1]

    expect(tableInspectorRule).toContain("grid-template-rows: minmax(0, 1fr)")
    expect(textInspectorRule).toContain("grid-template-rows: minmax(0, 1fr)")
    expect(tableInspectorRule).toContain("overflow: hidden")
    expect(textInspectorRule).toContain("overflow: hidden")
    expect(sharedDiffBarRule).toContain("min-height: 2.4rem")
    expect(sharedDiffBarRule).toContain("padding: 0.45rem 0.8rem")
    expect(tableViewportRule).toContain("flex: 1 1 auto")
    expect(tableViewportRule).toContain("max-height: none")
  })
})
