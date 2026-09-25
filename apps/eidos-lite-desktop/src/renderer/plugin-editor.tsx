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
  onOpenFile,
  onTableRequest,
  tableRevision,
  hostEvent,
  onError,
}: {
  instance: Instance
  onDraft(change: TextChange | null, path?: string): void
  onFallback(): void
  onRetry(): void
  onNotification?(message: string): void
  onNavigate?(key: string): void
  onOpenFile?(path: string): void
  onTableRequest?(request: PluginRequest): Promise<unknown>
  tableRevision?: unknown
  hostEvent?: { observation: string; value: unknown }
  onError?(message: string): void
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
    onOpenFile,
    onTableRequest,
    t,
  })
  callbacks.current = {
    onDraft,
    onRetry,
    onNotification,
    onNavigate,
    onOpenFile,
    onTableRequest,
    t,
  }
  const [error, setError] = useState<string | null>(null)
  const [closed, setClosed] = useState(false)
  const [notification, setNotification] = useState<string | null>(null)
  const errorCallback = useRef(onError)
  errorCallback.current = onError
  useEffect(() => {
    if (error) errorCallback.current?.(error)
  }, [error])
  useEffect(() => {
    if (hostEvent)
      frame.current?.contentWindow?.postMessage(
        { protocol: PLUGIN_PROTOCOL, apiVersion: 1, ...hostEvent },
        "*"
      )
  }, [hostEvent])
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
    loads.current = 0
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
      if (request.method === "extension.failed") {
        const params = request.params as { message?: unknown } | null
        setError(
          typeof params?.message === "string"
            ? params.message
            : "Plugin activation failed"
        )
      }
      const source = event.source as Window
      pending++
      // A preview or network call can wait for user input. Only table writes
      // participate in the close/save barrier; otherwise closing would deadlock.
      const track = (operation: Promise<void>) =>
        (request.method.startsWith("table.") ||
          request.method.startsWith("eidos.") ||
          request.method.startsWith("media.")) &&
        request.method !== "table.target.update" &&
        request.method !== "table.pluginConfig.write" &&
        request.method !== "eidos.pluginConfig.write"
          ? operation
          : textDraftLifecycle.track(operation)
      void track(
        ((request.method.startsWith("table.") ||
          request.method.startsWith("eidos.")) &&
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
                if (
                  request.method === "eidos.connection.status" ||
                  request.method === "eidos.connection.request"
                ) {
                  const params = request.params as {
                    connection?: unknown
                    body?: unknown
                  } | null
                  if (!params || typeof params.connection !== "string")
                    throw new Error("Invalid connection")
                  const result = await window.eidosLite.pluginConnection(
                    instance.ticket,
                    params.connection,
                    request.method === "eidos.connection.status"
                      ? "status"
                      : "request",
                    params.body
                  )
                  return request.method === "eidos.connection.status"
                    ? !!(
                        result &&
                        typeof result === "object" &&
                        "configured" in result &&
                        result.configured
                      )
                    : result
                }
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
            if (result.openFile) callbacks.current.onOpenFile?.(result.openFile)
          })
          .catch((cause: unknown) => {
            if (lease.current !== instance.ticket) return
            const message =
              cause instanceof Error ? cause.message : "Plugin request failed"
            if (
              !request.method.startsWith("table.") &&
              !request.method.startsWith("eidos.connection.")
            )
              setError(`${request.method}: ${message}`)
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
          (previous) =>
            previous ??
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
          allow="fullscreen; camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'; usb 'none'; serial 'none'; bluetooth 'none'"
          allowFullScreen
          onError={() => setError(t("Plugin failed to load."))}
        />
      )}
    </section>
  )
}
