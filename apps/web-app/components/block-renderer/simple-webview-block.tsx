import React, { useEffect, useRef } from "react"
import { useTheme } from "next-themes"

import { getThemeVariables } from "@/lib/web/theme"
import { useAllThemes } from "@/hooks/use-all-themes"

import { useThemeStore } from "../../store/theme-store"

export interface SimpleWebViewBlockProps {
  url: string
  width?: string | number
  height?: string | number
}

export const SimpleWebViewBlock: React.FC<SimpleWebViewBlockProps> = ({
  url,
  width,
  height,
}) => {
  const webviewRef = useRef<HTMLWebViewElement | null>(null)
  const { theme } = useTheme()
  const { currentThemeName } = useThemeStore()
  const allThemes = useAllThemes()

  const themeVariables = React.useMemo(() => {
    const currentThemeDef = allThemes.find((t) => t.name === currentThemeName)
    if (currentThemeDef) {
      return getThemeVariables(currentThemeDef.css, theme === "dark")
    }
    return {}
  }, [allThemes, currentThemeName, theme])

  // Handle theme changes
  useEffect(() => {
    if (!webviewRef.current) return
    webviewRef.current.contentWindow?.postMessage(
      { type: "theme-change", theme, variables: themeVariables },
      "*"
    )
  }, [theme, themeVariables])

  // Setup webview event listeners
  useEffect(() => {
    if (!webviewRef.current) return

    webviewRef.current.addEventListener("dom-ready", () => {
      console.log("extension-web-view-dom-ready")
      // @ts-ignore
      const id = webviewRef.current?.getWebContentsId()
      window.eidos.send("webview-dom-ready", id)
    })
  }, [])

  return (
    <webview
      ref={webviewRef}
      src={url}
      style={{
        minHeight: height,
        minWidth: width,
      }}
      // @ts-ignore
      allowpopups="true"
      // @ts-ignore
      autosize="true"
    />
  )
}
