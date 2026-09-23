import postcss, { type Declaration, type Root } from "postcss"
import { invalid } from "./errors"
import { themeFontData, validThemeToken } from "./theme"

const stylesheetPath = /^\.\/(?!.*(?:\/\.\.?\/|\\|[?#]))[A-Za-z0-9_./-]+\.css$/
const fontPath =
  /^\.\/(?!.*(?:\/\.\.?\/|\\|[?#]))[A-Za-z0-9_./-]+\.(?:woff2?|ttf|otf)$/
const modes = ["light", "dark"] as const

export function themeStylesheetPath(value: string): boolean {
  return stylesheetPath.test(value)
}

function fontSource(value: string): string {
  const match =
    /^url\((["'])([^"']+)\1\)(?:\s+format\((["'])(?:woff2?|truetype|opentype)\3\))?$/.exec(
      value
    )
  if (!match) invalid("Theme font src must be a quoted local font URL")
  return match[2]
}

export interface ParsedThemeStylesheet {
  root: Root
  fonts: Array<{ source: Declaration; path: string }>
}

/** A CSS authoring surface limited to host tokens and local @font-face assets. */
export function parseThemeStylesheet(
  css: string,
  embeddedOnly = false
): ParsedThemeStylesheet {
  if (!css.trim() || css.length > 12 * 1024 * 1024)
    invalid("Theme stylesheet is empty or oversized")
  let root: Root
  try {
    root = postcss.parse(css)
  } catch {
    invalid("Invalid theme CSS")
  }
  const seen = new Set<string>()
  const fonts: ParsedThemeStylesheet["fonts"] = []
  for (const node of root.nodes) {
    if (node.type === "comment") continue
    if (node.type === "rule") {
      const selector = node.selector.replace(/\s+/g, "")
      const mode = modes.find(
        (item) => selector === `:root[data-theme="${item}"]`
      )
      if (!mode || seen.has(mode))
        invalid("Theme CSS allows one light and one dark root rule")
      seen.add(mode)
      const tokens = new Set<string>()
      for (const child of node.nodes) {
        if (child.type === "comment") continue
        if (
          child.type !== "decl" ||
          child.important ||
          tokens.has(child.prop) ||
          !validThemeToken(child.prop, child.value)
        )
          invalid("Invalid theme CSS token")
        tokens.add(child.prop)
      }
      if (!tokens.size || tokens.size > 32)
        invalid("Theme CSS requires 1–32 tokens per appearance")
      continue
    }
    if (node.type === "atrule" && node.name.toLowerCase() === "font-face") {
      if (node.params || fonts.length >= 4)
        invalid("Theme CSS supports up to four @font-face rules")
      const declarations = new Map<string, Declaration>()
      for (const child of node.nodes ?? []) {
        if (child.type === "comment") continue
        if (
          child.type !== "decl" ||
          child.important ||
          !["font-family", "font-weight", "font-display", "src"].includes(
            child.prop
          ) ||
          declarations.has(child.prop)
        )
          invalid("Invalid theme @font-face declaration")
        declarations.set(child.prop, child)
      }
      const family = declarations
        .get("font-family")
        ?.value.replace(/^["']|["']$/g, "")
      const weight = declarations.get("font-weight")?.value
      const display = declarations.get("font-display")?.value
      const source = declarations.get("src")
      if (
        !family ||
        !/^[A-Za-z][A-Za-z0-9 -]{0,63}$/.test(family) ||
        (weight !== undefined && !/^(normal|bold|[1-9]00)$/.test(weight)) ||
        (display !== undefined &&
          !/^(swap|fallback|optional)$/.test(display)) ||
        !source
      )
        invalid("Invalid theme @font-face metadata")
      const path = fontSource(source.value)
      if (embeddedOnly ? !themeFontData(path) : !fontPath.test(path))
        invalid("Theme fonts must use local files or embedded font data")
      fonts.push({ source, path })
      continue
    }
    invalid("Theme CSS allows only appearance roots and @font-face")
  }
  if (seen.size !== 2) invalid("Theme CSS requires light and dark root rules")
  return { root, fonts }
}
