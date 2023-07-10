import React from "react"
import { GridMouseEventArgs } from "@platools/glide-data-grid"

const oddRowOrHoverRowThemeOverride = (isDarkMode: boolean) => {
  if (isDarkMode) {
    return {
      bgCell: "#2d2d2d",
      bgCellMedium: "#3a3a3a",
    }
  }
  return {
    bgCell: "#f7f7f7",
    bgCellMedium: "#f0f0f0",
  }
}

export const useHover = ({ theme }: { theme?: string }) => {
  const [hoverRow, setHoverRow] = React.useState<number | undefined>(undefined)
  const onItemHovered = React.useCallback((args: GridMouseEventArgs) => {
    const [_, row] = args.location
    setHoverRow(args.kind !== "cell" ? undefined : row)
  }, [])

  const getRowThemeOverride = React.useCallback<any>(
    (row:any) => {
      const isDarkMode = theme === "dark"
      const isOddRow = row % 2 === 1
      if (isOddRow) return oddRowOrHoverRowThemeOverride(isDarkMode)
      if (row !== hoverRow) return undefined
      return oddRowOrHoverRowThemeOverride(isDarkMode)
    },
    [hoverRow, theme]
  )

  return {
    onItemHovered,
    getRowThemeOverride,
  }
}
