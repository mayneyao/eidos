/**
 * TailwindCSS Autocomplete Plugin Types
 * Plugin-specific type definitions
 */

import type { BasePluginProps } from '../base-types'

/**
 * Props for TailwindCSS Plugin
 */
export interface TailwindCSSPluginProps extends BasePluginProps {
  // Custom Tailwind configuration (similar to tailwind.config.js)
  tailwindConfig?: {
    theme?: {
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
    [key: string]: any
  }
  // Additional custom class names
  customClasses?: string[]
}