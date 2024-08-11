import { Suspense, lazy, useEffect } from "react"
import { Outlet, useNavigate } from "react-router-dom"

import { DocExtBlockLoader } from "@/components/doc-ext-block-loader"
import { KeyboardShortCuts } from "@/components/keyboard-shortcuts"
import { useActivation } from "@/hooks/use-activation"
import { useWindowControlsOverlayVisible } from "@/hooks/use-window-controls-overlay-visiabe"

import { DatabaseLayoutBase } from "./base-layout"
import { PWALayoutBase } from "./base-pwa-layout"
import { useLayoutInit } from "./hook"

const WebLLM = lazy(() => import("@/components/ai-chat/webllm"))

export default function DatabaseLayout() {
  const windowControlsOverlayVisible = useWindowControlsOverlayVisible()
  const navigate = useNavigate()
  const { isActivated } = useActivation()

  useLayoutInit()

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
        <KeyboardShortCuts />
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
      <KeyboardShortCuts />
      <Suspense fallback={<div></div>}>
        <WebLLM />
      </Suspense>
      <Outlet />
    </DatabaseLayoutBase>
  )
}
