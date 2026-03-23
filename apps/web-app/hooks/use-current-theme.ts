import { useMemo } from "react"

import { useSpaceTheme } from "./use-space-theme"

export const useCurrentTheme = () => {
  const { currentTheme: currentThemeName, currentThemeCss } = useSpaceTheme()

  return useMemo(() => {
    return {
      name: currentThemeName,
      css: currentThemeCss || "",
    }
  }, [currentThemeName, currentThemeCss])
}
