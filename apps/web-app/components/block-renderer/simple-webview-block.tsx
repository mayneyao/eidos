import { useCurrentTheme } from "@/apps/web-app/hooks/use-current-theme"
import { getThemeVariables } from "@/lib/web/theme"
import { useTheme } from "@/components/theme-provider"
import defaultThemeCss from "@/styles/themes/default.css?raw"
import React, { useEffect, useRef } from "react"

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
  const { resolvedTheme } = useTheme()
  const { css: currentThemeCss } = useCurrentTheme()

  // Handle theme changes
  useEffect(() => {
    if (!webviewRef.current) return
    const variables = getThemeVariables(
      currentThemeCss || defaultThemeCss,
      resolvedTheme === "dark"
    )
    webviewRef.current.contentWindow?.postMessage(
      { type: "theme-change", theme: resolvedTheme, variables },
      "*"
    )
  }, [resolvedTheme, currentThemeCss])

  // Setup webview event listeners
  useEffect(() => {
    if (!webviewRef.current) return

    webviewRef.current.addEventListener("dom-ready", () => {
      console.log("extension-web-view-dom-ready")
      // @ts-ignore
      const id = webviewRef.current?.getWebContentsId()
      window.eidos.send("webview-dom-ready", id)
      const variables = getThemeVariables(
        currentThemeCss || defaultThemeCss,
        resolvedTheme === "dark"
      )
      webviewRef.current?.contentWindow?.postMessage(
        { type: "theme-change", theme: resolvedTheme, variables },
        "*"
      )
    })
  }, [currentThemeCss, resolvedTheme])

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
