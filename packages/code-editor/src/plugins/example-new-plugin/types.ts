/**
 * Example Plugin Types
 * Plugin-specific type definitions
 */

import type { BasePluginProps } from '../base-types'

/**
 * Props for Example Plugin
 */
export interface ExamplePluginProps extends BasePluginProps {
  customMessage?: string
  triggerKey?: string
}