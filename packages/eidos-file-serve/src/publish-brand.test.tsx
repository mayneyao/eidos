import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { EidosPublishBrand, publishBrandingVisible } from "./publish-brand"

describe("published Eidos File branding", () => {
  it("defaults to visible and honors an explicit hidden preference", () => {
    expect(publishBrandingVisible(null)).toBe(true)
    expect(publishBrandingVisible("show")).toBe(true)
    expect(publishBrandingVisible("hide")).toBe(false)
  })

  it("renders only the linked Eidos brand content", () => {
    const html = renderToStaticMarkup(<EidosPublishBrand />)
    expect(html).toContain("Built with <strong>Eidos</strong>")
    expect(html).toContain("eidos-publish-brand-inline")
    expect(html).not.toContain("Published")
    expect(html).not.toContain("Read only")
    expect(html).not.toContain("SQLite")
  })
})
