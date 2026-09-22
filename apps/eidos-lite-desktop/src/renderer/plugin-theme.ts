/** Resolve shared semantic tokens before crossing the opaque iframe boundary. */
export function pluginTheme(): Record<string, string> {
  const style = getComputedStyle(document.documentElement)
  const probe = document.createElement("span")
  probe.hidden = true
  document.body.append(probe)
  const values: Record<string, string> = {}
  try {
    for (const [name, token] of Object.entries({
      background: "--canvas",
      foreground: "--ink",
      muted: "--ink-muted",
      "surface-hover": "--surface-hover",
      "surface-selected": "--surface-selected",
      border: "--line",
      accent: "--lite-accent",
      "scrollbar-thumb": "--scrollbar-thumb",
      "scrollbar-thumb-hover": "--scrollbar-thumb-hover",
      "scrollbar-thumb-active": "--scrollbar-thumb-active",
    })) {
      probe.style.color = `var(${token})`
      values[`--eidos-${name}`] = getComputedStyle(probe).color
    }
    values["--eidos-font-family"] = style.fontFamily
    values["--eidos-color-scheme"] = style.colorScheme
    return values
  } finally {
    probe.remove()
  }
}
