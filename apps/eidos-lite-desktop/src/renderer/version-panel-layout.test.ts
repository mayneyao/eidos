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
