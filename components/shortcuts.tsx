"use client"

import { useKeyPress } from "ahooks"
import { useTheme } from "next-themes"
import { useNavigate } from "react-router-dom"

import { useSpaceAppStore } from "@/apps/web-app/[database]/store"

/**
 * global shortcuts, register here
 * @returns
 */
export function ShortCuts() {
  const { setTheme, theme } = useTheme()
  const { isRightPanelOpen: isAiOpen, setIsRightPanelOpen: setIsAiOpen } = useSpaceAppStore()
  const navigate = useNavigate()

  useKeyPress(["shift.ctrl.l", "shift.meta.l"], (e) => {
    e.preventDefault()
    setTheme(theme === "dark" ? "light" : "dark")
  })

  useKeyPress(["ctrl.forwardslash", "meta.forwardslash"], () => {
    setIsAiOpen(!isAiOpen)
  })

  useKeyPress(["ctrl.openbracket", "meta.openbracket"], () => {
    navigate(-1)
  })

  useKeyPress(["ctrl.closebracket", "meta.closebracket"], () => {
    navigate(1)
  })

  return null
}
