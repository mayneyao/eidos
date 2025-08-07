/**
 * Utility functions to generate Tailwind CSS class names from configuration
 */

export interface TailwindThemeConfig {
  colors?: Record<string, string | Record<string, string>>
  spacing?: Record<string, string>
  fontSize?: Record<string, string | [string, string] | [string, { lineHeight: string; letterSpacing?: string }]>
  fontFamily?: Record<string, string[]>
  screens?: Record<string, string>
  borderRadius?: Record<string, string>
  boxShadow?: Record<string, string>
  extend?: {
    colors?: Record<string, string | Record<string, string>>
    spacing?: Record<string, string>
    fontSize?: Record<string, string | [string, string] | [string, { lineHeight: string; letterSpacing?: string }]>
    fontFamily?: Record<string, string[]>
    screens?: Record<string, string>
    borderRadius?: Record<string, string>
    boxShadow?: Record<string, string>
    [key: string]: any
  }
  [key: string]: any
}

export interface TailwindConfig {
  theme?: TailwindThemeConfig
  [key: string]: any
}

/**
 * Generate color classes from theme configuration
 */
function generateColorClasses(colors: Record<string, string | Record<string, string>>, prefixes: string[]): string[] {
  const classes: string[] = []
  
  Object.entries(colors).forEach(([colorName, colorValue]) => {
    if (typeof colorValue === 'string') {
      // Single color value
      prefixes.forEach(prefix => {
        classes.push(`${prefix}-${colorName}`)
      })
    } else if (typeof colorValue === 'object') {
      // Color with shades
      Object.keys(colorValue).forEach(shade => {
        prefixes.forEach(prefix => {
          if (shade === 'DEFAULT') {
            classes.push(`${prefix}-${colorName}`)
          } else {
            classes.push(`${prefix}-${colorName}-${shade}`)
          }
        })
      })
    }
  })
  
  return classes
}

/**
 * Generate spacing classes from theme configuration
 */
function generateSpacingClasses(spacing: Record<string, string>, prefixes: string[]): string[] {
  const classes: string[] = []
  
  Object.keys(spacing).forEach(key => {
    prefixes.forEach(prefix => {
      classes.push(`${prefix}-${key}`)
    })
  })
  
  return classes
}

/**
 * Generate font size classes from theme configuration
 */
function generateFontSizeClasses(fontSize: Record<string, string | [string, string] | [string, { lineHeight: string; letterSpacing?: string }]>): string[] {
  return Object.keys(fontSize).map(size => `text-${size}`)
}

/**
 * Generate font family classes from theme configuration
 */
function generateFontFamilyClasses(fontFamily: Record<string, string[]>): string[] {
  return Object.keys(fontFamily).map(family => `font-${family}`)
}

/**
 * Generate border radius classes from theme configuration
 */
function generateBorderRadiusClasses(borderRadius: Record<string, string>): string[] {
  return Object.keys(borderRadius).map(radius => {
    if (radius === 'DEFAULT') {
      return 'rounded'
    }
    return `rounded-${radius}`
  })
}

/**
 * Generate box shadow classes from theme configuration
 */
function generateBoxShadowClasses(boxShadow: Record<string, string>): string[] {
  return Object.keys(boxShadow).map(shadow => {
    if (shadow === 'DEFAULT') {
      return 'shadow'
    }
    return `shadow-${shadow}`
  })
}

/**
 * Generate screen-based responsive classes
 */
function generateResponsiveClasses(screens: Record<string, string>, baseClasses: string[]): string[] {
  const responsiveClasses: string[] = []
  
  Object.keys(screens).forEach(screen => {
    baseClasses.forEach(baseClass => {
      responsiveClasses.push(`${screen}:${baseClass}`)
    })
  })
  
  return responsiveClasses
}

/**
 * Merge theme configurations (base + extend)
 */
function mergeThemeConfig(base: TailwindThemeConfig = {}, extend: TailwindThemeConfig = {}): TailwindThemeConfig {
  const merged: TailwindThemeConfig = { ...base }
  
  Object.entries(extend).forEach(([key, value]) => {
    if (key === 'extend') {
      // Skip nested extend
      return
    }
    
    if (merged[key] && typeof merged[key] === 'object' && typeof value === 'object') {
      merged[key] = { ...merged[key], ...value }
    } else {
      merged[key] = value
    }
  })
  
  return merged
}

/**
 * Main function to generate Tailwind CSS classes from configuration
 */
export function generateTailwindClasses(config: TailwindConfig, additionalClasses: string[] = []): string[] {
  const classes: string[] = [...additionalClasses]
  
  if (!config.theme) {
    return classes
  }
  
  // Merge base theme with extend
  const theme = mergeThemeConfig(config.theme, config.theme.extend)
  
  // Generate color classes
  if (theme.colors) {
    const colorPrefixes = [
      'text', 'bg', 'border', 'ring', 'shadow',
      'decoration', 'accent', 'caret', 'fill', 'stroke',
      'outline', 'divide'
    ]
    classes.push(...generateColorClasses(theme.colors, colorPrefixes))
  }
  
  // Generate spacing classes
  if (theme.spacing) {
    const spacingPrefixes = [
      'p', 'px', 'py', 'pt', 'pr', 'pb', 'pl',
      'm', 'mx', 'my', 'mt', 'mr', 'mb', 'ml',
      'w', 'h', 'top', 'right', 'bottom', 'left',
      'gap', 'space-x', 'space-y', 'inset'
    ]
    classes.push(...generateSpacingClasses(theme.spacing, spacingPrefixes))
  }
  
  // Generate font size classes
  if (theme.fontSize) {
    classes.push(...generateFontSizeClasses(theme.fontSize))
  }
  
  // Generate font family classes
  if (theme.fontFamily) {
    classes.push(...generateFontFamilyClasses(theme.fontFamily))
  }
  
  // Generate border radius classes
  if (theme.borderRadius) {
    classes.push(...generateBorderRadiusClasses(theme.borderRadius))
  }
  
  // Generate box shadow classes
  if (theme.boxShadow) {
    classes.push(...generateBoxShadowClasses(theme.boxShadow))
  }
  
  // Generate responsive variants if screens are defined
  if (theme.screens) {
    const baseClasses = classes.slice() // Copy current classes
    classes.push(...generateResponsiveClasses(theme.screens, baseClasses))
  }
  
  return classes
}

/**
 * Default Tailwind configuration for common use cases
 */
export const DEFAULT_TAILWIND_CONFIG: TailwindConfig = {
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      black: '#000000',
      white: '#ffffff',
      gray: {
        50: '#f9fafb',
        100: '#f3f4f6',
        200: '#e5e7eb',
        300: '#d1d5db',
        400: '#9ca3af',
        500: '#6b7280',
        600: '#4b5563',
        700: '#374151',
        800: '#1f2937',
        900: '#111827'
      },
      red: {
        50: '#fef2f2',
        100: '#fee2e2',
        200: '#fecaca',
        300: '#fca5a5',
        400: '#f87171',
        500: '#ef4444',
        600: '#dc2626',
        700: '#b91c1c',
        800: '#991b1b',
        900: '#7f1d1d'
      },
      blue: {
        50: '#eff6ff',
        100: '#dbeafe',
        200: '#bfdbfe',
        300: '#93c5fd',
        400: '#60a5fa',
        500: '#3b82f6',
        600: '#2563eb',
        700: '#1d4ed8',
        800: '#1e40af',
        900: '#1e3a8a'
      },
      green: {
        50: '#f0fdf4',
        100: '#dcfce7',
        200: '#bbf7d0',
        300: '#86efac',
        400: '#4ade80',
        500: '#22c55e',
        600: '#16a34a',
        700: '#15803d',
        800: '#166534',
        900: '#14532d'
      }
    },
    spacing: {
      0: '0px',
      1: '0.25rem',
      2: '0.5rem',
      3: '0.75rem',
      4: '1rem',
      5: '1.25rem',
      6: '1.5rem',
      8: '2rem',
      10: '2.5rem',
      12: '3rem',
      16: '4rem',
      20: '5rem',
      24: '6rem'
    },
    fontSize: {
      xs: '0.75rem',
      sm: '0.875rem',
      base: '1rem',
      lg: '1.125rem',
      xl: '1.25rem',
      '2xl': '1.5rem',
      '3xl': '1.875rem',
      '4xl': '2.25rem'
    },
    borderRadius: {
      DEFAULT: '0.25rem',
      none: '0px',
      sm: '0.125rem',
      md: '0.375rem',
      lg: '0.5rem',
      xl: '0.75rem',
      full: '9999px'
    }
  }
}