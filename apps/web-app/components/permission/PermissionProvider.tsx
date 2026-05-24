"use client"

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
} from "react"

import { useAIConfigStore } from "@/components/settings/stores"

export interface PermissionRequest {
  toolCallId: string
  toolName: string
  args: any
}

export interface PermissionContextType {
  permissionRequests: PermissionRequest[]
  sendDecision: (
    toolCallId: string,
    approved: boolean,
    rememberInSession: boolean,
    reason?: string
  ) => void
}

const PermissionContext = createContext<PermissionContextType | null>(null)

export function usePermissionContext(): PermissionContextType {
  const ctx = useContext(PermissionContext)
  if (!ctx) {
    return {
      permissionRequests: [],
      sendDecision: () => {},
    }
  }
  return ctx
}

export function PermissionProvider({
  sessionId,
  children,
}: {
  sessionId: string
  children: React.ReactNode
}) {
  const [permissionRequests, setPermissionRequests] = useState<
    PermissionRequest[]
  >([])
  const bypassEnabled = useAIConfigStore(
    (s) => s.aiConfig.agentPermissionBypass ?? false
  )
  const bypassRef = useRef(bypassEnabled)
  bypassRef.current = bypassEnabled
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sessionIdRef = useRef(sessionId)
  const cacheKeyByCallId = useRef<Map<string, string>>(new Map())
  sessionIdRef.current = sessionId

  // Sync bypass config changes to PermissionServer via WebSocket
  useEffect(() => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({ type: "set-permission-mode", bypass: bypassEnabled })
      )
    }
  }, [bypassEnabled])

  const sendDecision = useCallback(
    (
      toolCallId: string,
      approved: boolean,
      rememberInSession: boolean,
      reason?: string
    ) => {
      setPermissionRequests((prev) =>
        prev.filter((r) => r.toolCallId !== toolCallId)
      )

      const ws = wsRef.current
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "decision",
            toolCallId,
            approved,
            rememberInSession,
            reason,
          })
        )
      }

      // Persist session-level permissions to meta.json
      if (rememberInSession) {
        const cacheKey = cacheKeyByCallId.current.get(toolCallId)
        if (cacheKey) {
          fetch(`/api/agent/sessions/${sessionIdRef.current}/permission`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ toolName: cacheKey, allowed: approved }),
          }).catch((err) => console.error("[permission] persist error:", err))
        }
      }
    },
    []
  )

  useEffect(() => {
    if (!sessionId) return
    let cancelled = false

    const connect = async () => {
      try {
        const res = await fetch("/api/permission-server-port")
        const data = await res.json()
        const port = data.port
        if (!port || cancelled) return

        const ws = new WebSocket(
          `ws://localhost:${port}/approval?sessionId=${sessionId}`
        )
        wsRef.current = ws

        ws.onopen = () => {
          setPermissionRequests([])

          // Sync bypass permission mode from AI config
          if (bypassRef.current) {
            ws.send(
              JSON.stringify({ type: "set-permission-mode", bypass: true })
            )
          }

          // Sync saved session permissions to PermissionServer
          fetch(`/api/agent/sessions/${sessionId}/permissions`)
            .then((r) => r.json())
            .then((data) => {
              const perms = data.permissions as Record<string, boolean>
              if (
                Object.keys(perms).length > 0 &&
                ws.readyState === WebSocket.OPEN
              ) {
                ws.send(
                  JSON.stringify({
                    type: "set-permissions",
                    permissions: perms,
                  })
                )
              }
            })
            .catch(() => {})
        }

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data)
            if (msg.type === "permission-request") {
              // Track cacheKey for persistence
              cacheKeyByCallId.current.set(msg.toolCallId, msg.cacheKey)
              setPermissionRequests((prev) => [
                ...prev.filter((r) => r.toolCallId !== msg.toolCallId),
                {
                  toolCallId: msg.toolCallId,
                  toolName: msg.toolName,
                  args: msg.args,
                },
              ])
            }
          } catch (err) {
            console.error("[permission] bad ws message:", err)
          }
        }

        ws.onclose = () => {
          wsRef.current = null
          if (!cancelled) {
            reconnectTimerRef.current = setTimeout(connect, 2000)
          }
        }

        ws.onerror = () => {
          ws.close()
        }
      } catch (err) {
        console.error("[permission] connect error:", err)
        if (!cancelled) {
          reconnectTimerRef.current = setTimeout(connect, 3000)
        }
      }
    }

    connect()

    return () => {
      cancelled = true
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
      }
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [sessionId])

  return (
    <PermissionContext.Provider value={{ permissionRequests, sendDecision }}>
      {children}
    </PermissionContext.Provider>
  )
}
