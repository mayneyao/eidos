"use client"

import { Outlet } from "react-router-dom"

import { useWindowControlsOverlayVisible } from "@/hooks/use-window-controls-overlay-visiabe"

import { DatabaseLayoutBase } from "./base-layout"
import { PWALayoutBase } from "./base-pwa-layout"

export default function DatabaseLayout() {
  const windowControlsOverlayVisible = useWindowControlsOverlayVisible()
  if (
    windowControlsOverlayVisible &&
    window.matchMedia("(display-mode: window-controls-overlay)").matches
  ) {
    return (
      <PWALayoutBase>
        <Outlet />
      </PWALayoutBase>
    )
  }
  return (
    <DatabaseLayoutBase>
      <Outlet />
    </DatabaseLayoutBase>
  )
}
