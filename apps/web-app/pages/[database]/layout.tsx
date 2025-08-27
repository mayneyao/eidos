import { useEffect } from "react"
import { Outlet, useNavigate } from "react-router-dom"

import { useEidosFileSystemInitialized } from "@/hooks/use-fs"
import { DocExtBlockLoader } from "@/components/doc-ext-block-loader"
import { KeyboardShortCuts } from "@/components/keyboard-shortcuts"
import { useActivation } from "@/apps/web-app/hooks/use-activation"
import { useWindowControlsOverlayVisible } from "@/apps/web-app/hooks/use-window-controls-overlay-visiabe"

import { DatabaseLayoutBase } from "./base-layout"
import { PWALayoutBase } from "./base-pwa-layout"
import { useLayoutInit } from "./hook"

export default function DatabaseLayout() {
  const windowControlsOverlayVisible = useWindowControlsOverlayVisible()
  const navigate = useNavigate()
  const { isActivated } = useActivation()

  useLayoutInit()
  useEidosFileSystemInitialized()

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
        <Outlet />
      </PWALayoutBase>
    )
  }
  return (
    <DatabaseLayoutBase>
      <DocExtBlockLoader />
      <KeyboardShortCuts />
      <Outlet />
    </DatabaseLayoutBase>
  )
}
