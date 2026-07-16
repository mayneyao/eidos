import { useCallback, useEffect, useRef, useState } from "react"
import {
  EXTENSION_SURFACE_BOOTSTRAP_CHANNEL,
  EXTENSION_SURFACE_PROTOCOL_VERSION,
  parseExtensionSurfaceMessage,
  type ExtensionSurfaceAppearance,
} from "@eidos.space/extension-surface-protocol"
import { createExtensionSurfaceHostHtml } from "@eidos.space/extension-runtime/surface"
import { AlertTriangle, LoaderCircle, RefreshCw } from "lucide-react"

import type {
  FileExtensionDevelopmentChangedEvent,
  FileExtensionOpenPanelResult,
  FileExtensionPanelDisposedEvent,
  FileExtensionPanelOpenEvent,
} from "@/apps/desktop/electron/modules/file-extensions/types"
import { useCurrentSpace } from "@/apps/web-app/hooks/use-current-space"
import { useTabTitle } from "@/apps/web-app/hooks/use-tab-title"
import { Button } from "@/components/ui/button"
import { useTheme } from "@/components/theme-provider"

import { readExtensionSurfaceAppearance } from "./extension-surface-appearance"

const SURFACE_HOST_HTML = createExtensionSurfaceHostHtml()

export function ExtensionPanelSurface({ sessionId }: { sessionId: string }) {
  const { currentSpace } = useCurrentSpace()
  const { resolvedTheme } = useTheme()
  const [session, setSession] = useState<FileExtensionOpenPanelResult | null>(
    null
  )
  const [appearance, setAppearance] =
    useState<ExtensionSurfaceAppearance | null>(null)
  const [refreshRevision, setRefreshRevision] = useState(0)
  const [loading, setLoading] = useState(true)
  const [activated, setActivated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [developmentReloading, setDevelopmentReloading] = useState(false)
  const [developmentIssue, setDevelopmentIssue] = useState<string | null>(null)
  const portRef = useRef<MessagePort | null>(null)
  const initializedRef = useRef(false)
  const appearanceRef = useRef<ExtensionSurfaceAppearance | null>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const disposeSurface = useCallback(() => {
    initializedRef.current = false
    try {
      portRef.current?.close()
    } catch {
      // The iframe may have already closed the port.
    }
    portRef.current = null
  }, [])

  useTabTitle(session?.title ?? "Extension panel")

  useEffect(() => {
    const next = readExtensionSurfaceAppearance(
      resolvedTheme === "dark" ? "dark" : "light"
    )
    appearanceRef.current = next
    setAppearance(next)
  }, [resolvedTheme])

  useEffect(() => {
    const port = portRef.current
    if (!port || !initializedRef.current || !appearance) return
    port.postMessage({ type: "appearance-changed", appearance })
  }, [appearance])

  useEffect(() => {
    const spaceId = currentSpace?.id
    if (!spaceId || !window.eidos?.fileExtensions) {
      setLoading(false)
      setError("Extension panels are available in Desktop file Spaces.")
      return
    }
    let cancelled = false
    setLoading(true)
    setActivated(false)
    setError(null)
    void window.eidos.fileExtensions
      .getPanelSession(spaceId, { sessionId })
      .then((opened) => {
        if (!cancelled) {
          setSession(opened)
          setDevelopmentReloading(false)
          setDevelopmentIssue(null)
        }
      })
      .catch((openError) => {
        if (!cancelled) {
          setSession(null)
          setError(
            openError instanceof Error
              ? openError.message
              : "Unable to open the extension panel."
          )
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [currentSpace?.id, refreshRevision, sessionId])

  useEffect(() => {
    const spaceId = currentSpace?.id
    if (!spaceId || !window.eidos) return
    const openListenerId = window.eidos.on(
      "file-extensions:open-panel",
      (_event: unknown, payload: unknown) => {
        const event = payload as Partial<FileExtensionPanelOpenEvent>
        if (
          event.spaceId === spaceId &&
          event.sessionId === sessionId &&
          typeof event.revision === "number" &&
          event.revision > (session?.revision ?? 0)
        ) {
          setRefreshRevision(event.revision)
        }
      }
    )
    const disposedListenerId = window.eidos.on(
      "file-extensions:panel-disposed",
      (_event: unknown, payload: unknown) => {
        const event = payload as Partial<FileExtensionPanelDisposedEvent>
        if (event.spaceId === spaceId && event.sessionId === sessionId) {
          setActivated(false)
          setDevelopmentReloading(false)
          setDevelopmentIssue(null)
          setSession(null)
          setError(event.reason ?? "The extension panel is no longer active.")
        }
      }
    )
    return () => {
      if (openListenerId) {
        window.eidos.off("file-extensions:open-panel", openListenerId)
      }
      if (disposedListenerId) {
        window.eidos.off("file-extensions:panel-disposed", disposedListenerId)
      }
    }
  }, [currentSpace?.id, session?.revision, sessionId])

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
          typeof event.status !== "string"
        ) {
          return
        }
        if (event.status === "checking") {
          disposeSurface()
          setActivated(false)
          setDevelopmentReloading(true)
          setDevelopmentIssue(null)
          setError(null)
          return
        }
        if (event.status === "ready") {
          setDevelopmentIssue(null)
          return
        }
        setDevelopmentReloading(false)
        if (event.status === "stopped") {
          disposeSurface()
          setActivated(false)
          setError("The extension development session stopped.")
          return
        }
        disposeSurface()
        setActivated(false)
        setError(null)
        setDevelopmentIssue(
          event.diagnostics?.[0]?.message ??
            "The extension panel cannot reload until its development error is fixed."
        )
      }
    )
    return () => {
      if (listenerId) {
        window.eidos.off("file-extensions:development-changed", listenerId)
      }
    }
  }, [currentSpace?.id, disposeSurface, session?.packageId])

  useEffect(() => {
    const spaceId = currentSpace?.id
    if (!spaceId || !window.eidos?.fileExtensions) return
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
    return () => {
      closeTimerRef.current = setTimeout(() => {
        void window.eidos?.fileExtensions
          .closePanelSession(spaceId, { sessionId })
          .catch(() => undefined)
      }, 0)
    }
  }, [currentSpace?.id, sessionId])

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
            surfaceKind: "panel",
            protocolVersion: EXTENSION_SURFACE_PROTOCOL_VERSION,
            packageId: session.packageId,
            generation: session.generation,
            panelId: session.panelId,
            sessionId: session.sessionId,
            state: session.state,
            appearance: appearanceRef.current ?? currentAppearance,
          })
          return
        }
        if (message?.type === "activated") {
          setActivated(true)
        } else if (message?.type === "surface-log") {
          void window.eidos.fileExtensions
            .reportSurfaceOutput(spaceId, {
              surfaceKind: "panel",
              sessionId: session.sessionId,
              generation: message.generation,
              level: message.level,
              message: message.message,
            })
            .catch(() => undefined)
        } else if (message?.type === "activation-error") {
          void window.eidos.fileExtensions
            .reportSurfaceOutput(spaceId, {
              surfaceKind: "panel",
              sessionId: session.sessionId,
              generation: session.generation,
              level: "error",
              message: `SURFACE_ACTIVATION_FAILED: ${message.message}`,
            })
            .catch(() => undefined)
          setError(message.message)
        } else if (message?.type === "closed") {
          setError("The extension panel closed unexpectedly.")
        }
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
    return disposeSurface
  }, [disposeSurface, session?.revision, session?.sessionId])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
        Opening extension panel…
      </div>
    )
  }

  if (developmentReloading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
        Reloading extension panel…
      </div>
    )
  }

  if (developmentIssue) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-md text-center">
          <AlertTriangle className="mx-auto mb-3 h-5 w-5 text-amber-500" />
          <p className="text-sm font-medium">Extension development paused</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {developmentIssue}
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            Save valid source to reload this panel automatically.
          </p>
        </div>
      </div>
    )
  }

  if (!session || !appearance || error) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-md text-center">
          <AlertTriangle className="mx-auto mb-3 h-5 w-5 text-amber-500" />
          <p className="text-sm font-medium">Extension panel unavailable</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {error ?? "The extension panel could not be initialized."}
          </p>
          <Button
            className="mt-4"
            size="sm"
            onClick={() => setRefreshRevision((value) => value + 1)}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-background">
      <iframe
        key={`${session.sessionId}:${session.revision}`}
        title={session.title}
        srcDoc={SURFACE_HOST_HTML}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        className="min-h-0 flex-1 border-0 bg-background"
        onLoad={(event) => connectSurface(event.currentTarget)}
      />
      {!activated ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/80 text-sm text-muted-foreground backdrop-blur-[1px]">
          <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
          Activating extension…
        </div>
      ) : null}
    </div>
  )
}
