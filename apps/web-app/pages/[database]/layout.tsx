import { useEffect } from "react"
import { Outlet } from "react-router-dom"

import { useActivation } from "@/apps/web-app/hooks/use-activation"
import { useWindowControlsOverlayVisible } from "@/apps/web-app/hooks/use-window-controls-overlay-visiabe"
import { DocExtBlockLoader } from "@/components/doc-ext-block-loader"
import { KeyboardShortCuts } from "@/components/keyboard-shortcuts"
import { useRouterAdapter } from "@/hooks/use-router-adapter"
import { TabManager } from "@/apps/web-app/components/tab-manager"

import { DatabaseLayoutBase } from "./base-layout"
import { DatabasePWALayoutBase } from "./base-pwa-layout"
import { TabContentLayout } from "./tab-content-layout"
import { useLayoutInit } from "./hook"

export default function DatabaseLayout() {
  const windowControlsOverlayVisible = useWindowControlsOverlayVisible()
  const { navigate } = useRouterAdapter()
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
      <DatabasePWALayoutBase>
        <DocExtBlockLoader />
        <KeyboardShortCuts />
        <TabManager>
          <TabContentLayout />
        </TabManager>
      </DatabasePWALayoutBase>
    )
  }
  return (
    <DatabaseLayoutBase>
      <DocExtBlockLoader />
      <KeyboardShortCuts />
      <TabManager>
        <TabContentLayout />
      </TabManager>
    </DatabaseLayoutBase>
  )
}
