// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server"

import {
  SETTINGS_CONTENT_BODY_CLASS_NAME,
  SettingsRowSurface,
} from "./settings-surface"

describe("Settings surface ownership", () => {
  it("only applies the shared card treatment to explicit row groups", () => {
    expect(SETTINGS_CONTENT_BODY_CLASS_NAME).not.toContain(
      "[&>div>hr+div]:border"
    )
    expect(SETTINGS_CONTENT_BODY_CLASS_NAME).toContain(
      "[&>div[data-settings-row-groups]>hr+div]:border"
    )
  })

  it("provides one reusable border surface for mixed settings pages", () => {
    const markup = renderToStaticMarkup(
      <SettingsRowSurface>
        <div>Setting row</div>
      </SettingsRowSurface>
    )

    expect(markup).toContain('data-settings-row-surface="true"')
    expect(markup.match(/border-border\/80/g)).toHaveLength(1)
  })
})
