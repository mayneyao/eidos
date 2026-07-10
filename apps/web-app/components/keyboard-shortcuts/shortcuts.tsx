"use client"

import { useCallback, useEffect, useMemo } from "react"
import { useKeyPress } from "ahooks"
import { useTranslation } from "react-i18next"

import { getDate, getToday, isDayPageId } from "@/lib/utils"
import { useToast } from "@/components/ui/use-toast"
import { useTheme } from "@/components/theme-provider"
import { useBlockTabClick } from "@/apps/web-app/hooks/use-block-tab-click"
import {
  filePathFromSpaceUrl,
  toSpaceFileUrl,
  uniqueSpaceEntryName,
} from "@/apps/web-app/components/file-space/file-path"
import { flushCurrentSpaceFile } from "@/apps/web-app/components/file-space/file-navigation"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useCurrentSpace } from "@/apps/web-app/hooks/use-current-space"
import { useMblocksBatch } from "@/apps/web-app/hooks/use-mblocks-batch"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { useSpaceFiles } from "@/apps/web-app/hooks/use-space-files"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { DEFAULT_TABS, useTabsKV } from "@/apps/web-app/hooks/use-tabs-kv"
import { useSpaceAppStore } from "@/apps/web-app/pages/[database]/store"
import { useAppStore } from "@/apps/web-app/store/app-store"
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"
import { useSidebarStore } from "@/apps/web-app/store/sidebar-store"
import { useTabStore } from "@/apps/web-app/store/tabs"
import { shouldEnableLegacySpaceRuntime } from "@/apps/web-app/space-runtime-policy"

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
  const { setTheme, resolvedTheme } = useTheme()
  const {
    setCmdkOpen,
    isGlobalSearchOpen,
    setGlobalSearchOpen,
    isTerminalVisible,
    setIsTerminalVisible,
  } = useAppRuntimeStore()
  const { isSidebarOpen, setSidebarOpen } = useAppStore()
  const { setCurrentApp } = useSidebarStore()
  const { currentSpace } = useCurrentSpace()
  const isFileSpace = currentSpace?.mode === "file"
  const legacyRuntimeEnabled = shouldEnableLegacySpaceRuntime(
    currentSpace?.mode
  )
  const { tabs: sortedTabs } = useTabsKV(legacyRuntimeEnabled)
  const { openTab } = useTabStore()
  const { location, navigate, params } = useRouterAdapter()
  const { toast } = useToast()
  const { createDoc, createLink } = useSqlite()
  const { createText, list } = useSpaceFiles(currentSpace?.id)
  const { day } = params
  const { space } = useCurrentPathInfo()

  // Get block data for directive checking
  const blockIds = useMemo(
    () => sortedTabs.filter((id) => !DEFAULT_TABS.includes(id)),
    [sortedTabs]
  )
  const { blocks } = useMblocksBatch(blockIds, legacyRuntimeEnabled)
  const handleBlockTabClick = useBlockTabClick(blocks)

  const createNewDocument = useCallback(async () => {
    if (!space) return
    if (isFileSpace) {
      try {
        const currentFilePath = filePathFromSpaceUrl(
          location.pathname + location.search + location.hash
        )
        if (!(await flushCurrentSpaceFile(currentSpace?.id, currentFilePath))) {
          throw new Error(
            "Eidos could not save the current file. Resolve the error before opening another file."
          )
        }
        const entries = await list("")
        const filename = uniqueSpaceEntryName(
          entries.map((entry) => entry.name),
          "Untitled",
          ".md"
        )
        await createText(filename)
        navigate(toSpaceFileUrl(filename))
      } catch (error) {
        toast({
          title: "Unable to create note",
          description: error instanceof Error ? error.message : String(error),
          variant: "destructive",
        })
      }
      return
    }
    const docId = await createDoc("")
    if (docId) navigate(`/${docId}`)
  }, [
    createDoc,
    createText,
    currentSpace?.id,
    isFileSpace,
    list,
    location.hash,
    location.pathname,
    location.search,
    navigate,
    space,
    toast,
  ])

  const navigateHistorySafely = useCallback(
    async (delta: number) => {
      const currentFilePath = filePathFromSpaceUrl(
        location.pathname + location.search + location.hash
      )
      if (!(await flushCurrentSpaceFile(currentSpace?.id, currentFilePath))) {
        toast({
          title: "Unable to leave this file",
          description:
            "Eidos could not save the current file. Resolve the error and try again.",
          variant: "destructive",
        })
        return
      }
      navigate(delta)
    },
    [
      currentSpace?.id,
      location.hash,
      location.pathname,
      location.search,
      navigate,
      toast,
    ]
  )

  // Helper function to check if current active tab is a webview (external URL)
  const checkIsWebviewTab = () => {
    const activeTabId = useTabStore.getState().getActiveTabId()
    if (!activeTabId) return false
    const activeTab = useTabStore
      .getState()
      .tabs.find((t) => t.id === activeTabId)
    // Check if URL is external (http/https)
    return activeTab?.url && /^https?:\/\//i.test(activeTab.url)
  }

  // Listen for global shortcut events from main process
  useEffect(() => {
    const handleGlobalShortcut = async (action: ShortcutAction) => {
      switch (action.id) {
        case "navigate-today":
          if (isFileSpace) break
          const date = getToday()
          navigate(`/journals/${date}`)
          break

        case "create-new-doc":
          await createNewDocument()
          break

        case "toggle-theme":
          setTheme(resolvedTheme === "dark" ? "light" : "dark")
          break

        case "toggle-sidebar":
          setSidebarOpen(!isSidebarOpen)
          break

        case "open-agent":
          if (isFileSpace) break
          navigate("/agent")
          break

        case "navigate-back":
          if (isDayPageId(day)) {
            // Navigate to previous day
            const newDay = getDate(-1, day)
            navigate(`/journals/${newDay}`)
          } else {
            // Normal browser back navigation
            await navigateHistorySafely(-1)
          }
          break

        case "navigate-forward":
          if (isDayPageId(day)) {
            // Navigate to next day
            const newDay = getDate(1, day)
            navigate(`/journals/${newDay}`)
          } else {
            // Normal browser forward navigation
            await navigateHistorySafely(1)
          }
          break

        case "navigate-previous-day":
          if (isFileSpace) break
          // Force navigate to previous day
          const prevDay = getDate(-1, day || getToday())
          navigate(`/journals/${prevDay}`)
          break

        case "navigate-next-day":
          if (isFileSpace) break
          // Force navigate to next day
          const nextDay = getDate(1, day || getToday())
          navigate(`/journals/${nextDay}`)
          break

        case "toggle-command-palette":
          setCmdkOpen(true)
          break

        case "toggle-global-search":
          setGlobalSearchOpen(!isGlobalSearchOpen)
          break

        case "focus-address-bar":
          // Dispatch custom event to focus webview address bar
          // Components will check if current tab is active
          window.dispatchEvent(new CustomEvent("focus-webview-address-bar"))
          break

        case "find-in-page":
          // Dispatch custom event to toggle find in page
          // Components will check if current tab is active
          window.dispatchEvent(new CustomEvent("toggle-find-in-page"))
          break

        case "open-space-settings":
          navigate("/settings", { target: "_blank" })
          break

        case "copy-current-url":
          navigator.clipboard.writeText(window.location.href).then(() => {
            toast({
              description: t("common.linkCopied"),
              duration: 2000,
            })
          })
          break

        case "toggle-terminal":
          setIsTerminalVisible(!isTerminalVisible)
          break

        case "bookmark-current-tab": {
          if (isFileSpace) break
          const activeTabId = useTabStore.getState().getActiveTabId()
          if (!activeTabId) break
          const activeTab = useTabStore
            .getState()
            .tabs.find((t) => t.id === activeTabId)
          if (!activeTab?.url || !/^https?:\/\//i.test(activeTab.url)) break

          const bookmarkUrl = activeTab.url
          const bookmarkName = activeTab.title || bookmarkUrl

          let icon: string | undefined
          if (
            bookmarkUrl.startsWith("http://") ||
            bookmarkUrl.startsWith("https://")
          ) {
            try {
              const url = new URL(bookmarkUrl)
              icon = `https://edge-kit.eidos.space/favicon?domain=${url.hostname}&sz=64`
            } catch (e) {
              // invalid url
            }
          }

          createLink(bookmarkName, bookmarkUrl, undefined, icon)
            .then(() => {
              toast({
                title: t("node.link.bookmarked", "Bookmarked"),
                description: bookmarkName,
                duration: 2500,
              })
            })
            .catch((err: any) => {
              toast({
                title: t("common.error"),
                description: err?.message || String(err),
                variant: "destructive",
                duration: 3000,
              })
            })
          break
        }

        default:
          // Handle sidebar tab switching (switch-sidebar-tab-1 through switch-sidebar-tab-9)
          if (action.id.startsWith("switch-sidebar-tab-")) {
            if (isFileSpace) break
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
                    files: { isNavigation: false },
                    today: { isNavigation: true, href: "/journals" },
                  }[targetTabId] || {}

                if (tabConfig.isNavigation && targetTabId === "today") {
                  // Navigate to today's journal and activate tab
                  const today = getToday()
                  setCurrentApp("today")
                  navigate(`/journals/${today}`)
                } else if (DEFAULT_TABS.includes(targetTabId)) {
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
    resolvedTheme,
    space,
    day,
    navigate,
    createLink,
    createNewDocument,
    navigateHistorySafely,
    isFileSpace,
    setTheme,
    setCmdkOpen,
    toast,
    isSidebarOpen,
    setSidebarOpen,
    setCurrentApp,
    sortedTabs,
    isGlobalSearchOpen,
    setGlobalSearchOpen,
    isTerminalVisible,
    setIsTerminalVisible,
    handleBlockTabClick,
    openTab,
  ])

  // navigate to today - now handled by global shortcut (Cmd+Shift+T)
  // Cmd+T is now used for new-tab
  // useKeyPress(["ctrl.t", "meta.t"], () => {
  //   const date = getToday()
  //   navigate(`/journals/${date}`)
  // })

  // create new doc
  useKeyPress(["ctrl.n", "meta.n"], () => {
    void createNewDocument()
  })

  useKeyPress(["shift.ctrl.l", "shift.meta.l"], (e) => {
    e.preventDefault()
    setTheme(resolvedTheme === "dark" ? "light" : "dark")
  })

  useKeyPress(["ctrl.openbracket", "meta.openbracket"], (e) => {
    if (!e.shiftKey) {
      void navigateHistorySafely(-1)
    } else if (isDayPageId(day)) {
      // day
      const newDay = getDate(-1, day)
      navigate(`/journals/${newDay}`)
    }
  })

  useKeyPress(["ctrl.closebracket", "meta.closebracket"], (e) => {
    if (!e.shiftKey) {
      void navigateHistorySafely(1)
    } else if (isDayPageId(day)) {
      // day
      const newDay = getDate(1, day)
      navigate(`/journals/${newDay}`)
    }
  })

  useKeyPress(["ctrl.comma", "meta.comma"], () => {
    navigate("/settings", { target: "_blank" })
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

  // Focus address bar - only works in webview tabs
  useKeyPress(["ctrl.l", "meta.l"], (e) => {
    e.preventDefault()
    // Only focus address bar if current tab is a webview
    if (checkIsWebviewTab()) {
      // Dispatch custom event to focus webview address bar
      window.dispatchEvent(new CustomEvent("focus-webview-address-bar"))
    }
  })

  // Add shortcut for AI Agent
  useKeyPress(["ctrl.j", "meta.j"], (e) => {
    e.preventDefault()
    if (!isFileSpace) navigate("/agent")
  })

  return null
}
