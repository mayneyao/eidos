import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type {
  BaseRowPage,
  BaseTableSnapshot,
  BaseViewInfo,
} from "@eidos.space/base"
import {
  EXTENSION_SURFACE_BOOTSTRAP_CHANNEL,
  EXTENSION_SURFACE_MAX_BASE_PAGE_SIZE,
  EXTENSION_SURFACE_PROTOCOL_VERSION,
  parseExtensionSurfaceMessage,
  type ExtensionBaseViewContextSnapshot,
  type ExtensionJsonValue,
  type ExtensionSurfaceAppearance,
} from "@eidos.space/extension-surface-protocol"
import { createExtensionSurfaceHostHtml } from "@eidos.space/extension-runtime/surface"
import { AlertTriangle, LoaderCircle, RefreshCw } from "lucide-react"

import type { FileExtensionOpenBaseViewResult } from "@/apps/desktop/electron/modules/file-extensions/types"
import { useCurrentSpace } from "@/apps/web-app/hooks/use-current-space"
import type { FileExtensionBaseView } from "@/apps/web-app/hooks/use-file-extension-base-views"
import { Button } from "@/components/ui/button"
import { useTheme } from "@/components/theme-provider"

import { readExtensionSurfaceAppearance } from "./extension-surface-appearance"

const SURFACE_HOST_HTML = createExtensionSurfaceHostHtml()
const MAX_EXTENSION_BASE_PAGE_CODE_UNITS = 1024 * 1024
const MAX_EXTENSION_BASE_CONTEXT_CODE_UNITS = 256 * 1024

interface ExtensionJsonBudget {
  remaining: number
}

function boundedExtensionText(value: string, budget: ExtensionJsonBudget) {
  if (budget.remaining <= 0) return "[truncated]"
  const available = Math.min(budget.remaining, 16 * 1024)
  const truncated = value.length > available
  const valueLength = truncated ? Math.max(0, available - 1) : value.length
  budget.remaining -= valueLength + (truncated ? 1 : 0)
  return truncated ? `${value.slice(0, valueLength)}…` : value
}

function extensionJsonValue(
  value: unknown,
  depth = 0,
  budget: ExtensionJsonBudget = {
    remaining: MAX_EXTENSION_BASE_CONTEXT_CODE_UNITS,
  }
): ExtensionJsonValue {
  if (value === null || typeof value === "boolean") return value
  if (typeof value === "string") return boundedExtensionText(value, budget)
  if (typeof value === "number")
    return Number.isFinite(value) ? value : String(value)
  if (typeof value === "bigint") {
    return boundedExtensionText(value.toString(), budget)
  }
  if (value instanceof Uint8Array) return `[binary ${value.byteLength} bytes]`
  if (depth >= 8) return "[nested value]"
  if (Array.isArray(value)) {
    return value
      .slice(0, 256)
      .map((item) => extensionJsonValue(item, depth + 1, budget))
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 256)
        .map(([key, item]) => [
          key,
          extensionJsonValue(item, depth + 1, budget),
        ])
    )
  }
  return String(value)
}

function extensionBasePage(page: BaseRowPage) {
  const budget = { remaining: MAX_EXTENSION_BASE_PAGE_CODE_UNITS }
  return {
    offset: page.offset,
    limit: page.limit,
    total: page.total,
    rows: page.rows.slice(0, EXTENSION_SURFACE_MAX_BASE_PAGE_SIZE).map((row) =>
      Object.fromEntries(
        Object.entries(row)
          .slice(0, 256)
          .map(([key, value]) => [key, extensionJsonValue(value, 0, budget)])
      )
    ),
  }
}

export function ExtensionBaseViewSurface({
  extension,
  filePath,
  table,
  view,
  loadPage,
  onFallback,
}: {
  extension: FileExtensionBaseView
  filePath: string
  table: BaseTableSnapshot
  view: BaseViewInfo
  loadPage: (offset: number, limit: number) => Promise<BaseRowPage>
  onFallback?: () => void
}) {
  const { currentSpace } = useCurrentSpace()
  const { resolvedTheme } = useTheme()
  const [session, setSession] =
    useState<FileExtensionOpenBaseViewResult | null>(null)
  const [appearance, setAppearance] =
    useState<ExtensionSurfaceAppearance | null>(null)
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(true)
  const [activated, setActivated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const portRef = useRef<MessagePort | null>(null)
  const initializedRef = useRef(false)
  const appearanceRef = useRef<ExtensionSurfaceAppearance | null>(null)

  const context = useMemo<ExtensionBaseViewContextSnapshot>(() => {
    const budget = { remaining: MAX_EXTENSION_BASE_CONTEXT_CODE_UNITS }
    return {
      resourcePath: filePath,
      table: {
        id: table.table.id,
        name: table.table.name,
        rowCount: table.rowCount,
      },
      view: { id: view.id, name: view.name },
      fields: table.fields.map((field) => ({
        name: field.name,
        columnName: field.tableColumnName,
        type: field.type,
        property: extensionJsonValue(field.property, 0, budget),
      })),
    }
  }, [
    filePath,
    table.fields,
    table.rowCount,
    table.table.id,
    table.table.name,
    view.id,
    view.name,
  ])

  const disposeSurface = useCallback(() => {
    initializedRef.current = false
    try {
      portRef.current?.close()
    } catch {
      // The iframe may have already closed the port.
    }
    portRef.current = null
  }, [])

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
    const port = portRef.current
    if (!port || !initializedRef.current) return
    port.postMessage({ type: "base-context-changed", context })
  }, [context])

  useEffect(() => {
    const spaceId = currentSpace?.id
    if (!spaceId || !window.eidos?.fileExtensions?.openBaseView) {
      setLoading(false)
      setError("Extension Base views are available in Desktop file Spaces.")
      return
    }
    let cancelled = false
    setLoading(true)
    setActivated(false)
    setError(null)
    disposeSurface()
    void window.eidos.fileExtensions
      .openBaseView(spaceId, {
        packageId: extension.packageId,
        contentDigest: extension.contentDigest,
        permissionHash: extension.permissionHash,
        baseViewId: extension.id,
        path: filePath,
      })
      .then((opened) => {
        if (!cancelled) setSession(opened)
      })
      .catch((openError: unknown) => {
        if (cancelled) return
        setSession(null)
        setError(
          openError instanceof Error
            ? openError.message
            : "Unable to open the extension Base view."
        )
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
      disposeSurface()
    }
  }, [
    currentSpace?.id,
    disposeSurface,
    extension.contentDigest,
    extension.id,
    extension.packageId,
    extension.permissionHash,
    filePath,
    revision,
  ])

  useEffect(() => {
    const spaceId = currentSpace?.id
    if (!spaceId || !window.eidos) return
    const listenerId = window.eidos.on(
      "file-extensions:development-changed",
      (_event: unknown, payload: unknown) => {
        if (
          !payload ||
          typeof payload !== "object" ||
          !("spaceId" in payload) ||
          !("packageId" in payload) ||
          payload.spaceId !== spaceId ||
          payload.packageId !== extension.packageId
        ) {
          return
        }
        if ("status" in payload && payload.status === "ready") {
          setRevision((current) => current + 1)
        } else if ("status" in payload && payload.status === "checking") {
          disposeSurface()
          setActivated(false)
          setLoading(true)
          setError(null)
        } else if ("status" in payload && payload.status !== "checking") {
          disposeSurface()
          setActivated(false)
          setLoading(false)
          setError("Fix the extension source to reload this Base view.")
        }
      }
    )
    return () => {
      if (listenerId) {
        window.eidos.off("file-extensions:development-changed", listenerId)
      }
    }
  }, [currentSpace?.id, disposeSurface, extension.packageId])

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
            surfaceKind: "base-view",
            protocolVersion: EXTENSION_SURFACE_PROTOCOL_VERSION,
            packageId: session.packageId,
            generation: session.generation,
            baseViewId: session.baseViewId,
            viewId: view.id,
            context,
            appearance: appearanceRef.current ?? currentAppearance,
          })
          return
        }
        if (message?.type === "activated") {
          setActivated(true)
          return
        }
        if (message?.type === "surface-log") {
          void window.eidos.fileExtensions
            .reportSurfaceOutput(spaceId, {
              surfaceKind: "base-view",
              packageId: extension.packageId,
              contentDigest: extension.contentDigest,
              permissionHash: extension.permissionHash,
              generation: message.generation,
              level: message.level,
              message: message.message,
            })
            .catch(() => undefined)
          return
        }
        if (message?.type === "activation-error") {
          void window.eidos.fileExtensions
            .reportSurfaceOutput(spaceId, {
              surfaceKind: "base-view",
              packageId: extension.packageId,
              contentDigest: extension.contentDigest,
              permissionHash: extension.permissionHash,
              generation: session.generation,
              level: "error",
              message: `SURFACE_ACTIVATION_FAILED: ${message.message}`,
            })
            .catch(() => undefined)
          setError(message.message)
          return
        }
        if (message?.type !== "base-page-request") return
        if (message.generation !== session.generation) {
          channel.port1.postMessage({
            type: "base-page-result",
            requestId: message.requestId,
            ok: false,
            error: { message: "The extension Base view is stale." },
          })
          return
        }
        void loadPage(message.offset, message.limit).then(
          (page) => {
            channel.port1.postMessage({
              type: "base-page-result",
              requestId: message.requestId,
              ok: true,
              page: extensionBasePage(page),
            })
          },
          (pageError: unknown) => {
            channel.port1.postMessage({
              type: "base-page-result",
              requestId: message.requestId,
              ok: false,
              error: {
                message:
                  pageError instanceof Error
                    ? pageError.message
                    : "Unable to load Base rows.",
              },
            })
          }
        )
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
    [context, currentSpace?.id, extension, loadPage, session, view.id]
  )

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
        Opening extension Base view…
      </div>
    )
  }

  if (!session || !appearance || error) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-md text-center">
          <AlertTriangle className="mx-auto mb-3 h-5 w-5 text-amber-500" />
          <p className="text-sm font-medium">Extension Base view unavailable</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {error ?? "The extension Base view could not be initialized."}
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            {onFallback ? (
              <Button variant="outline" size="sm" onClick={onFallback}>
                Show Grid
              </Button>
            ) : null}
            <Button
              size="sm"
              onClick={() => setRevision((current) => current + 1)}
            >
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
      <iframe
        key={`${session.baseViewId}:${session.generation}`}
        title={extension.displayName}
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
