"use client"

import { useState, useCallback, useEffect } from "react"
import { Plus, X, Trash2, Terminal as TerminalIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { TerminalInstance } from "./terminal-instance"

interface TerminalSession {
  id: string
  title: string
  createdAt: number
}

interface IntegratedTerminalProps {
  isVisible: boolean
  onToggleVisibility?: () => void
  defaultHeight?: number
  spacePath?: string
}

export function IntegratedTerminal({
  isVisible,
  onToggleVisibility,
  defaultHeight = 250,
  spacePath,
}: IntegratedTerminalProps) {
  const [sessions, setSessions] = useState<TerminalSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [height, setHeight] = useState(defaultHeight)
  const [isResizing, setIsResizing] = useState(false)
  const [hasAttemptedInitialCreate, setHasAttemptedInitialCreate] =
    useState(false)

  // Create terminal function
  const createTerminal = useCallback(
    async (cwd?: string) => {
      console.log(
        "[Terminal] createTerminal called, cwd:",
        cwd,
        "spacePath:",
        spacePath
      )
      try {
        // Use provided cwd or spacePath, fallback to home directory
        const finalCwd = cwd || spacePath || undefined
        console.log("[Terminal] Creating terminal with cwd:", finalCwd)

        const result = await window.eidos?.terminal?.create({
          cwd: finalCwd,
          cols: 80,
          rows: 24,
        })

        if (result?.success && result.sessionId) {
          const newSession: TerminalSession = {
            id: result.sessionId,
            title: `Terminal ${sessions.length + 1}`,
            createdAt: Date.now(),
          }
          setSessions((prev) => [...prev, newSession])
          setActiveSessionId(result.sessionId)
        } else if (result?.error) {
          console.error("Failed to create terminal:", result.error)
          alert(`Failed to create terminal: ${result.error}`)
        }
      } catch (error) {
        console.error("Failed to create terminal:", error)
        alert(
          `Failed to create terminal: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      }
    },
    [sessions.length, spacePath]
  )

  // Create initial terminal when first shown and spacePath is available
  useEffect(() => {
    console.log(
      "[Terminal] Effect - isVisible:",
      isVisible,
      "sessions:",
      sessions.length,
      "spacePath:",
      spacePath,
      "hasAttempted:",
      hasAttemptedInitialCreate
    )

    if (!isVisible) return
    if (sessions.length > 0) return
    if (hasAttemptedInitialCreate) return

    // Mark that we've attempted to create (to prevent infinite retries)
    setHasAttemptedInitialCreate(true)

    // Only auto-create if spacePath is available
    if (spacePath) {
      console.log(
        "[Terminal] Auto-creating terminal with spacePath:",
        spacePath
      )
      createTerminal(spacePath)
    } else {
      console.log(
        "[Terminal] No spacePath available, waiting for user to manually create terminal"
      )
      // Don't auto-create - wait for user to click "New Terminal" button
      // This will use the latest spacePath at that time
    }
  }, [
    isVisible,
    spacePath,
    sessions.length,
    hasAttemptedInitialCreate,
    createTerminal,
  ])

  // Reset the attempted flag when terminal is hidden and all sessions are closed
  useEffect(() => {
    if (!isVisible && sessions.length === 0) {
      setHasAttemptedInitialCreate(false)
    }
  }, [isVisible, sessions.length])

  // Kill all sessions when component unmounts
  useEffect(() => {
    return () => {
      sessions.forEach((session) => {
        window.eidos?.terminal?.kill(session.id)
      })
    }
  }, [])

  // When terminal becomes visible, trigger a resize after a short delay
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        window.dispatchEvent(new Event("resize"))
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [isVisible])

  const closeTerminal = useCallback(
    async (sessionId: string) => {
      try {
        await window.eidos?.terminal?.kill(sessionId)
        setSessions((prev) => {
          const filtered = prev.filter((s) => s.id !== sessionId)
          // If closing active session, switch to another
          if (activeSessionId === sessionId) {
            const index = prev.findIndex((s) => s.id === sessionId)
            const nextSession =
              filtered[index] || filtered[index - 1] || filtered[0]
            setActiveSessionId(nextSession?.id || null)
          }
          return filtered
        })
      } catch (error) {
        console.error("Failed to close terminal:", error)
      }
    },
    [activeSessionId]
  )

  const closeAllTerminals = useCallback(async () => {
    for (const session of sessions) {
      await window.eidos?.terminal?.kill(session.id)
    }
    setSessions([])
    setActiveSessionId(null)
    setHasAttemptedInitialCreate(false)
  }, [sessions])

  const handleSessionExit = useCallback(
    (sessionId: string, exitCode: number) => {
      console.log(`Terminal ${sessionId} exited with code ${exitCode}`)
      setSessions((prev) => {
        const filtered = prev.filter((s) => s.id !== sessionId)
        if (activeSessionId === sessionId) {
          const nextSession = filtered[0] || null
          setActiveSessionId(nextSession?.id || null)
        }
        return filtered
      })
    },
    [activeSessionId]
  )

  const handleTitleChange = useCallback((sessionId: string, title: string) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, title } : s))
    )
  }, [])

  // Handle resize
  const handleResizeStart = useCallback(() => {
    setIsResizing(true)
  }, [])

  const handleResizeMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isResizing) return
      const newHeight = window.innerHeight - e.clientY
      if (newHeight > 100 && newHeight < window.innerHeight * 0.8) {
        setHeight(newHeight)
      }
    },
    [isResizing]
  )

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false)
  }, [])

  useEffect(() => {
    if (isResizing) {
      window.addEventListener("mousemove", handleResizeMove as any)
      window.addEventListener("mouseup", handleResizeEnd)
      return () => {
        window.removeEventListener("mousemove", handleResizeMove as any)
        window.removeEventListener("mouseup", handleResizeEnd)
      }
    }
  }, [isResizing, handleResizeMove, handleResizeEnd])

  // Handle manual create terminal button click
  const handleManualCreate = useCallback(() => {
    console.log("[Terminal] Manual create, current spacePath:", spacePath)
    // Always use latest spacePath when manually creating
    createTerminal(spacePath)
  }, [createTerminal, spacePath])

  return (
    <div
      className={cn(
        "flex flex-col border-t border-border bg-background shrink-0",
        !isVisible && "hidden"
      )}
    >
      {/* Resize Handle */}
      <div
        className="h-[2px] cursor-ns-resize bg-border hover:bg-primary/50 transition-colors"
        onMouseDown={handleResizeStart}
      />

      {/* Terminal Header */}
      <div className="flex items-center justify-between border-b border-border bg-muted/50 px-2 py-1">
        <div className="flex items-center gap-2">
          <TerminalIcon className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">
            Terminal
          </span>
          {sessions.length > 0 && (
            <Tabs
              value={activeSessionId || undefined}
              onValueChange={setActiveSessionId}
              className="ml-2"
            >
              <TabsList className="h-7 bg-transparent">
                {sessions.map((session) => (
                  <TabsTrigger
                    key={session.id}
                    value={session.id}
                    className={cn(
                      "relative h-6 px-3 py-0 text-xs data-[state=active]:bg-background",
                      activeSessionId === session.id && "font-medium"
                    )}
                  >
                    <span className="max-w-[120px] truncate">
                      {session.title}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        closeTerminal(session.id)
                      }}
                      className="ml-2 rounded-sm opacity-0 hover:bg-muted group-hover:opacity-100 hover:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleManualCreate}
            title="New Terminal (Ctrl+Shift+`)"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          {sessions.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={closeAllTerminals}
              title="Close All"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onToggleVisibility}
            title="Hide Terminal (Ctrl+`)"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Terminal Content */}
      <div
        className="relative w-full bg-background p-2"
        style={{ height: `${height}px` }}
      >
        {sessions.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <TerminalIcon className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              {spacePath ? "No active terminals" : "Loading space path..."}
            </p>
            <Button variant="outline" size="sm" onClick={handleManualCreate}>
              <Plus className="mr-2 h-4 w-4" />
              {spacePath ? "New Terminal" : "New Terminal (Home)"}
            </Button>
          </div>
        ) : (
          sessions.map((session) => (
            <TerminalInstance
              key={session.id}
              sessionId={session.id}
              isActive={session.id === activeSessionId}
              onExit={handleSessionExit}
              onTitleChange={handleTitleChange}
            />
          ))
        )}
      </div>
    </div>
  )
}
