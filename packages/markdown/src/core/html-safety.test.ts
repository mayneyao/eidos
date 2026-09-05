import { describe, expect, it } from "vitest"
import { ACTIVE_HTML } from "./html-safety"

describe("conservative HTML source fallback", () => {
  it.each([
    "<script>alert(1)</script>",
    '<IFRAME src="https://example.com"></IFRAME>',
    "<style>body { display: none }</style>",
    '<form><input name="secret"></form>',
    '<img src="x" onerror = "alert(1)">',
    '<a href="JaVaScRiPt:alert(1)">link</a>',
    '<a href="vbscript:example">link</a>',
  ])("keeps active content inert: %s", (source) => {
    expect(ACTIVE_HTML.test(source)).toBe(true)
    // The shared classifier must remain stateless across import and rendering.
    expect(ACTIVE_HTML.test(source)).toBe(true)
  })

  it.each([
    "<div><strong>Text</strong></div>",
    "<details><summary>More</summary>Text</details>",
    '<a href="https://example.com">Link</a>',
    "<table><tr><td>Cell</td></tr></table>",
  ])(
    "allows passive markup to reach the separate safe preview: %s",
    (source) => {
      expect(ACTIVE_HTML.test(source)).toBe(false)
    }
  )
})
