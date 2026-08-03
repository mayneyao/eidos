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
})
