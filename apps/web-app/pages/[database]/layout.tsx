import { Outlet } from "react-router-dom"

import { useWindowControlsOverlayVisible } from "@/apps/web-app/hooks/use-window-controls-overlay-visiabe"
import { DocExtBlockLoader } from "@/components/doc-ext-block-loader"
import { KeyboardShortCuts } from "@/components/keyboard-shortcuts"
import { TabManager } from "@/apps/web-app/components/tab-manager"

import { DatabaseLayoutBase } from "./base-layout"
import { DatabasePWALayoutBase } from "./base-pwa-layout"
import { TabContentLayout } from "./tab-content-layout"
import { useLayoutInit } from "./hook"

export default function DatabaseLayout() {
  const windowControlsOverlayVisible = useWindowControlsOverlayVisible()

  useLayoutInit()

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
