"use client"

import { useKeyPress } from "ahooks"
import { useTheme } from "next-themes"
import { useNavigate } from "react-router-dom"
import { useToast } from "@/components/ui/use-toast"
import { useSpaceAppStore } from "@/apps/web-app/[database]/store"

/**
 * global shortcuts, register here
 * @returns
 */
export function ShortCuts() {
  const { setTheme, theme } = useTheme()
  const { isRightPanelOpen: isAiOpen, setIsRightPanelOpen: setIsAiOpen } =
    useSpaceAppStore()
  const navigate = useNavigate()
  const { toast } = useToast()

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

  useKeyPress(["ctrl.comma", "meta.comma"], () => {
    navigate("/settings")
  })

  // Add new shortcut for copying current URL
  useKeyPress(["shift.ctrl.c", "shift.meta.c"], (e) => {
    e.preventDefault()
    navigator.clipboard.writeText(window.location.href).then(() => {
      toast({
        description: "链接已复制到剪贴板",
        duration: 2000,
      })
    })
  })

  return null
}
