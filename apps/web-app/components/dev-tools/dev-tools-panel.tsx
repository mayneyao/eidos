"use client"

import { useEffect, useState } from "react"

import { DevToolsToolbar } from "./dev-tools-toolbar"
import { ClipboardPanel } from "./clipboard-panel"
import { PerformancePanel } from "./performance-panel"
import { useDevToolsStore } from "./store"
import { useTabStore } from "@/apps/web-app/store/tabs"
import { useWebviewStore } from "@/apps/web-app/store/webview-store"

export function DevToolsPanel() {
  const [isClipboardVisible, setIsClipboardVisible] = useState(false)
  const [isPerformanceVisible, setIsPerformanceVisible] = useState(false)
  const [nodeCount, setNodeCount] = useState(0)
  const [fps, setFps] = useState(0)
  const [memoryUsage, setMemoryUsage] = useState<{
    used: number
    total: number
    limit: number
    percentage: number
  }>({ used: 0, total: 0, limit: 0, percentage: 0 })

  const { enabled } = useDevToolsStore()

  const activeTabId = useTabStore((s) => {
    const activePanel = s.panels.find((p) => p.id === s.activePanelId)
    return activePanel?.activeTabId || null
  })

  const activeTabUrl = useTabStore(
    (s) => s.tabs.find((t) => t.id === activeTabId)?.url
  )

  const webviewDisplayUrl = useWebviewStore(
    (s) => s.states[activeTabId || ""]?.displayUrl
  )

  const currentUrl = webviewDisplayUrl || activeTabUrl

  const toggleClipboard = () => {
    setIsClipboardVisible(!isClipboardVisible)
  }

  const togglePerformance = () => {
    setIsPerformanceVisible(!isPerformanceVisible)
  }

  // Count HTML nodes
  const countNodes = () => {
    if (typeof document !== "undefined") {
      const count = document.querySelectorAll("*").length
      setNodeCount(count)
    }
  }

  // Calculate FPS
  useEffect(() => {
    if (!enabled) return

    let lastTime = performance.now()
    let frameCount = 0
    let rafId: number

    const measureFPS = (currentTime: number) => {
      frameCount++

      if (currentTime - lastTime >= 1000) {
        setFps(Math.round((frameCount * 1000) / (currentTime - lastTime)))
        frameCount = 0
        lastTime = currentTime
      }

      rafId = requestAnimationFrame(measureFPS)
    }

    rafId = requestAnimationFrame(measureFPS)
    return () => cancelAnimationFrame(rafId)
  }, [enabled])

  // Monitor memory usage
  const monitorMemoryUsage = () => {
    if ("memory" in performance) {
      const memory = (performance as any).memory
      const used = Math.round(memory.usedJSHeapSize / 1024 / 1024) // MB
      const total = Math.round(memory.totalJSHeapSize / 1024 / 1024) // MB
      const limit = Math.round(memory.jsHeapSizeLimit / 1024 / 1024) // MB
      const percentage = Math.round((used / limit) * 100)

      setMemoryUsage({ used, total, limit, percentage })
    }
  }

  // Update node count and memory usage periodically
  useEffect(() => {
    if (!enabled) return
    countNodes()
    monitorMemoryUsage()
    const interval = setInterval(() => {
      countNodes()
      monitorMemoryUsage()
    }, 1000)
    return () => clearInterval(interval)
  }, [enabled])

  const copyDebugInfo = () => {
    const debugInfo = {
      userAgent: navigator.userAgent,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      timestamp: new Date().toISOString(),
      performance: {
        nodeCount,
        fps,
        memoryUsage,
      },
    }
    navigator.clipboard.writeText(JSON.stringify(debugInfo, null, 2))
  }

  if (!enabled) return null

  return (
    <>
      <DevToolsToolbar
        isClipboardVisible={isClipboardVisible}
        isPerformanceVisible={isPerformanceVisible}
        currentUrl={currentUrl}
        onToggleClipboard={toggleClipboard}
        onTogglePerformance={togglePerformance}
        onCopyDebugInfo={copyDebugInfo}
      />

      <ClipboardPanel
        isVisible={isClipboardVisible}
        onClose={toggleClipboard}
      />

      <PerformancePanel
        isVisible={isPerformanceVisible}
        onClose={togglePerformance}
        nodeCount={nodeCount}
        fps={fps}
        memoryUsage={memoryUsage}
      />
    </>
  )
}
