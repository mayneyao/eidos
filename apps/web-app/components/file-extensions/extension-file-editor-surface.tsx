import { useCallback, useEffect, useId, useRef, useState } from "react"
import {
  EXTENSION_SURFACE_BOOTSTRAP_CHANNEL,
  EXTENSION_SURFACE_PROTOCOL_VERSION,
  parseExtensionSurfaceMessage,
  type ExtensionHostToSurfaceMessage,
  type ExtensionSurfaceAppearance,
  type ExtensionTextDocumentState,
} from "@eidos.space/extension-surface-protocol"
import { createExtensionSurfaceHostHtml } from "@eidos.space/extension-runtime/surface"
import { AlertTriangle, LoaderCircle, RefreshCw } from "lucide-react"

import { toSpaceFileUrl } from "@/apps/web-app/components/file-space/file-path"
import { navigateAfterFlushingSpaceFile } from "@/apps/web-app/components/file-space/file-navigation"
import { registerPendingWriteFlusher } from "@/apps/web-app/components/file-space/pending-writes"
import { useCurrentSpace } from "@/apps/web-app/hooks/use-current-space"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { useSpaceFileChanges } from "@/apps/web-app/hooks/use-space-files"
import { useTabDirty } from "@/apps/web-app/hooks/use-tab-dirty"
import { Button } from "@/components/ui/button"
import { useTheme } from "@/components/theme-provider"
import type {
  FileExtensionDevelopmentChangedEvent,
  FileExtensionOpenEditorResult,
  FileExtensionSurfaceMessageEvent,
} from "@/apps/desktop/electron/modules/file-extensions/types"

import { readExtensionSurfaceAppearance } from "./extension-surface-appearance"

const SURFACE_HOST_HTML = createExtensionSurfaceHostHtml()

function stateFromMessage(
  message: ExtensionTextDocumentState
): ExtensionTextDocumentState {
  return {
    revision: message.revision,
    savedRevision: message.savedRevision,
    dirty: message.dirty,
    readOnly: message.readOnly,
    canUndo: message.canUndo,
    canRedo: message.canRedo,
    externalConflict: message.externalConflict,
  }
}

function requestId(value: unknown): string {
  if (
    value &&
    typeof value === "object" &&
    "requestId" in value &&
    typeof value.requestId === "string"
  ) {
    return value.requestId
  }
  return "invalid-surface-request"
}

function isDisposedDocumentSessionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes("Extension editor session is unavailable")
}

export function ExtensionFileEditorSurface({
  filePath,
  editorId,
}: {
  filePath: string
  editorId: string
}) {
  const { currentSpace } = useCurrentSpace()
  const { navigate } = useRouterAdapter()
  const { resolvedTheme } = useTheme()
  const [retry, setRetry] = useState(0)
  const [session, setSession] = useState<FileExtensionOpenEditorResult | null>(
    null
  )
  const [appearance, setAppearance] =
    useState<ExtensionSurfaceAppearance | null>(null)
  const [documentState, setDocumentState] =
    useState<ExtensionTextDocumentState | null>(null)
  const [loading, setLoading] = useState(true)
  const [activated, setActivated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [developmentReloading, setDevelopmentReloading] = useState(false)
  const [developmentIssue, setDevelopmentIssue] = useState<string | null>(null)
  const [developmentBlocked, setDevelopmentBlocked] = useState(false)
  const pendingWriteKey = useId()
  const portRef = useRef<MessagePort | null>(null)
  const initializedRef = useRef(false)
  const appearanceRef = useRef<ExtensionSurfaceAppearance | null>(null)
  const queuedMessagesRef = useRef<ExtensionHostToSurfaceMessage[]>([])
  const requestQueueRef = useRef<Promise<void>>(Promise.resolve())
  const documentStateRef = useRef<ExtensionTextDocumentState | null>(null)
  const developmentEventRef = useRef<{
    sessionId: string
    generation: number
  } | null>(null)
  const developmentRefreshRef = useRef(false)
  const documentSessionDisposedRef = useRef(false)

  useTabDirty(documentState?.dirty === true)

  useEffect(() => {
    const next = readExtensionSurfaceAppearance(
      resolvedTheme === "dark" ? "dark" : "light"
    )
    appearanceRef.current = next
    setAppearance(next)
  }, [resolvedTheme])

  useEffect(() => {
    documentStateRef.current = documentState
  }, [documentState])

  useEffect(() => {
    const port = portRef.current
    if (!port || !initializedRef.current || !appearance) return
    port.postMessage({ type: "appearance-changed", appearance })
  }, [appearance])

  useEffect(() => {
    const spaceId = currentSpace?.id
    if (!spaceId || !window.eidos?.fileExtensions) {
      setLoading(false)
      setError("Extension file editors are available in Desktop file Spaces.")
      return
    }
    let cancelled = false
    let opened: FileExtensionOpenEditorResult | undefined
    setLoading(true)
    setActivated(false)
    setError(null)
    setSaveError(null)
    setDevelopmentReloading(false)
    setDevelopmentIssue(null)
    setDevelopmentBlocked(false)
    developmentRefreshRef.current = false
    documentSessionDisposedRef.current = false
    setSession(null)
    setDocumentState(null)

    void (async () => {
      try {
        const editors = await window.eidos.fileExtensions.listFileEditors(
          spaceId,
          filePath
        )
        const editor = editors.find((candidate) => candidate.id === editorId)
        if (!editor) {
          throw new Error(
            "This extension editor is no longer enabled or does not match the file."
          )
        }
        opened = await window.eidos.fileExtensions.openFileEditor(spaceId, {
          packageId: editor.packageId,
          contentDigest: editor.contentDigest,
          permissionHash: editor.permissionHash,
          editorId: editor.id,
          path: filePath,
        })
        if (cancelled) {
          await window.eidos.fileExtensions
            .closeFileEditor(spaceId, {
              sessionId: opened.sessionId,
              viewId: opened.viewId,
            })
            .catch(() => undefined)
          return
        }
        setSession(opened)
        setDocumentState(stateFromMessage(opened.snapshot))
      } catch (openError) {
        if (!cancelled) {
          setError(
            openError instanceof Error
              ? openError.message
              : "Unable to open the extension editor."
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
      const active = opened
      if (!active) return
      void window.eidos.fileExtensions
        .closeFileEditor(spaceId, {
          sessionId: active.sessionId,
          viewId: active.viewId,
        })
        .catch(() => undefined)
    }
  }, [currentSpace?.id, editorId, filePath, retry])

  useEffect(() => {
    const spaceId = currentSpace?.id
    const packageId = session?.packageId
    if (!spaceId || !packageId || !window.eidos) return
    const listenerId = window.eidos.on(
      "file-extensions:development-changed",
      (_event: unknown, payload: unknown) => {
        const event = payload as Partial<FileExtensionDevelopmentChangedEvent>
        if (
          event.spaceId !== spaceId ||
          event.packageId !== packageId ||
          typeof event.sessionId !== "string" ||
          typeof event.generation !== "number" ||
          typeof event.status !== "string"
        ) {
          return
        }
        const previous = developmentEventRef.current
        if (
          previous?.sessionId === event.sessionId &&
          event.generation <= previous.generation
        ) {
          return
        }
        developmentEventRef.current = {
          sessionId: event.sessionId,
          generation: event.generation,
        }
        if (event.status === "checking") {
          developmentRefreshRef.current = true
          setDevelopmentReloading(true)
          setDevelopmentIssue(null)
          setDevelopmentBlocked(false)
          setActivated(false)
          return
        }
        if (event.status === "ready") {
          developmentRefreshRef.current = false
          setDevelopmentReloading(false)
          setDevelopmentIssue(null)
          setDevelopmentBlocked(false)
          setRetry((value) => value + 1)
          return
        }
        setDevelopmentReloading(false)
        if (event.status === "stopped") {
          setActivated(false)
          setDevelopmentBlocked(false)
          setError("The extension development session stopped.")
          return
        }
        const diagnostic = event.diagnostics?.[0]
        setError(null)
        setDevelopmentIssue(
          diagnostic?.message ??
            "The extension cannot run until its development error is fixed."
        )
        const blocked = diagnostic?.code !== "document-save"
        setDevelopmentBlocked(blocked)
        if (blocked) setActivated(false)
      }
    )
    return () => {
      if (listenerId) {
        window.eidos.off("file-extensions:development-changed", listenerId)
      }
    }
  }, [currentSpace?.id, session?.packageId])

  useEffect(() => {
    const spaceId = currentSpace?.id
    if (!spaceId || !session) return
    return registerPendingWriteFlusher(
      pendingWriteKey,
      async () => {
        if (documentSessionDisposedRef.current) {
          setSaveError(null)
          return true
        }
        try {
          await window.eidos.fileExtensions.flushFileEditor(spaceId, {
            sessionId: session.sessionId,
            viewId: session.viewId,
          })
          setSaveError(null)
          return true
        } catch (flushError) {
          if (
            developmentRefreshRef.current &&
            isDisposedDocumentSessionError(flushError)
          ) {
            documentSessionDisposedRef.current = true
            setSaveError(null)
            return true
          }
          setSaveError(
            flushError instanceof Error
              ? flushError.message
              : "Unable to save the extension document."
          )
          return false
        }
      },
      { spaceId, filePath }
    )
  }, [currentSpace?.id, filePath, pendingWriteKey, session])

  const postHostMessage = useCallback(
    (message: ExtensionHostToSurfaceMessage) => {
      if (message.type === "document-changed") {
        setDocumentState(stateFromMessage(message))
      } else if (message.type === "document-replaced") {
        setDocumentState(stateFromMessage(message.snapshot))
      } else if (message.type === "document-state") {
        setDocumentState(stateFromMessage(message))
      } else if (message.type === "save-state") {
        if (message.state === "error") {
          setSaveError(message.message ?? "Unable to save the document.")
        } else if (message.state === "saved") {
          setSaveError(null)
        }
      } else if (message.type === "dispose") {
        documentSessionDisposedRef.current = true
        setActivated(false)
        if (!developmentRefreshRef.current) setError(message.reason)
      }

      const port = portRef.current
      if (port) port.postMessage(message)
      else queuedMessagesRef.current.push(message)
    },
    []
  )

  useEffect(() => {
    if (!session || !window.eidos) return
    const listenerId = window.eidos.on(
      "file-extensions:surface-message",
      (_event: unknown, payload: unknown) => {
        const event = payload as Partial<FileExtensionSurfaceMessageEvent>
        if (
          event.spaceId !== currentSpace?.id ||
          event.sessionId !== session.sessionId ||
          event.viewId !== session.viewId ||
          !event.message
        ) {
          return
        }
        postHostMessage(event.message)
      }
    )
    return () => {
      if (listenerId) {
        window.eidos.off("file-extensions:surface-message", listenerId)
      }
    }
  }, [currentSpace?.id, postHostMessage, session])

  useSpaceFileChanges(
    currentSpace?.id,
    useCallback(
      (event) => {
        if (!session || event.path !== filePath) return
        void window.eidos.fileExtensions
          .refreshFileEditor(currentSpace!.id, {
            sessionId: session.sessionId,
            viewId: session.viewId,
          })
          .catch((refreshError) => {
            setSaveError(
              refreshError instanceof Error
                ? refreshError.message
                : "Unable to refresh the extension document."
            )
          })
      },
      [currentSpace, filePath, session]
    )
  )

  const connectSurface = useCallback(
    (iframe: HTMLIFrameElement) => {
      const spaceId = currentSpace?.id
      const currentAppearance = appearanceRef.current
      if (
        !spaceId ||
        !session ||
        !currentAppearance ||
        !iframe.contentWindow ||
        portRef.current
      ) {
        return
      }
      const channel = new MessageChannel()
      portRef.current = channel.port1
      initializedRef.current = false
      requestQueueRef.current = Promise.resolve()
      channel.port1.addEventListener("message", (event) => {
        let message
        try {
          message = parseExtensionSurfaceMessage(event.data)
        } catch {
          message = undefined
        }
        if (message?.type === "ready") {
          if (initializedRef.current) return
          initializedRef.current = true
          channel.port1.postMessage({
            type: "initialize",
            protocolVersion: EXTENSION_SURFACE_PROTOCOL_VERSION,
            packageId: session.packageId,
            generation: session.generation,
            editorId: session.editorId,
            viewId: session.viewId,
            snapshot: session.snapshot,
            capabilities: session.capabilities,
            appearance: appearanceRef.current ?? currentAppearance,
          })
          for (const queued of queuedMessagesRef.current.splice(0)) {
            channel.port1.postMessage(queued)
          }
          return
        }
        if (message?.type === "activated") {
          setActivated(true)
          return
        }
        if (message?.type === "activation-error") {
          setError(message.message)
          return
        }
        if (message?.type === "closed") {
          setError("The extension editor closed unexpectedly.")
          return
        }

        const rawMessage = event.data
        requestQueueRef.current = requestQueueRef.current.then(async () => {
          try {
            const result =
              await window.eidos.fileExtensions.handleFileEditorRequest(
                spaceId,
                { sessionId: session.sessionId, viewId: session.viewId },
                rawMessage
              )
            channel.port1.postMessage(result)
          } catch (requestError) {
            channel.port1.postMessage({
              type: "request-result",
              requestId: requestId(rawMessage),
              ok: false,
              revision: documentStateRef.current?.revision ?? 1,
              error: {
                code: "NOT_AVAILABLE",
                message:
                  requestError instanceof Error
                    ? requestError.message
                    : "The host rejected the extension request.",
              },
            })
          }
        })
      })
      channel.port1.start()
      iframe.contentWindow.postMessage(
        {
          type: EXTENSION_SURFACE_BOOTSTRAP_CHANNEL,
          source: session.source,
          generation: session.generation,
        },
        "*",
        [channel.port2]
      )
    },
    [currentSpace?.id, session]
  )

  useEffect(() => {
    return () => {
      initializedRef.current = false
      queuedMessagesRef.current = []
      try {
        portRef.current?.close()
      } catch {
        // The iframe may have already closed the port.
      }
      portRef.current = null
    }
  }, [session?.sessionId])

  const resolveConflict = useCallback(
    async (resolution: "reload" | "overwrite") => {
      if (!currentSpace?.id || !session) return
      try {
        await window.eidos.fileExtensions.resolveFileEditorConflict(
          currentSpace.id,
          {
            sessionId: session.sessionId,
            viewId: session.viewId,
            resolution,
          }
        )
        setSaveError(null)
      } catch (resolutionError) {
        setSaveError(
          resolutionError instanceof Error
            ? resolutionError.message
            : "Unable to resolve the external file conflict."
        )
      }
    },
    [currentSpace?.id, session]
  )

  const openNative = useCallback(async () => {
    if (!currentSpace?.id) return
    await navigateAfterFlushingSpaceFile({
      spaceId: currentSpace.id,
      currentFilePath: filePath,
      destination: toSpaceFileUrl(filePath),
      navigate,
    })
  }, [currentSpace?.id, filePath, navigate])

  const conflict = documentState?.externalConflict
  const runtimeUnavailable = Boolean(error && !loading)

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
        Opening extension editor…
      </div>
    )
  }

  if (!session || !appearance || runtimeUnavailable) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-md text-center">
          <AlertTriangle className="mx-auto mb-3 h-5 w-5 text-amber-500" />
          <p className="text-sm font-medium">Extension editor unavailable</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {error ?? "The extension editor could not be initialized."}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void openNative()}
            >
              Open with Eidos
            </Button>
            <Button size="sm" onClick={() => setRetry((value) => value + 1)}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Retry
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-background">
      {conflict ? (
        <div className="flex shrink-0 items-center gap-3 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
          <span className="min-w-0 flex-1">
            This file changed outside Eidos. Choose which version to keep.
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7"
            onClick={() => void resolveConflict("reload")}
          >
            Reload file
          </Button>
          <Button
            size="sm"
            className="h-7"
            onClick={() => void resolveConflict("overwrite")}
          >
            Keep my changes
          </Button>
        </div>
      ) : saveError ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{saveError}</span>
        </div>
      ) : developmentIssue ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{developmentIssue}</span>
        </div>
      ) : null}
      <iframe
        key={session.sessionId}
        title={`${editorId} editor`}
        srcDoc={SURFACE_HOST_HTML}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        className="min-h-0 flex-1 border-0 bg-background"
        onLoad={(event) => connectSurface(event.currentTarget)}
      />
      {!activated || developmentBlocked ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/80 text-sm text-muted-foreground backdrop-blur-[1px]">
          {developmentBlocked ? (
            <AlertTriangle className="mr-2 h-4 w-4 text-destructive" />
          ) : (
            <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
          )}
          {developmentBlocked
            ? developmentIssue
            : developmentReloading
              ? "Reloading extension…"
              : "Activating extension…"}
        </div>
      ) : null}
    </div>
  )
}
