export type ThemeVariables = {
  background: string
  foreground: string
  muted: string
  "muted-foreground": string
  popover: string
  "popover-foreground": string
  border: string
  input: string
  card: string
  "card-foreground": string
  primary: string
  "primary-foreground": string
  secondary: string
  "secondary-foreground": string
  accent: string
  "accent-foreground": string
  destructive: string
  "destructive-foreground": string
  ring: string
  radius: string
  [key: string]: string
}

export type ExtendedThemeVariables = ThemeVariables & {
  "chart-1": string
  "chart-2": string
  "chart-3": string
  "chart-4": string
  "chart-5": string
  sidebar: string
  "sidebar-foreground": string
  "sidebar-primary": string
  "sidebar-primary-foreground": string
  "sidebar-accent": string
  "sidebar-accent-foreground": string
  "sidebar-border": string
  "sidebar-ring": string
  "font-sans": string
  "font-serif": string
  "font-mono": string
  "shadow-2xs": string
  "shadow-xs": string
  "shadow-sm": string
  shadow: string
  "shadow-md": string
  "shadow-lg": string
  "shadow-xl": string
  "shadow-2xl": string
  "tracking-normal": string
}

/**
 * Set a single CSS variable in :root
 * @param name CSS variable name (without -- prefix)
 * @param value CSS variable value
 */
export function setCSSVariable(name: string, value: string): void {
  document.documentElement.style.setProperty(`--${name}`, value)
}

/**
 * Set multiple CSS variables at once
 * @param variables Object containing variable names and values
 */
export function setThemeVariables(variables: Partial<ThemeVariables>): void {
  Object.entries(variables).forEach(([name, value]) => {
    if (typeof value === "string") {
      setCSSVariable(name, value)
    }
  })
}

/**
 * Get the current value of a CSS variable
 * @param name CSS variable name (without -- prefix)
 * @returns The current value of the CSS variable
 */
export function getCSSVariable(name: string): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(`--${name}`)
    .trim()
}

/**
 * Get all current theme variables
 * @returns Object containing all theme variables and their values
 */
export function getAllThemeVariables(): ThemeVariables {
  const style = getComputedStyle(document.documentElement)
  const variables: ThemeVariables = {} as ThemeVariables

  for (const key in defaultTheme) {
    const value = style.getPropertyValue(`--${key}`).trim()
    variables[key] = value || defaultTheme[key]
  }

  return variables
}

// Default theme values based on your globals.css (HSL values without hsl() wrapper)
export const defaultTheme: ThemeVariables = {
  background: "0 0% 100%",
  foreground: "224 71.4% 4.1%",
  muted: "220 14.3% 95.9%",
  "muted-foreground": "220 8.9% 46.1%",
  popover: "0 0% 100%",
  "popover-foreground": "224 71.4% 4.1%",
  border: "220 13% 91%",
  input: "220 13% 91%",
  card: "0 0% 100%",
  "card-foreground": "224 71.4% 4.1%",
  primary: "220.9 39.3% 11%",
  "primary-foreground": "210 20% 98%",
  secondary: "220 14.3% 95.9%",
  "secondary-foreground": "220.9 39.3% 11%",
  accent: "220 14.3% 95.9%",
  "accent-foreground": "220.9 39.3% 11%",
  destructive: "0 84.2% 60.2%",
  "destructive-foreground": "210 20% 98%",
  ring: "224 71.4% 4.1%",
  radius: "0.5rem",
}

/**
 * Parse and set CSS variables from a theme configuration
 * @param theme Theme configuration object
 * @param selector CSS selector to apply the theme to (default: ':root')
 */
export function setThemeConfig(
  theme: Partial<ExtendedThemeVariables>,
  selector: string = ":root"
): void {
  const targetElement =
    selector === ":root"
      ? document.documentElement
      : (document.querySelector(selector) as HTMLElement)

  if (!targetElement) {
    console.warn(`Target element with selector "${selector}" not found`)
    return
  }

  Object.entries(theme).forEach(([key, value]) => {
    if (typeof value === "string") {
      targetElement.style.setProperty(`--${key}`, value)
    }
  })
}

export function parseCSSVariables(css: string): Record<string, string> {
  const themeVariables: Record<string, string> = {}

  // Match CSS variable declarations
  const regex = /--([^:]+):\s*([^;]+);/g
  let match

  while ((match = regex.exec(css)) !== null) {
    const [, name, value] = match
    // if (name.trim() === "sidebar") {
    //   themeVariables["sidebar-background"] = value.trim()
    //   continue
    // }
    themeVariables[name.trim()] = value.trim()
  }

  return themeVariables
}

export const getThemeVariables = (rawCss: string, isDarkMode: boolean) => {
  try {
    // Parse both light and dark mode variables
    const lightMatch = /:root\s*{([^}]+)}/.exec(rawCss)
    const darkMatch = /\.dark\s*{([^}]+)}/.exec(rawCss)
    if (!lightMatch && !darkMatch) {
      throw new Error(
        "No valid theme definitions found. Please ensure your CSS includes both :root {...} and .dark {...} blocks."
      )
    }
    if (isDarkMode) {
      if (darkMatch) {
        const darkVariables = parseCSSVariables(darkMatch[1])
        return darkVariables
      }
    } else if (lightMatch) {
      const lightVariables = parseCSSVariables(lightMatch[1])
      return lightVariables
    }
  } catch (err) {}
}
