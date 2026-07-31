import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8")

describe("Settings responsive layout", () => {
  it("keeps the single-column shell after the sidebar was removed", () => {
    const responsiveStart = styles.indexOf("@media (max-width: 56rem)")
    const responsiveEnd = styles.indexOf(
      "@media (prefers-reduced-motion: reduce)",
      responsiveStart
    )
    const responsiveStyles = styles.slice(responsiveStart, responsiveEnd)

    expect(responsiveStart).toBeGreaterThan(-1)
    expect(responsiveEnd).toBeGreaterThan(responsiveStart)
    expect(responsiveStyles).not.toMatch(
      /\.settings-shell\s*\{[^}]*grid-template-columns/
    )
  })
})
