import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8")

describe("Version panel layout", () => {
  it("keeps the changes panel on summary, content, and save rows", () => {
    const changesPanelRule = styles.match(
      /\.version-panel-body\.version-panel-changes\s*\{([^}]*)\}/
    )?.[1]

    expect(changesPanelRule).toBeDefined()
    expect(changesPanelRule).toContain(
      "grid-template-rows: auto minmax(0, 1fr) auto"
    )
  })

  it("gives table diffs one dedicated scrolling viewport", () => {
    const tableInspectorRule = styles.match(
      /\.version-inspector-scroll\.version-inspector-table-layout\s*\{([^}]*)\}/
    )?.[1]
    const tableViewportRule = styles.match(
      /\.version-inspector-table \.version-table-diff-viewport,\s*\.version-inspector-table\s+\.version-table-diff-viewport\[data-scrollable="true"\]\s*\{([^}]*)\}/
    )?.[1]

    expect(tableInspectorRule).toContain(
      "grid-template-rows: auto auto minmax(0, 1fr)"
    )
    expect(tableInspectorRule).toContain("overflow: hidden")
    expect(tableViewportRule).toContain("flex: 1 1 auto")
    expect(tableViewportRule).toContain("max-height: none")
  })
})
