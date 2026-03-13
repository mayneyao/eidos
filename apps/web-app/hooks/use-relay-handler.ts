import { useCallback, useEffect, useRef } from "react"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"
import { callJavaScript } from "@/apps/web-app/components/script-container/helper"
import { isDesktopMode } from "@/lib/env"
import type { IExtension, RelayHandlerMeta } from "@/packages/core/types/IExtension"
import type { SpaceInfo, RelayChannel } from "@/apps/web-app/hooks/use-current-space"

interface RelayMessage {
  id: string
  body: any
  content_type: string
  timestamp_ms: number
  attempts: number
  metadata?: any
}

export const useRelayHandler = () => {
  const { space } = useCurrentPathInfo()
  const { sqlite } = useSqlite()
  const { scriptContainerRef } = useAppRuntimeStore()
  const processingRef = useRef(false)

  const processMessages = useCallback(async (targetRelayId?: string) => {
    if (processingRef.current || !space || !isDesktopMode || !sqlite) return
    
    // 1. Get current space info to find bound handlers
    const spaceInfo: SpaceInfo | null = await window.eidos.invoke("get-current-space")
    if (!spaceInfo?.relay?.enabled) return
    
    const channels: RelayChannel[] = spaceInfo.relay.channels || []

    const relaysToProcess = targetRelayId 
      ? channels.filter((r: RelayChannel) => r.id === targetRelayId)
      : channels

    processingRef.current = true
    console.log("[RelayHandler] Starting message processing loop...")

    try {
      for (const relay of relaysToProcess) {
        if (!relay.handlerScriptId) continue
        
        console.log(`[RelayHandler] Checking messages for relay: ${relay.id}`)

        // 2. Load the script
        const script = (await sqlite.extension.get(relay.handlerScriptId)) as IExtension<RelayHandlerMeta> | undefined
        if (!script || !script.enabled) {
          console.log(`[RelayHandler] Bound script not found or disabled for relay ${relay.id}:`, relay.handlerScriptId)
          continue
        }

        while (true) {
          // Check if we should stop processing (e.g., component unmounted)
          if (!processingRef.current) {
            console.log(`[RelayHandler] Processing stopped for ${relay.id}`)
            break
          }

          // 3. Get messages for this specific relay from inbox.sqlite3
          const messages: RelayMessage[] = await window.eidos.invoke("get-relay-messages", space, { channelId: relay.id })
          if (!messages || messages.length === 0) {
            break
          }

          console.log(`[RelayHandler] Processing batch of ${messages.length} messages for ${relay.id}...`)

          // 4. Create the batch object
          const ackedIds: string[] = []
          const retryIds: string[] = []

          const batch = {
            __isRelayBatch: true,
            relay: {
              id: relay.id,
            },
            messages: messages.map((msg) => ({
              id: msg.id,
              body: msg.body,
              timestamp: msg.timestamp_ms,
              metadata: msg.metadata,
            })),
          }

          // 5. Invoke script
          const funcName = script.meta?.funcName || "default"

          try {
            await callJavaScript(
              {
                input: batch, // Standard input is the batch
                code: script.code,
                id: script.id,
                context: {
                  env: {}, // Add bindings here if needed
                },
                command: funcName,
                space: space,
              },
              scriptContainerRef,
              (event) => {
                const { type, id } = event.data
                if (type === "RelayMessageAck") ackedIds.push(id)
                if (type === "RelayMessageRetry") retryIds.push(id)
              }
            )

            // Implicit ACK
            const implicitlyAcked = messages
              .filter(m => !retryIds.includes(m.id))
              .map(m => m.id)
            
            const finalAcked = Array.from(new Set([...ackedIds, ...implicitlyAcked]))

            // 6. Update inbox.sqlite3 via IPC
            await window.eidos.invoke("ack-relay-messages", space, {
              acked: finalAcked,
              retry: retryIds,
            })

            await new Promise((r: any) => setTimeout(r, 100))
          } catch (scriptError) {
            console.error(`[RelayHandler] Script execution failed for relay ${relay.id}:`, scriptError)
            const remainingToRetry = messages
              .filter(m => !ackedIds.includes(m.id))
              .map(m => m.id)
            
            await window.eidos.invoke("ack-relay-messages", space, {
              acked: ackedIds,
              retry: remainingToRetry,
            })

            console.log("[RelayHandler] Cooling down after script error...")
            await new Promise((r: any) => setTimeout(r, 5000))
            break 
          }
        }
      }
    } catch (e) {
      console.error("[RelayHandler] Error in processing loop:", e)
    } finally {
      processingRef.current = false
    }
  }, [space, sqlite, scriptContainerRef])

  useEffect(() => {
    if (!isDesktopMode || !window.eidos) return

    const handler = (event: any, data?: any) => {
      // Electron IPC: data is passed as the second argument
      const actualData = data || event
      const relayId = actualData?.relayId
      console.log(`[RelayHandler] Received relay-messages-ready for relayId: ${relayId}`)
      processMessages(relayId)
    }

    const listenerId = window.eidos.on("relay-messages-ready", handler)
    
    // Also check on mount
    processMessages()

    return () => {
      if (listenerId) {
        window.eidos.off("relay-messages-ready", listenerId)
      }
    }
  }, [processMessages])
}
