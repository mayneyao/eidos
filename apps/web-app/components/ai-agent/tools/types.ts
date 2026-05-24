import React from "react"

export interface ToolUIConfig {
  displayName: string | ((args: any) => string)
  subtitle?: (args: any) => string
  renderOutput?: (data: any, args: any) => React.ReactNode
  isWasmInteractive?: boolean
}
