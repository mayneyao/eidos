import { Suspense, lazy, useEffect } from "react"
import { useTheme } from "next-themes"
import { Outlet, useNavigate } from "react-router-dom"

import { useActivation } from "@/hooks/use-activation"
import { useWindowControlsOverlayVisible } from "@/hooks/use-window-controls-overlay-visiabe"
import { DocExtBlockLoader } from "@/components/doc-ext-block-loader"

import { DatabaseLayoutBase } from "./base-layout"
import { PWALayoutBase } from "./base-pwa-layout"
import { useLayoutInit } from "./hook"

const WebLLM = lazy(() => import("@/components/ai-chat/webllm"))

export default function DatabaseLayout() {
  const windowControlsOverlayVisible = useWindowControlsOverlayVisible()

  const navigate = useNavigate()
  const { isActivated } = useActivation()

  useLayoutInit()

  const { theme } = useTheme()
  useEffect(() => {
    if (theme === "dark") {
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
  }, [theme])

  useEffect(() => {
    if (!isActivated) {
      // navigate to home page
      navigate("/")
    }
  }, [isActivated, navigate])
  if (
    windowControlsOverlayVisible &&
    window.matchMedia("(display-mode: window-controls-overlay)").matches
  ) {
    return (
      <PWALayoutBase>
        <DocExtBlockLoader />
        <Suspense fallback={<div></div>}>
          <WebLLM />
        </Suspense>
        <Outlet />
      </PWALayoutBase>
    )
  }
  return (
    <DatabaseLayoutBase>
      <DocExtBlockLoader />
      <Suspense fallback={<div></div>}>
        <WebLLM />
      </Suspense>
      <Outlet />
    </DatabaseLayoutBase>
  )
}
