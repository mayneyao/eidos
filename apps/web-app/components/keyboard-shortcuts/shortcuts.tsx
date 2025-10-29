"use client"

import { useEffect, useMemo } from "react"
import { useKeyPress } from "ahooks"
import { useTheme } from "next-themes"
import { useTranslation } from "react-i18next"
import { useNavigate, useParams } from "react-router-dom"

import { getDate, getToday, isDayPageId } from "@/lib/utils"
import { useToast } from "@/components/ui/use-toast"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useMblocksBatch } from "@/apps/web-app/hooks/use-mblocks-batch"
import { useBlockTabClick } from "@/apps/web-app/hooks/use-block-tab-click"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { useTabsKV } from "@/apps/web-app/hooks/use-tabs-kv"
import { useSpaceAppStore } from "@/apps/web-app/pages/[database]/store"
import { useAppStore } from "@/apps/web-app/store/app-store"
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"
import { useSidebarStore } from "@/apps/web-app/store/sidebar-store"

interface ShortcutAction {
  id: string
  accelerator: string
  description?: string
}

/**
 * global shortcuts, register here
 * @returns
 */

export function ShortCuts() {
  const { t } = useTranslation()
  const { setTheme, theme } = useTheme()
  const { isRightPanelOpen: isAiOpen, setIsRightPanelOpen: setIsAiOpen } =
    useSpaceAppStore()
  const { setSpaceSettingsOpen, setCmdkOpen } = useAppRuntimeStore()
  const { isSidebarOpen, setSidebarOpen } = useAppStore()
  const { setCurrentApp } = useSidebarStore()
  const { tabs: sortedTabs } = useTabsKV()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { createDoc } = useSqlite()
  const { day } = useParams()
  const { space } = useCurrentPathInfo()

  // Get block data for directive checking
  const blockIds = useMemo(
    () => sortedTabs.filter((id) => !["nodes", "extensions", "today"].includes(id)),
    [sortedTabs]
  )
  const { blocks } = useMblocksBatch(blockIds)
  const handleBlockTabClick = useBlockTabClick(blocks)

  // Listen for global shortcut events from main process
  useEffect(() => {
    const handleGlobalShortcut = async (action: ShortcutAction) => {
      switch (action.id) {
        case "navigate-today":
          const date = getToday()
          navigate(`/journals/${date}`)
          break

        case "create-new-doc":
          if (!space) return
          const docId = await createDoc("")
          navigate(`/${docId}`)
          break

        case "toggle-theme":
          setTheme(theme === "dark" ? "light" : "dark")
          break

        case "toggle-ai-panel":
          setIsAiOpen(!isAiOpen)
          break

        case "toggle-sidebar":
          setSidebarOpen(!isSidebarOpen)
          break

        case "navigate-back":
          if (isDayPageId(day)) {
            // Navigate to previous day
            const newDay = getDate(-1, day)
            navigate(`/journals/${newDay}`)
          } else {
            // Normal browser back navigation
            navigate(-1)
          }
          break

        case "navigate-forward":
          if (isDayPageId(day)) {
            // Navigate to next day
            const newDay = getDate(1, day)
            navigate(`/journals/${newDay}`)
          } else {
            // Normal browser forward navigation
            navigate(1)
          }
          break

        case "navigate-previous-day":
          // Force navigate to previous day
          const prevDay = getDate(-1, day || getToday())
          navigate(`/journals/${prevDay}`)
          break

        case "navigate-next-day":
          // Force navigate to next day
          const nextDay = getDate(1, day || getToday())
          navigate(`/journals/${nextDay}`)
          break

        case "toggle-command-palette":
          setCmdkOpen(true)
          break

        case "open-space-settings":
          setSpaceSettingsOpen(true)
          break

        case "copy-current-url":
          navigator.clipboard.writeText(window.location.href).then(() => {
            toast({
              description: t("common.linkCopied"),
              duration: 2000,
            })
          })
          break

        default:
          // Handle sidebar tab switching (switch-sidebar-tab-1 through switch-sidebar-tab-9)
          if (action.id.startsWith("switch-sidebar-tab-")) {
            const tabIndex = parseInt(action.id.split("-").pop() || "0")
            if (tabIndex >= 1 && tabIndex <= 9) {
              // Use the actual tab order from sortedTabs
              const itemIndex = tabIndex - 1 // Convert to 0-based index

              if (itemIndex >= 0 && itemIndex < sortedTabs.length) {
                const targetTabId = sortedTabs[itemIndex]

                // Handle different tab types
                const tabConfig =
                  {
                    nodes: { isNavigation: false },
                    extensions: { isNavigation: false },
                    today: { isNavigation: true, href: "/journals" },
                  }[targetTabId] || {}

                if (tabConfig.isNavigation && targetTabId === "today") {
                  // Navigate to today's journal
                  const today = getToday()
                  navigate(`/journals/${today}`)
                } else if (
                  targetTabId === "nodes" ||
                  targetTabId === "extensions"
                ) {
                  // Regular tab
                  setCurrentApp(targetTabId)
                } else {
                  // Block tab - use unified handling logic
                  handleBlockTabClick(targetTabId)
                }

                // Ensure sidebar is open when switching tabs
                if (!isSidebarOpen) {
                  setSidebarOpen(true)
                }
              } else {
                console.warn(
                  `Tab index ${tabIndex} is out of range (max: ${sortedTabs.length})`
                )
              }
            } else {
              console.warn(`Invalid tab index: ${tabIndex}`)
            }
          } else {
            console.warn(`Unknown global shortcut action: ${action.id}`)
          }
          break
      }
    }

    const handleGlobalShortcutMessage = (
      _event: any,
      action: ShortcutAction
    ) => {
      console.log("Global shortcut triggered:", action.id)
      handleGlobalShortcut(action)
    }

    let listenerId: string | undefined

    if (window.eidos) {
      listenerId = window.eidos.on(
        "global-shortcut-triggered",
        handleGlobalShortcutMessage
      )

      return () => {
        if (listenerId) {
          window.eidos?.off("global-shortcut-triggered", listenerId)
        }
      }
    }
  }, [
    t,
    theme,
    isAiOpen,
    space,
    day,
    navigate,
    createDoc,
    setTheme,
    setIsAiOpen,
    setSpaceSettingsOpen,
    setCmdkOpen,
    toast,
    isSidebarOpen,
    setSidebarOpen,
    setCurrentApp,
    sortedTabs,
  ])

  // navigate to today
  useKeyPress(["ctrl.t", "meta.t"], () => {
    const date = getToday()
    navigate(`/journals/${date}`)
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
      navigate(`/journals/${newDay}`)
    }
  })

  useKeyPress(["ctrl.closebracket", "meta.closebracket"], (e) => {
    if (!e.shiftKey) {
      navigate(1)
    } else if (isDayPageId(day)) {
      // day
      const newDay = getDate(1, day)
      navigate(`/journals/${newDay}`)
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
