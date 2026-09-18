import { useEffect, useRef, useState } from "react"
import {
  parseRequest,
  PLUGIN_PROTOCOL,
  type TextChange,
  type PluginRequest,
} from "@eidos.space/plugin-runtime/rpc"
import type { PluginOpenResult, PluginRpcResult } from "../shared/plugins"
import { useEidosLiteI18n } from "./i18n"
import { textDraftLifecycle } from "./text-draft-lifecycle"
import { pluginTheme } from "./plugin-theme"

type Instance = NonNullable<PluginOpenResult["instance"]>
export function PluginEditor({
  instance,
  onDraft,
  onFallback,
  onRetry,
  onNotification,
  onNavigate,
  onTableRequest,
  tableRevision,
}: {
  instance: Instance
  onDraft(change: TextChange | null, path?: string): void
  onFallback(): void
  onRetry(): void
  onNotification?(message: string): void
  onNavigate?(key: string): void
  onTableRequest?(request: PluginRequest): Promise<unknown>
  tableRevision?: unknown
}) {
  const { t } = useEidosLiteI18n()
  const frame = useRef<HTMLIFrameElement>(null)
  const loads = useRef(0)
  const lease = useRef<string | null>(null)
  const callbacks = useRef({
    onDraft,
    onRetry,
    onNotification,
    onNavigate,
    onTableRequest,
    t,
  })
  callbacks.current = {
    onDraft,
    onRetry,
    onNotification,
    onNavigate,
    onTableRequest,
    t,
  }
  const [error, setError] = useState<string | null>(null)
  const [closed, setClosed] = useState(false)
  const [notification, setNotification] = useState<string | null>(null)
  useEffect(() => {
    frame.current?.contentWindow?.postMessage(
      {
        protocol: PLUGIN_PROTOCOL,
        apiVersion: 1,
        observation: "host.table",
        value: null,
      },
      "*"
    )
  }, [tableRevision])
  useEffect(() => {
    lease.current = instance.ticket
    setError(null)
    setClosed(false)
    let connected = false
    const sendTheme = () => {
      if (connected)
        frame.current?.contentWindow?.postMessage(
          {
            protocol: PLUGIN_PROTOCOL,
            apiVersion: 1,
            observation: "host.theme",
            value: pluginTheme(),
          },
          "*"
        )
    }
    const themeObserver = new MutationObserver(sendTheme)
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "data-theme"],
    })
    const appearance = window.matchMedia?.("(prefers-color-scheme: dark)")
    appearance?.addEventListener("change", sendTheme)
    let pending = 0
    const timeout = setTimeout(() => {
      if (!connected)
        setError(
          callbacks.current.t(
            "Plugin did not connect. Retry or use the built-in editor."
          )
        )
    }, 10_000)
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || pending >= 64) return
      let request
      try {
        request = parseRequest(event.data)
      } catch {
        return
      }
      if (textDraftLifecycle.isLocked) return
      const source = event.source as Window
      pending++
      void textDraftLifecycle.track(
        (request.method.startsWith("table.") &&
        callbacks.current.onTableRequest &&
        !closed
          ? window.eidosLite
              .pluginRequest(instance.ticket, request)
              .then(async (authorization) => {
                if ("error" in authorization.response)
                  throw new Error(authorization.response.error.message)
                if (
                  lease.current !== instance.ticket ||
                  !callbacks.current.onTableRequest
                )
                  throw new Error("Table view closed")
                return callbacks.current.onTableRequest(request)
              })
              .then(
                (result): PluginRpcResult => ({
                  response: {
                    protocol: PLUGIN_PROTOCOL,
                    apiVersion: 1,
                    id: request.id,
                    result,
                  },
                })
              )
          : window.eidosLite.pluginRequest(instance.ticket, request)
        )
          .then((result) => {
            if (lease.current !== instance.ticket) return
            if (
              request.method === "view.ready" &&
              "result" in result.response
            ) {
              connected = true
              sendTheme()
              clearTimeout(timeout)
            }
            if (result.draft !== undefined)
              callbacks.current.onDraft(result.draft, result.draftPath)
            if (result.notification !== undefined) {
              setNotification(result.notification)
              callbacks.current.onNotification?.(result.notification)
            }
            source.postMessage(result.response, "*")
            if (result.navigation)
              callbacks.current.onNavigate?.(result.navigation.key)
          })
          .catch((cause: unknown) => {
            if (lease.current !== instance.ticket) return
            const message =
              cause instanceof Error ? cause.message : "Plugin request failed"
            setError(message)
            source.postMessage(
              {
                protocol: PLUGIN_PROTOCOL,
                apiVersion: 1,
                id: request.id,
                error: { code: "IO_ERROR", message },
              },
              "*"
            )
          })
          .finally(() => {
            pending--
          })
      )
    }
    window.addEventListener("message", receive)
    const unsubscribe = window.eidosLite.onPluginEvent(({ ticket, event }) => {
      if (
        event.observation === "host.rollback" &&
        typeof event.value === "string" &&
        (instance.editor.key === event.value ||
          instance.editor.key.startsWith(`${event.value}/`))
      ) {
        callbacks.current.onRetry()
        return
      }
      if (event.observation === "host.diagnostic") {
        setNotification(String(event.value))
        return
      }
      if (ticket === instance.ticket && event.observation === "host.reload") {
        callbacks.current.onRetry()
        return
      }
      if (ticket === instance.ticket && event.observation === "host.closed") {
        setClosed(true)
        setError(
          callbacks.current.t(
            "Plugin instance closed. Retry or use the built-in editor."
          )
        )
        return
      }
      if (ticket === instance.ticket && lease.current === ticket) {
        if (event.draft !== undefined)
          callbacks.current.onDraft(event.draft, event.draftPath)
        frame.current?.contentWindow?.postMessage(event, "*")
      }
    })
    return () => {
      lease.current = null
      themeObserver.disconnect()
      appearance?.removeEventListener("change", sendTheme)
      window.removeEventListener("message", receive)
      unsubscribe()
      clearTimeout(timeout)
      // React StrictMode replays effects without disposing the actual frame.
      queueMicrotask(() => {
        if (lease.current !== instance.ticket)
          void window.eidosLite
            .closePluginEditor(instance.ticket)
            .catch(() => {})
      })
    }
  }, [instance.ticket])
  return (
    <section className="plugin-editor" aria-label={instance.editor.label}>
      {notification && <div role="status">{notification}</div>}
      {error && (
        <div className="plugin-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={onRetry}>
            {t("Retry")}
          </button>
          <button type="button" onClick={onFallback}>
            {t("Use built-in editor")}
          </button>
        </div>
      )}
      {!closed && (
        <iframe
          ref={frame}
          title={instance.editor.label}
          src={instance.url}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          onLoad={() => {
            if (++loads.current > 1)
              setError(
                t(
                  "Plugin navigation was blocked. Retry or use the built-in editor."
                )
              )
          }}
          allow="camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'; usb 'none'; serial 'none'; bluetooth 'none'"
          onError={() => setError(t("Plugin failed to load."))}
        />
      )}
    </section>
  )
}
