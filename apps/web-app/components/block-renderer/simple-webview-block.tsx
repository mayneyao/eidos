import { useTheme } from "@/components/theme-provider"
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

  // Handle theme changes
  useEffect(() => {
    if (!webviewRef.current) return
    webviewRef.current.contentWindow?.postMessage(
      { type: "theme-change", theme: resolvedTheme },
      "*"
    )
  }, [resolvedTheme])

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
