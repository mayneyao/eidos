"use client"

import { useKeyPress } from "ahooks"
import { useTheme } from "next-themes"
import { useNavigate, useParams } from "react-router-dom"
import { useTranslation } from "react-i18next"

import { getDate, getToday, isDayPageId } from "@/lib/utils"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { useToast } from "@/components/ui/use-toast"
import { useSpaceAppStore } from "@/apps/web-app/pages/[database]/store"
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"

/**
 * global shortcuts, register here
 * @returns
 */
export function ShortCuts() {
  const { t } = useTranslation()
  const { setTheme, theme } = useTheme()
  const { isRightPanelOpen: isAiOpen, setIsRightPanelOpen: setIsAiOpen } =
    useSpaceAppStore()
  const { setSpaceSettingsOpen } = useAppRuntimeStore()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { createDoc } = useSqlite()
  const { day } = useParams()
  const { space } = useCurrentPathInfo()

  // navigate to today
  useKeyPress(["ctrl.t", "meta.t"], () => {
    const date = getToday()
    navigate(`/everyday/${date}`)
  })

  // create new doc
  useKeyPress(["ctrl.n", "meta.n"], () => {
    const createNewDoc = async () => {
      if (!space) return
      const docId = await createDoc("")
      navigate(`/${docId}`)
    }
    createNewDoc()
  })

  useKeyPress(["shift.ctrl.l", "shift.meta.l"], (e) => {
    e.preventDefault()
    setTheme(theme === "dark" ? "light" : "dark")
  })

  useKeyPress(["ctrl.forwardslash", "meta.forwardslash"], () => {
    setIsAiOpen(!isAiOpen)
  })

  useKeyPress(["ctrl.openbracket", "meta.openbracket"], (e) => {
    if (!e.shiftKey) {
      navigate(-1)
    } else if (isDayPageId(day)) {
      // day
      const newDay = getDate(-1, day)
      navigate(`/everyday/${newDay}`)
    }
  })

  useKeyPress(["ctrl.closebracket", "meta.closebracket"], (e) => {
    if (!e.shiftKey) {
      navigate(1)
    } else if (isDayPageId(day)) {
      // day
      const newDay = getDate(1, day)
      navigate(`/everyday/${newDay}`)
    }
  })

  useKeyPress(["ctrl.comma", "meta.comma"], () => {
    setSpaceSettingsOpen(true)
  })

  // Add new shortcut for copying current URL
  useKeyPress(["shift.ctrl.c", "shift.meta.c"], (e) => {
    e.preventDefault()
    navigator.clipboard.writeText(window.location.href).then(() => {
      toast({
        description: t("common.linkCopied"),
        duration: 2000,
      })
    })
  })

  return null
}
