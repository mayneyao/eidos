import React, { lazy, Suspense, useCallback } from "react"

// lazy import markdown
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"
import { useToast } from "@/components/ui/use-toast"
import {
  EidosDataEventChannelName,
  EidosMessageChannelName,
  MsgType,
  WORKER_INIT_MESSAGES,
  WORKER_MESSAGE_TYPES,
} from "@/lib/const"
import { ToastAction } from "@/components/ui/toast"
import { buttonVariants } from "@/components/ui/button"
import { getEmbeddingWorker } from "@/lib/embedding/worker"
import { isDesktopMode, isInkServiceMode } from "@/lib/env"
import { getWorker } from "@/packages/core/sqlite/worker"

import { useSqliteStore } from "@/apps/web-app/store/sqlite-store"
import { useThemeStore } from "@/apps/web-app/store/theme-store"
import { useRouterAdapter } from "./use-router-adapter"
import {
  _convertEmail2State,
  _convertHtml2State,
  _markdown2lexical,
  _lexical2markdown,
} from "./use-doc-editor"
import { useCurrentUser } from "./user-current-user"

const Markdown = lazy(
  () => import("@/components/remix-chat/components/markdown")
)

export const useWorker = () => {
  const { setInitialized, isInitialized } = useSqliteStore()
  const { navigate } = useRouterAdapter()
  const { id: userId } = useCurrentUser()
  const {
    setWebsocketConnected,
    setBlockUIMsg,
    setBlockUIData,
    setEmbeddingModeLoaded,
  } = useAppRuntimeStore()
  const {
    setCurrentThemeName,
    listThemes,
    setCustomTheme,
    getCustomTheme,
    applyTheme,
  } = useThemeStore()

  const { toast, dismiss } = useToast()
  const initWorker = useCallback(() => {
    if (isInkServiceMode) {
      setInitialized(true)
      return () => {}
    }
    const handle = async (event: MessageEvent) => {
      if (event.data === WORKER_INIT_MESSAGES.INIT) {
        setInitialized(true)
      } else if (event.data === WORKER_INIT_MESSAGES.INIT_FAILED) {
        console.error("Worker initialization failed")
        setInitialized(true)
      } else if (event.data === WORKER_INIT_MESSAGES.INIT_TIMEOUT) {
        console.error("Worker initialization timeout")
        setInitialized(true)
      }
      const { type, data } = event.data
      let res = null
      switch (type) {
        case MsgType.WebSocketConnected:
          setWebsocketConnected(true)
          break
        case MsgType.WebSocketDisconnected:
          setWebsocketConnected(false)
          break
        case MsgType.Notify: {
          const { title, description, actions } = data
          const toastOptions: any = {
            title: title,
            description: React.createElement(
              Suspense,
              {
                fallback: React.createElement("div", null, "Loading..."),
              },
              React.createElement(Markdown, { children: description })
            ),
            className: "flex-col items-start gap-4",
          }

          if (actions && actions.length > 0) {
            toastOptions.action = React.createElement(
              "div",
              { className: "flex gap-2 shrink-0 justify-end w-full" },
              actions.map((action: any, index: number) =>
                React.createElement(
                  ToastAction,
                  {
                    key: index,
                    altText: action.label,
                    className: buttonVariants({
                      variant:
                        action.variant === "primary" ? "default" : "outline",
                      size: "sm",
                    }),
                    onClick: () => {
                      if (action.action === "reload") {
                        window.location.reload()
                      }
                      dismiss()
                    },
                  },
                  action.label
                )
              )
            )
          }

          toast(toastOptions)
          break
        }
        case MsgType.Navigate:
          // data is { path: string, target?: "_blank" | "_self" }
          navigate(data.path, { target: data.target })
          break
        case MsgType.BlockUIMsg:
          setBlockUIMsg(data.msg)
          setBlockUIData(data.data)
          break
        case MsgType.Error:
          toast({
            title: "Error",
            description: data.message,
            duration: 5000,
          })
          break
        case MsgType.GetDocMarkdown:
          res = await _lexical2markdown(data)
          break
        case MsgType.ConvertMarkdown2State:
          res = await _markdown2lexical(data)
          break
        case MsgType.ConvertHtml2State:
          res = await _convertHtml2State(data)
          break
        case MsgType.ConvertEmail2State:
          res = await _convertEmail2State(data.email, data.space, userId)
          break
        case MsgType.GetTheme:
          res = getCustomTheme(data)
          break
        case MsgType.SetTheme:
          res = setCustomTheme(data.name, data.css)
          break
        case MsgType.ListThemes:
          res = listThemes()
          break
        case MsgType.SetCurrentTheme:
          res = setCurrentThemeName(data)
          break
        case MsgType.ApplyTheme:
          res = applyTheme(data.name, data.css)
          break
        default:
          break
      }
      event?.ports[0]?.postMessage(res)
      return res
    }

    const requestHandler = async (event: any, requestId: string, arg: any) => {
      // console.log('request-from-main', requestId, arg)
      const result = await handle(new MessageEvent("message", { data: arg }))
      // console.log('response-from-main', requestId, result)
      window.eidos.send(`response-${requestId}`, result)
    }
    let listenerId: string | undefined
    let listenerId2: string | undefined
    let listenerId3: string | undefined
    // BroadcastChannel for forwarding data update events (for cross-component reactive updates)
    const dataEventBc = isDesktopMode
      ? new BroadcastChannel(EidosDataEventChannelName)
      : null

    if (isDesktopMode) {
      listenerId = window.eidos.on("request-from-main", requestHandler)
      listenerId2 = window.eidos.on(
        EidosMessageChannelName,
        async (event: any, arg: any) => {
          await handle(new MessageEvent("message", { data: arg }))
        }
      ) as unknown as string
      // Listen for data update events from worker (via EidosDataEventChannelName)
      listenerId3 = window.eidos.on(
        EidosDataEventChannelName,
        async (event: any, arg: any) => {
          // Forward data update events to BroadcastChannel for reactive updates across components
          if (dataEventBc && arg) {
            dataEventBc.postMessage(arg)
          }
        }
      ) as unknown as string
      setInitialized(true)
    } else {
      const worker = getWorker()
      worker.addEventListener("message", handle)
      worker.postMessage({
        type: WORKER_MESSAGE_TYPES.IS_WORKER_INITIALIZED,
      })
    }
    return () => {
      if (isDesktopMode) {
        if (listenerId) {
          window.eidos.off("request-from-main", listenerId)
        }
        if (listenerId2) {
          window.eidos.off(EidosMessageChannelName, listenerId2)
        }
        if (listenerId3) {
          window.eidos.off(EidosDataEventChannelName, listenerId3)
        }
        if (dataEventBc) {
          dataEventBc.close()
        }
      } else {
        const worker = getWorker()
        worker.removeEventListener("message", handle)
      }
    }
  }, [
    setBlockUIData,
    setBlockUIMsg,
    setInitialized,
    setWebsocketConnected,
    toast,
    userId,
  ])

  const initEmbeddingWorker = useCallback(() => {
    const worker = getEmbeddingWorker()
    const handler = async (event: MessageEvent) => {
      if (event.data.status === "ready") {
        console.log("embedding worker is ready")
        setEmbeddingModeLoaded(true)
      }
    }
    worker.addEventListener("message", handler)
    return () => worker.removeEventListener("message", handler)
  }, [setEmbeddingModeLoaded])

  return {
    initEmbeddingWorker,
    initWorker,
    isInitialized,
  }
}
