"use client"

import { useEffect, useState } from "react"

import { DevToolsToolbar } from "./dev-tools-toolbar"
import { ClipboardPanel } from "./clipboard-panel"
import { PerformancePanel } from "./performance-panel"

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

  if (process.env.NODE_ENV === "production") return null

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
  const calculateFPS = () => {
    let lastTime = performance.now()
    let frameCount = 0

    const measureFPS = (currentTime: number) => {
      frameCount++

      if (currentTime - lastTime >= 1000) {
        setFps(Math.round((frameCount * 1000) / (currentTime - lastTime)))
        frameCount = 0
        lastTime = currentTime
      }

      requestAnimationFrame(measureFPS)
    }

    requestAnimationFrame(measureFPS)
  }

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

  // Update node count, FPS, and memory usage
  useEffect(() => {
    countNodes()
    calculateFPS()
    monitorMemoryUsage()
    // Update metrics periodically
    const interval = setInterval(() => {
      countNodes()
      monitorMemoryUsage()
    }, 1000)
    return () => clearInterval(interval)
  }, [])

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

  return (
    <>
      <DevToolsToolbar
        isClipboardVisible={isClipboardVisible}
        isPerformanceVisible={isPerformanceVisible}
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
