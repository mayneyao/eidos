import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { useTabStore } from "@/apps/web-app/store/tabs"

import { filePathFromSpaceUrl } from "./file-path"
import { flushCurrentSpaceFile } from "./file-navigation"
import {
  FILE_SPACE_WORK_MODES,
  isFileSpaceAgentUrl,
  type FileSpaceWorkMode,
} from "./work-modes"
import { openFileSpaceAgent } from "../file-space-agent/open-agent"

export interface FileSpaceWorkModeControllerOptions {
  spaceId: string | undefined
  settingsActive: boolean
  versionAvailable: boolean
  agentAvailable: boolean
  revealSidebar: () => void
}

export function useFileSpaceWorkModes({
  spaceId,
  settingsActive,
  versionAvailable,
  agentAvailable,
  revealSidebar,
}: FileSpaceWorkModeControllerOptions) {
  const tabs = useTabStore((state) => state.tabs)
  const activeTabId = useTabStore((state) => state.getActiveTabId())
  const setActiveTab = useTabStore((state) => state.setActiveTab)
  const [activeMode, setActiveMode] = useState<FileSpaceWorkMode>("files")
  const [visitedModes, setVisitedModes] = useState<
    ReadonlySet<FileSpaceWorkMode>
  >(() => new Set(["files"]))
  const [transitionBusy, setTransitionBusy] = useState(false)
  const transitionBusyRef = useRef(false)
  const activeModeRef = useRef(activeMode)
  const lastNonAgentModeRef = useRef<FileSpaceWorkMode>("files")
  const lastNonAgentTabIdRef = useRef<string | null>(null)
  const previousSpaceIdRef = useRef<string | undefined>(spaceId)
  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId),
    [activeTabId, tabs]
  )
  const activeTabUrl = activeTab?.url
  const agentTabs = useMemo(
    () =>
      tabs
        .filter((tab) => isFileSpaceAgentUrl(tab.url))
        .sort((a, b) => b.lastAccessTime - a.lastAccessTime),
    [tabs]
  )
  activeModeRef.current = activeMode

  const rememberVisitedMode = useCallback((mode: FileSpaceWorkMode) => {
    setVisitedModes((current) => {
      if (current.has(mode)) return current
      return new Set([...current, mode])
    })
  }, [])

  useEffect(() => {
    if (previousSpaceIdRef.current === spaceId) return
    previousSpaceIdRef.current = spaceId
    lastNonAgentModeRef.current = "files"
    lastNonAgentTabIdRef.current = null
    setActiveMode("files")
    setVisitedModes(new Set(["files"]))
  }, [spaceId])

  useEffect(() => {
    if (!activeTabId || !activeTabUrl) return
    const currentMode = activeModeRef.current
    if (isFileSpaceAgentUrl(activeTabUrl)) {
      if (currentMode !== "agent") {
        lastNonAgentModeRef.current = currentMode
        rememberVisitedMode("agent")
        setActiveMode("agent")
      }
      return
    }
    lastNonAgentTabIdRef.current = activeTabId
    if (currentMode === "agent") {
      const returnMode = lastNonAgentModeRef.current
      rememberVisitedMode(returnMode)
      setActiveMode(returnMode)
    }
  }, [activeTabId, activeTabUrl, rememberVisitedMode])

  const modeAvailable = useCallback(
    (mode: FileSpaceWorkMode) =>
      mode === "files" ||
      (mode === "version" && versionAvailable) ||
      (mode === "agent" && agentAvailable),
    [agentAvailable, versionAvailable]
  )

  const flushActiveFileForModeChange = useCallback(
    async (destination: FileSpaceWorkMode) => {
      const filePath = activeTab ? filePathFromSpaceUrl(activeTab.url) : null
      const saved = await flushCurrentSpaceFile(spaceId, filePath)
      if (!saved) {
        window.alert(
          `Eidos could not save the current file. Resolve the error before opening ${
            destination === "version"
              ? "Version"
              : destination === "agent"
                ? "Agent"
                : "Files"
          }.`
        )
      }
      return saved
    },
    [activeTab, spaceId]
  )

  const restoreNonAgentTab = useCallback(() => {
    const rememberedTab = tabs.find(
      (tab) =>
        tab.id === lastNonAgentTabIdRef.current && !isFileSpaceAgentUrl(tab.url)
    )
    const fallbackTab = [...tabs]
      .filter((tab) => !isFileSpaceAgentUrl(tab.url))
      .sort((a, b) => b.lastAccessTime - a.lastAccessTime)[0]
    const target = rememberedTab ?? fallbackTab
    if (target) setActiveTab(target.id)
  }, [setActiveTab, tabs])

  const activateWorkMode = useCallback(
    async (mode: FileSpaceWorkMode, shouldRevealSidebar = false) => {
      if (transitionBusyRef.current || !modeAvailable(mode) || settingsActive) {
        return false
      }
      if (mode === activeMode) {
        if (shouldRevealSidebar) revealSidebar()
        return true
      }

      transitionBusyRef.current = true
      setTransitionBusy(true)
      try {
        if (mode === "agent") {
          if (activeTab && !isFileSpaceAgentUrl(activeTab.url)) {
            lastNonAgentTabIdRef.current = activeTab.id
            lastNonAgentModeRef.current = activeMode
          }
          const existingAgentTab = agentTabs[0]
          if (existingAgentTab) {
            if (!(await flushActiveFileForModeChange(mode))) return false
            setActiveTab(existingAgentTab.id)
          } else {
            const conversationId = await openFileSpaceAgent({ spaceId })
            if (!conversationId) return false
          }
        } else {
          if (!(await flushActiveFileForModeChange(mode))) return false
          if (activeMode === "agent") restoreNonAgentTab()
          lastNonAgentModeRef.current = mode
        }

        rememberVisitedMode(mode)
        setActiveMode(mode)
        if (shouldRevealSidebar) revealSidebar()
        return true
      } finally {
        transitionBusyRef.current = false
        setTransitionBusy(false)
      }
    },
    [
      activeMode,
      activeTab,
      agentTabs,
      flushActiveFileForModeChange,
      modeAvailable,
      rememberVisitedMode,
      restoreNonAgentTab,
      revealSidebar,
      setActiveTab,
      settingsActive,
      spaceId,
    ]
  )

  const activateAgentConversation = useCallback(
    async (tabId: string) => {
      if (transitionBusyRef.current || settingsActive) return
      const target = tabs.find(
        (tab) => tab.id === tabId && isFileSpaceAgentUrl(tab.url)
      )
      if (!target) return
      if (target.id === activeTabId) {
        rememberVisitedMode("agent")
        setActiveMode("agent")
        return
      }

      transitionBusyRef.current = true
      setTransitionBusy(true)
      try {
        if (activeTab && !isFileSpaceAgentUrl(activeTab.url)) {
          lastNonAgentTabIdRef.current = activeTab.id
          lastNonAgentModeRef.current = activeMode
        }
        if (!(await flushActiveFileForModeChange("agent"))) return
        setActiveTab(target.id)
        rememberVisitedMode("agent")
        setActiveMode("agent")
      } finally {
        transitionBusyRef.current = false
        setTransitionBusy(false)
      }
    },
    [
      activeMode,
      activeTab,
      activeTabId,
      flushActiveFileForModeChange,
      rememberVisitedMode,
      setActiveTab,
      settingsActive,
      tabs,
    ]
  )

  const startAgentConversation = useCallback(async () => {
    if (transitionBusyRef.current || !agentAvailable || settingsActive) return
    transitionBusyRef.current = true
    setTransitionBusy(true)
    try {
      if (activeTab && !isFileSpaceAgentUrl(activeTab.url)) {
        lastNonAgentTabIdRef.current = activeTab.id
        lastNonAgentModeRef.current = activeMode
      }
      const conversationId = await openFileSpaceAgent({ spaceId })
      if (!conversationId) return
      rememberVisitedMode("agent")
      setActiveMode("agent")
    } finally {
      transitionBusyRef.current = false
      setTransitionBusy(false)
    }
  }, [
    activeMode,
    activeTab,
    agentAvailable,
    rememberVisitedMode,
    settingsActive,
    spaceId,
  ])

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (
        settingsActive ||
        event.defaultPrevented ||
        (!event.metaKey && !event.ctrlKey) ||
        event.altKey ||
        event.shiftKey
      ) {
        return
      }
      const descriptor = FILE_SPACE_WORK_MODES.find(
        ({ shortcut }) => String(shortcut) === event.key
      )
      if (!descriptor || !modeAvailable(descriptor.id)) return
      event.preventDefault()
      // File Space owns Cmd/Ctrl+1–3 while its shell is mounted. Capture the
      // shortcut before the legacy sidebar-tab listener can consume it.
      event.stopImmediatePropagation()
      void activateWorkMode(descriptor.id, true)
    }
    document.addEventListener("keydown", handleShortcut, true)
    return () => document.removeEventListener("keydown", handleShortcut, true)
  }, [activateWorkMode, modeAvailable, settingsActive])

  return {
    activeMode,
    visitedModes,
    transitionBusy,
    agentTabs,
    modeAvailable,
    activateWorkMode,
    activateAgentConversation,
    startAgentConversation,
  }
}
