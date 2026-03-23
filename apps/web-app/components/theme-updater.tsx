import { useEffect } from "react"
import { useTheme } from "@/components/theme-provider"

import { useSpaceTheme } from "@/apps/web-app/hooks/use-space-theme"

export const ThemeUpdater = () => {
  const { resolvedTheme } = useTheme()
  // Initialize space-based theme (auto-loads and applies current theme)
  useSpaceTheme()

  useEffect(() => {
    if (resolvedTheme === "dark") {
      const themeMeta = document.querySelector('meta[name="theme-color"]')
      if (themeMeta) {
        themeMeta.setAttribute("content", "#000000")
      } else {
        const meta = document.createElement("meta")
        meta.setAttribute("name", "theme-color")
        meta.setAttribute("content", "#000000")
        document.head.appendChild(meta)
      }
    } else {
      const themeMeta = document.querySelector('meta[name="theme-color"]')
      if (themeMeta) {
        themeMeta.setAttribute("content", "#ffffff")
      } else {
        const meta = document.createElement("meta")
        meta.setAttribute("name", "theme-color")
        meta.setAttribute("content", "#ffffff")
        document.head.appendChild(meta)
      }
    }
  }, [resolvedTheme])
  return null
}
