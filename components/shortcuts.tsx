"use client"

import { useKeyPress } from "ahooks"
import { useTheme } from "next-themes"
import { useNavigate } from "react-router-dom"

import { useSpaceAppStore } from "@/app/[database]/store"

/**
 * global shortcuts, register here
 * @returns
 */
export function ShortCuts() {
  const { setTheme, theme } = useTheme()
  const { isAiOpen, setIsAiOpen } = useSpaceAppStore()
  const navigate = useNavigate()

  useKeyPress("shift.ctrl.l", (e) => {
    e.preventDefault()
    setTheme(theme === "dark" ? "light" : "dark")
  })

  useKeyPress("ctrl.forwardslash", () => {
    setIsAiOpen(!isAiOpen)
  })

  useKeyPress("ctrl.openbracket", () => {
    navigate(-1)
  })

  useKeyPress("ctrl.closebracket", () => {
    navigate(1)
  })

  return null
}
