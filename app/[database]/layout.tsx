"use client"

import { useEffect } from "react"
import { Outlet, useNavigate } from "react-router-dom"

import { useActivation } from "@/hooks/use-activation"
import { useWindowControlsOverlayVisible } from "@/hooks/use-window-controls-overlay-visiabe"

import { DatabaseLayoutBase } from "./base-layout"
import { PWALayoutBase } from "./base-pwa-layout"

export default function DatabaseLayout() {
  const windowControlsOverlayVisible = useWindowControlsOverlayVisible()

  const navigate = useNavigate()
  const { isActivated } = useActivation()
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
