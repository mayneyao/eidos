// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server"

import {
  SettingsRow,
  SettingsRows,
  SettingsRowSurface,
  SettingsSection,
} from "./settings-surface"

describe("Settings surface", () => {
  it("provides one reusable border surface for settings content", () => {
    const markup = renderToStaticMarkup(
      <SettingsRowSurface>
        <div>Setting row</div>
      </SettingsRowSurface>
    )

    expect(markup).toContain('data-settings-row-surface="true"')
    expect(markup.match(/border-border\/80/g)).toHaveLength(1)
  })

  it("renders a section with title, description, and framed content", () => {
    const markup = renderToStaticMarkup(
      <SettingsSection title="General" description="Basic preferences">
        <SettingsRows>
          <SettingsRow title="Name" description="Display name">
            <input />
          </SettingsRow>
        </SettingsRows>
      </SettingsSection>
    )

    expect(markup).toContain("General")
    expect(markup).toContain("Basic preferences")
    expect(markup).toContain('data-settings-row-surface="true"')
    expect(markup).toContain("divide-y")
    expect(markup).toContain("Display name")
  })

  it("supports unframed sections", () => {
    const markup = renderToStaticMarkup(
      <SettingsSection title="Theme" framed={false}>
        <div>custom content</div>
      </SettingsSection>
    )

    expect(markup).toContain("custom content")
    expect(markup).not.toContain('data-settings-row-surface="true"')
  })

  it("links row labels to controls via htmlFor", () => {
    const markup = renderToStaticMarkup(
      <SettingsRow htmlFor="toggle" title="Enabled">
        <input id="toggle" type="checkbox" />
      </SettingsRow>
    )

    expect(markup).toContain('for="toggle"')
  })
})
