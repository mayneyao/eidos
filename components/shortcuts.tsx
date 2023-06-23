"use client"

import { useKeyPress } from "ahooks"
import { useTheme } from "next-themes"

import { useSpaceAppStore } from "@/app/[database]/store"

/**
 * global shortcuts, register here
 * @returns
 */
export function ShortCuts() {
  const { setTheme, theme } = useTheme()
  const { isAiOpen, setIsAiOpen } = useSpaceAppStore()

  useKeyPress("shift.ctrl.l", (e) => {
    e.preventDefault()
    setTheme(theme === "dark" ? "light" : "dark")
  })

  useKeyPress("ctrl.forwardslash", () => {
    setIsAiOpen(!isAiOpen)
    // textInputRef.current?.focus()
  })

  return <div></div>
}
