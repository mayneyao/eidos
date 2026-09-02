import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

const styles = readFileSync(
  new URL(
    "../../../../packages/eidos-file-ui/src/host-styles.css",
    import.meta.url
  ),
  "utf8"
)
const liteStyles = readFileSync(
  new URL("./styles.css", import.meta.url),
  "utf8"
)
const rootStart = styles.indexOf(":root {")
const rootEnd = styles.indexOf("}\n", rootStart)
const rootTheme = styles.slice(rootStart, rootEnd + 1)
const componentStyles = styles.slice(rootEnd + 1)
const markdownSurfaceStart = liteStyles.indexOf(".markdown-editor-surface {")
const markdownSurfaceEnd = liteStyles.indexOf("}\n", markdownSurfaceStart)
const markdownSurfaceTheme = liteStyles.slice(
  markdownSurfaceStart,
  markdownSurfaceEnd + 1
)

type Oklch = readonly [lightness: number, chroma: number, hue: number]

function pairedColor(name: string): readonly [Oklch, Oklch] {
  const match = rootTheme.match(
    new RegExp(
      `--${name}:\\s*light-dark\\(\\s*oklch\\(([^)]+)\\),\\s*oklch\\(([^)]+)\\)\\s*\\)`
    )
  )
  if (!match?.[1] || !match[2]) throw new Error(`Missing ${name} theme pair`)
  const parse = (value: string): Oklch => {
    const components = value.trim().split(/\s+/).map(Number)
    if (components.length !== 3 || components.some(Number.isNaN)) {
      throw new Error(`Invalid ${name} OKLCH value`)
    }
    return components as unknown as Oklch
  }
  return [parse(match[1]), parse(match[2])]
}

function linearSrgb([lightness, chroma, hue]: Oklch): readonly number[] {
  const radians = (hue * Math.PI) / 180
  const a = chroma * Math.cos(radians)
  const b = chroma * Math.sin(radians)
  const lRoot = lightness + 0.3963377774 * a + 0.2158037573 * b
  const mRoot = lightness - 0.1055613458 * a - 0.0638541728 * b
  const sRoot = lightness - 0.0894841775 * a - 1.291485548 * b
  const l = lRoot ** 3
  const m = mRoot ** 3
  const s = sRoot ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((channel) => Math.max(0, Math.min(1, channel)))
}

function luminance(color: Oklch): number {
  const [red, green, blue] = linearSrgb(color)
  return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!
}

function contrast(first: Oklch, second: Oklch): number {
  const lighter = Math.max(luminance(first), luminance(second))
  const darker = Math.min(luminance(first), luminance(second))
  return (lighter + 0.05) / (darker + 0.05)
}

describe("shared Eidos File host theme", () => {
  it("derives the application palette from paired light and dark inputs", () => {
    expect(rootTheme).toContain("--theme-surface: light-dark(")
    expect(rootTheme).toContain("--theme-ink: light-dark(")
    expect(rootTheme).toContain("--theme-accent: light-dark(")
    expect(rootTheme).toContain("--canvas: var(--theme-surface)")
    expect(rootTheme).toContain("--lite-accent: var(--theme-accent)")
    expect(rootTheme).toContain("--theme-contrast: 45")
  })

  it("defines shared typography, status, interaction, and elevation roles", () => {
    expect(rootTheme).toContain("--font-ui:")
    expect(rootTheme).toContain("--font-code:")
    expect(rootTheme).toContain("--surface-hover: light-dark(")
    expect(rootTheme).toContain("--surface-selected: light-dark(")
    expect(rootTheme).toContain("--success-surface: color-mix(")
    expect(rootTheme).toContain("--warning-surface: color-mix(")
    expect(rootTheme).toContain("--danger-surface: color-mix(")
    expect(rootTheme).toContain("--elevation-shadow:")
  })

  it("maps Eidos File controls and Canvas states to the same semantic palette", () => {
    expect(componentStyles).toContain("--primary: var(--primary-action)")
    expect(componentStyles).toContain("--secondary: var(--surface-selected)")
    expect(componentStyles).toContain("--muted: var(--surface-hover)")
    expect(componentStyles).toContain("--accent: var(--surface-selected)")
    expect(componentStyles).toContain("--border: var(--line)")
    expect(componentStyles).toContain("--ring: var(--focus)")
  })

  it("maps the Markdown editor to defined host theme roles", () => {
    expect(markdownSurfaceTheme).toContain("--background: var(--canvas)")
    expect(markdownSurfaceTheme).toContain("--foreground: var(--ink)")
    expect(markdownSurfaceTheme).toContain("--muted: var(--surface-hover)")
    expect(markdownSurfaceTheme).toContain(
      "--muted-foreground: var(--ink-muted)"
    )
    expect(markdownSurfaceTheme).toContain("--accent: var(--surface-selected)")
    expect(markdownSurfaceTheme).toContain("--primary: var(--primary-action)")
    expect(markdownSurfaceTheme).not.toContain("--surface-muted")
  })

  it("uses a white light canvas with restrained cyan interaction color", () => {
    const [lightSurface, darkSurface] = pairedColor("theme-surface")
    const accents = pairedColor("theme-accent")

    expect(lightSurface).toEqual([1, 0, 0])
    expect(darkSurface[0]).toBeLessThan(0.2)
    for (const [, chroma, hue] of accents) {
      expect(chroma).toBeGreaterThanOrEqual(0.07)
      expect(chroma).toBeLessThanOrEqual(0.12)
      expect(hue).toBeGreaterThanOrEqual(195)
      expect(hue).toBeLessThanOrEqual(220)
    }
  })

  it("keeps raw palette values inside the root theme layer", () => {
    expect(componentStyles).not.toContain("oklch(")
  })

  it("keeps required text and semantic colors above AA contrast", () => {
    const surfaces = pairedColor("theme-surface")
    const primaryInk = pairedColor("theme-ink")
    const accent = pairedColor("theme-accent")
    const accentContrast = pairedColor("accent-contrast")

    for (const variant of [0, 1] as const) {
      expect(contrast(primaryInk[variant], surfaces[variant])).toBeGreaterThan(
        7
      )
      expect(
        contrast(accentContrast[variant], accent[variant])
      ).toBeGreaterThanOrEqual(4.5)
      for (const role of [
        "ink-muted",
        "ink-faint",
        "accent-strong",
        "theme-success",
        "theme-warning",
        "theme-danger",
      ]) {
        expect(
          contrast(pairedColor(role)[variant], surfaces[variant]),
          `${role} variant ${variant}`
        ).toBeGreaterThanOrEqual(4.5)
      }
    }
  })
})
