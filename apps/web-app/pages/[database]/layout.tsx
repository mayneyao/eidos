import { Outlet } from "react-router-dom"

import { useWindowControlsOverlayVisible } from "@/apps/web-app/hooks/use-window-controls-overlay-visiabe"
import { useCurrentSpace } from "@/apps/web-app/hooks/use-current-space"
import { DocExtBlockLoader } from "@/components/doc-ext-block-loader"
import { KeyboardShortCuts } from "@/components/keyboard-shortcuts"
import { TabManager } from "@/apps/web-app/components/tab-manager"

import { DatabaseLayoutBase } from "./base-layout"
import { DatabasePWALayoutBase } from "./base-pwa-layout"
import { TabContentLayout } from "./tab-content-layout"
import { FileSpaceLayout } from "./file-space-layout"
import { useLayoutInit } from "./hook"

export default function DatabaseLayout() {
  const { currentSpace, isLoading } = useCurrentSpace()

  if (isLoading || !currentSpace) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <div className="text-sm text-muted-foreground">Opening Space…</div>
      </div>
    )
  }
  if (currentSpace.mode === "file") {
    return <FileSpaceLayout />
  }
  return <LegacyDatabaseLayout />
}

function LegacyDatabaseLayout() {
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
