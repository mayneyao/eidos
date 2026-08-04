// @vitest-environment jsdom

import { resolveEidosFileGridTheme } from "./theme-internal"

describe("Eidos File Grid theme adapter", () => {
  it("resolves Canvas colors from the active Eidos File theme root", () => {
    const root = document.createElement("section")
    root.dataset.eidosFileRoot = ""
    root.style.setProperty("--background", "rgb(250, 251, 252)")
    root.style.setProperty("--foreground", "rgb(25, 30, 35)")
    root.style.setProperty("--muted", "rgb(238, 242, 244)")
    root.style.setProperty("--muted-foreground", "rgb(92, 101, 108)")
    root.style.setProperty("--accent", "rgb(215, 240, 244)")
    root.style.setProperty("--border", "rgb(210, 216, 220)")
    root.style.setProperty("--primary", "rgb(12, 132, 150)")
    root.style.setProperty("--primary-foreground", "rgb(250, 253, 254)")
    document.body.append(root)

    const theme = resolveEidosFileGridTheme("light", root)

    expect(theme.bgCell).toBe("rgb(250, 251, 252)")
    expect(theme.textDark).toBe("rgb(25, 30, 35)")
    expect(theme.bgHeaderHovered).toBe("rgb(238, 242, 244)")
    expect(theme.borderColor).toBe("rgb(210, 216, 220)")
    expect(theme.accentColor).toBe("rgb(12, 132, 150)")
    expect(theme.accentLight).toBe("rgb(215, 240, 244)")
    expect(theme.bgHeaderHasFocus).toBe("rgb(215, 240, 244)")
    expect(theme.bgSearchResult).toBe("rgb(215, 240, 244)")

    root.remove()
  })

  it("resolves host variable chains before passing colors to Canvas", () => {
    const root = document.createElement("section")
    root.dataset.eidosFileRoot = ""
    root.style.setProperty(
      "--theme-surface",
      "light-dark(oklch(1 0 0), oklch(0.17 0.012 230))"
    )
    root.style.setProperty(
      "--theme-ink",
      "light-dark(oklch(0.2 0.012 230), oklch(0.92 0.008 220))"
    )
    root.style.setProperty(
      "--theme-accent",
      "light-dark(oklch(0.5 0.105 210), oklch(0.74 0.095 205))"
    )
    root.style.setProperty("--canvas", "var(--theme-surface)")
    root.style.setProperty("--ink", "var(--theme-ink)")
    root.style.setProperty("--primary-action", "var(--theme-accent)")
    root.style.setProperty("--background", "var(--canvas)")
    root.style.setProperty("--foreground", "var(--ink)")
    root.style.setProperty("--muted", "var(--canvas)")
    root.style.setProperty("--muted-foreground", "var(--ink)")
    root.style.setProperty("--accent", "var(--theme-accent)")
    root.style.setProperty("--border", "var(--ink)")
    root.style.setProperty("--primary", "var(--primary-action)")
    root.style.setProperty("--primary-foreground", "var(--canvas)")
    document.body.append(root)

    const lightTheme = resolveEidosFileGridTheme("light", root)
    const darkTheme = resolveEidosFileGridTheme("dark", root)

    expect(lightTheme.bgCell).toBe("oklch(1 0 0)")
    expect(lightTheme.textDark).toBe("oklch(0.2 0.012 230)")
    expect(lightTheme.accentColor).toBe("oklch(0.5 0.105 210)")
    expect(darkTheme.bgCell).toBe("oklch(0.17 0.012 230)")
    expect(darkTheme.textDark).toBe("oklch(0.92 0.008 220)")
    expect(darkTheme.accentColor).toBe("oklch(0.74 0.095 205)")
    expect(Object.values(lightTheme).join(" ")).not.toContain("var(")
    expect(Object.values(darkTheme).join(" ")).not.toContain("var(")

    root.remove()
  })
})
