import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

const styles = readFileSync(
  new URL(
    "../../../../packages/eidos-file-ui/src/host-styles.css",
    import.meta.url
  ),
  "utf8"
)

describe("shared Eidos File scrollbar styling", () => {
  it("uses shared theme-derived colors with a default-width transparent track", () => {
    expect(styles).toContain(
      "--scrollbar-thumb: color-mix(in oklab, var(--ink) 14%, transparent)"
    )
    expect(styles).toMatch(
      /\*::\-webkit-scrollbar\s*\{[^}]*width:\s*15px;[^}]*height:\s*15px;/
    )
    expect(styles).toMatch(
      /\*::\-webkit-scrollbar-thumb\s*\{[^}]*border:\s*3px solid transparent;[^}]*border-radius:\s*999px;[^}]*background:\s*var\(--scrollbar-thumb\);[^}]*background-clip:\s*padding-box;/
    )
    expect(styles).toMatch(
      /\*::\-webkit-scrollbar-track,[\s\S]*?\{[^}]*background:\s*transparent;/
    )
  })

  it("reveals stronger feedback only while interacting", () => {
    expect(styles).toContain(
      "--scrollbar-thumb-hover: color-mix(in oklab, var(--ink) 24%, transparent)"
    )
    expect(styles).toContain(
      "--scrollbar-thumb-active: color-mix(in oklab, var(--ink) 34%, transparent)"
    )
    expect(styles).toMatch(
      /\*::\-webkit-scrollbar-thumb:hover\s*\{[^}]*var\(--scrollbar-thumb-hover\);/
    )
    expect(styles).toMatch(
      /\*::\-webkit-scrollbar-thumb:active\s*\{[^}]*var\(--scrollbar-thumb-active\);/
    )
  })
})
