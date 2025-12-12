import React, { useEffect, useRef, useState } from "react"
import { useTheme } from "@/components/theme-provider"

import { serializePropsToUrl } from "@/lib/utils"
import { getThemeVariables } from "@/lib/web/theme"
import { useAllThemes } from "@/apps/web-app/hooks/use-all-themes"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useThemeStore } from "@/apps/web-app/store/theme-store"

interface WebViewBlockProps {
  blockId: string
  defaultProps?: Record<string, any>
  width?: string | number
  height?: string | number
  rerenderOnDefaultPropsChange?: boolean
  extraPath?: string
  hash?: string
}

export const WebViewBlock: React.FC<WebViewBlockProps> = ({
  blockId,
  defaultProps = {},
  width,
  height,
  rerenderOnDefaultPropsChange,
  extraPath,
  hash,
}) => {
  const webviewRef = useRef<HTMLWebViewElement | null>(null)
  const { space } = useCurrentPathInfo()
  const { resolvedTheme } = useTheme()
  const { currentThemeName } = useThemeStore()
  const allThemes = useAllThemes()

  const baseUrl = `http://${blockId}.block.${space}.eidos.localhost:13127/`
  const fullUrl = extraPath ? `${baseUrl}${extraPath}` : baseUrl
  const urlWithHash = hash ? `${fullUrl}${hash}` : fullUrl

  const [extUrl, setExtUrl] = useState<string>(
    extraPath
      ? urlWithHash
      : `${serializePropsToUrl(defaultProps, baseUrl)}${hash || ""}`
  )

  const themeVariables = React.useMemo(() => {
    const currentThemeDef = allThemes.find((t) => t.name === currentThemeName)
    if (currentThemeDef) {
      return getThemeVariables(currentThemeDef.css, resolvedTheme === "dark")
    }
    return {}
  }, [allThemes, currentThemeName, resolvedTheme])

  // Handle props changes
  useEffect(() => {
    if (!webviewRef.current) return
    webviewRef.current.contentWindow?.postMessage(
      { type: "props-change", props: defaultProps },
      "*"
    )
  }, [defaultProps])

  // Handle theme changes
  useEffect(() => {
    if (!webviewRef.current) return
    webviewRef.current.contentWindow?.postMessage(
      { type: "theme-change", theme: resolvedTheme, variables: themeVariables },
      "*"
    )
  }, [resolvedTheme, themeVariables])

  // Setup webview event listeners
  useEffect(() => {
    if (!webviewRef.current) return

    webviewRef.current.addEventListener("dom-ready", () => {
      console.log("extension-web-view-dom-ready")
      // @ts-ignore
      const id = webviewRef.current?.getWebContentsId()
      window.eidos.send("webview-dom-ready", id)
      setTimeout(() => {
        webviewRef.current?.contentWindow?.postMessage(
          JSON.stringify({ type: "props-change", props: defaultProps })
        )
      }, 5000)
    })
  }, [defaultProps])

  // Update URL when props change (without rerender trigger)
  useEffect(() => {
    const newBaseUrl = `http://${blockId}.block.${space}.eidos.localhost:13127/`
    const newFullUrl = extraPath ? `${newBaseUrl}${extraPath}` : newBaseUrl
    const newUrlWithHash = hash ? `${newFullUrl}${hash}` : newFullUrl
    const url = extraPath
      ? newUrlWithHash
      : `${serializePropsToUrl(defaultProps, newBaseUrl)}${hash || ""}`
    if (url !== extUrl) {
      setExtUrl(url)
    }
  }, [blockId, space, extraPath, hash])

  // Update URL when props change (with rerender trigger)
  useEffect(() => {
    if (rerenderOnDefaultPropsChange && !extraPath) {
      const newBaseUrl = `http://${blockId}.block.${space}.eidos.localhost:13127/`
      const url = `${serializePropsToUrl(defaultProps, newBaseUrl)}${hash || ""}`
      if (url !== extUrl) {
        setExtUrl(url)
      }
    }
  }, [
    blockId,
    space,
    extUrl,
    defaultProps,
    rerenderOnDefaultPropsChange,
    extraPath,
    hash,
  ])

  console.log("extUrl", extUrl)
  return (
    <webview
      ref={webviewRef}
      src={extUrl.toString()}
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
