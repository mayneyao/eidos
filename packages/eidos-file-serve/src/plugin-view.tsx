import { useEffect, useMemo, useRef, useState } from "react"
import { Blocks } from "lucide-react"
import {
  EidosFileSchemaSettings,
  type EidosFilePlugin,
  type EidosFileViewRendererProps,
} from "@eidos.space/eidos-file-ui"
import { fetchPlugins, type PluginListing, type PluginManifest } from "./client"

const PLUGIN_PROTOCOL = "eidos-plugin"

export function pluginTheme(): Record<string, string> {
  if (typeof document === "undefined") return {}
  const style = getComputedStyle(document.documentElement)
  const probe = document.createElement("span")
  probe.hidden = true
  document.body.append(probe)
  const values: Record<string, string> = {}
  try {
    for (const [name, token] of Object.entries({
      background: "--canvas",
      foreground: "--ink",
      muted: "--ink-muted",
      border: "--line",
      accent: "--lite-accent",
    })) {
      probe.style.color = `var(${token})`
      values[`--eidos-${name}`] = getComputedStyle(probe).color
    }
    values["--eidos-font-family"] = style.fontFamily
    values["--eidos-color-scheme"] = style.colorScheme
    return values
  } finally {
    probe.remove()
  }
}

export function PluginIcon({
  icon,
  className,
}: {
  icon?: unknown
  className?: string
}) {
  const paths =
    icon &&
    typeof icon === "object" &&
    "paths" in icon &&
    Array.isArray((icon as { paths: unknown[] }).paths)
      ? ((icon as { paths: string[] }).paths as string[])
      : null

  return paths ? (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths.map((path, index) => (
        <path key={index} d={path} />
      ))}
    </svg>
  ) : (
    <Blocks className={className} aria-hidden="true" />
  )
}

function validateSetting(property: any, value: unknown) {
  if (value === undefined) return
  if (property.type === "string") {
    if (typeof value !== "string") throw new Error("Expected string")
    if (property.enum && !property.enum.includes(value))
      throw new Error("Invalid enum value")
  } else if (property.type === "number") {
    if (typeof value !== "number") throw new Error("Expected number")
  } else if (property.type === "boolean") {
    if (typeof value !== "boolean") throw new Error("Expected boolean")
  }
}

interface PluginRequest {
  protocol: typeof PLUGIN_PROTOCOL
  apiVersion: 1
  id: string
  method: string
  params: unknown
}

function PluginFrame({
  pluginId,
  viewId,
  isPublish,
  schema,
  ...props
}: EidosFileViewRendererProps & {
  pluginId: string
  viewId: string
  isPublish: boolean
  schema?: any
}) {
  const { view, table } = props
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const latestProps = useRef(props)
  latestProps.current = props

  const src = useMemo(() => {
    if (!view || !table) return ""
    return `/api/plugins/${encodeURIComponent(pluginId)}/views/${encodeURIComponent(viewId)}?tableId=${encodeURIComponent(table.table.id)}&viewId=${encodeURIComponent(view.id)}`
  }, [pluginId, viewId, table?.table?.id, view?.id])

  // Handle incoming postMessage from the sandboxed iframe
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (
        event.source !== frameRef.current?.contentWindow ||
        !event.data ||
        typeof event.data !== "object"
      ) {
        return
      }
      const data = event.data as Partial<PluginRequest>
      if (
        data.protocol !== PLUGIN_PROTOCOL ||
        data.apiVersion !== 1 ||
        !data.id
      ) {
        return
      }

      const id = data.id
      const method = data.method
      const params = data.params
      const currentProps = latestProps.current

      try {
        if (method === "view.ready") {
          setReady(true)
          frameRef.current?.contentWindow?.postMessage(
            {
              protocol: PLUGIN_PROTOCOL,
              apiVersion: 1,
              observation: "host.theme",
              value: pluginTheme(),
            },
            "*"
          )
          event.source.postMessage(
            { protocol: PLUGIN_PROTOCOL, apiVersion: 1, id, result: null },
            "*"
          )
          return
        }

        if (method === "table.read") {
          const currentView = currentProps.view
          const fields = currentProps.table.fields
          const result = {
            fields,
            view: schema
              ? {
                  ...currentView,
                  properties: {
                    ...currentView?.properties,
                    plugin: {
                      ...Object.fromEntries(
                        Object.entries(schema.properties || {}).map(
                          ([key, property]: [string, any]) => [
                            key,
                            property.default,
                          ]
                        )
                      ),
                      ...((currentView?.properties?.plugin as Record<
                        string,
                        unknown
                      >) ?? {}),
                    },
                  },
                }
              : currentView,
          }
          event.source.postMessage(
            { protocol: PLUGIN_PROTOCOL, apiVersion: 1, id, result },
            "*"
          )
          return
        }

        if (method === "table.page") {
          if (!params || typeof params !== "object" || Array.isArray(params)) {
            throw new Error("Invalid page bounds")
          }
          const { offset, limit } = params as Record<string, unknown>
          if (
            typeof offset !== "number" ||
            !Number.isSafeInteger(offset) ||
            offset < 0 ||
            typeof limit !== "number" ||
            !Number.isSafeInteger(limit) ||
            limit < 1 ||
            limit > 1000
          ) {
            throw new Error("Invalid page bounds")
          }
          const result = await currentProps.source.getPage(
            currentProps.table.table.id,
            offset,
            limit,
            currentProps.query
          )
          event.source.postMessage(
            { protocol: PLUGIN_PROTOCOL, apiVersion: 1, id, result },
            "*"
          )
          return
        }

        if (method === "table.properties") {
          if (
            isPublish ||
            currentProps.disabled ||
            !currentProps.capabilities.mutate
          ) {
            throw new Error("PERMISSION_DENIED: View is read-only")
          }
          if (
            !params ||
            typeof params !== "object" ||
            Array.isArray(params) ||
            JSON.stringify(params).length > 16384
          ) {
            throw new Error("Invalid view properties")
          }
          if (schema?.properties) {
            for (const [key, property] of Object.entries(schema.properties)) {
              if (Object.hasOwn(params, key)) {
                validateSetting(
                  property,
                  (params as Record<string, unknown>)[key]
                )
              }
            }
          }
          const snapshot = await currentProps.source.updateView(
            currentProps.view.id,
            {
              properties: { ...currentProps.view.properties, plugin: params },
            }
          )
          currentProps.onSnapshot?.(snapshot)
          event.source.postMessage(
            { protocol: PLUGIN_PROTOCOL, apiVersion: 1, id, result: null },
            "*"
          )
          return
        }

        if (method === "table.openRecord") {
          const rowId =
            params && typeof params === "object" && "rowId" in params
              ? (params as { rowId: unknown }).rowId
              : undefined
          if (typeof rowId === "string" && rowId.length <= 128) {
            currentProps.onInspectedRowChange?.(rowId)
          }
          event.source.postMessage(
            { protocol: PLUGIN_PROTOCOL, apiVersion: 1, id, result: null },
            "*"
          )
          return
        }

        if (method === "table.aggregate") {
          if (!params || typeof params !== "object" || Array.isArray(params)) {
            throw new Error("Invalid aggregate parameters")
          }
          if (!currentProps.source.aggregateTable) {
            throw new Error("Aggregate is not supported by data source")
          }
          const result = await currentProps.source.aggregateTable(
            currentProps.table.table.id,
            params as any,
            currentProps.query
          )
          event.source.postMessage(
            { protocol: PLUGIN_PROTOCOL, apiVersion: 1, id, result },
            "*"
          )
          return
        }

        if (method === "ui.notify") {
          event.source.postMessage(
            { protocol: PLUGIN_PROTOCOL, apiVersion: 1, id, result: null },
            "*"
          )
          return
        }

        throw new Error(`Unsupported plugin method: ${method}`)
      } catch (cause) {
        event.source.postMessage(
          {
            protocol: PLUGIN_PROTOCOL,
            apiVersion: 1,
            id,
            error: {
              code: "INTERNAL_ERROR",
              message: cause instanceof Error ? cause.message : String(cause),
            },
          },
          "*"
        )
      }
    }

    window.addEventListener("message", handleMessage)
    return () => {
      window.removeEventListener("message", handleMessage)
    }
  }, [isPublish, schema])

  // Broadcast host.table when table, view, query, or reloadToken updates
  useEffect(() => {
    if (ready) {
      frameRef.current?.contentWindow?.postMessage(
        {
          protocol: PLUGIN_PROTOCOL,
          apiVersion: 1,
          observation: "host.table",
          value: null,
        },
        "*"
      )
    }
  }, [ready, props.table, props.view, props.query, props.reloadToken])

  // Broadcast host.theme on appearance or DOM theme class change
  useEffect(() => {
    if (!ready) return
    const sendTheme = () => {
      frameRef.current?.contentWindow?.postMessage(
        {
          protocol: PLUGIN_PROTOCOL,
          apiVersion: 1,
          observation: "host.theme",
          value: pluginTheme(),
        },
        "*"
      )
    }
    const observer = new MutationObserver(sendTheme)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "data-theme"],
    })
    const media = window.matchMedia?.("(prefers-color-scheme: dark)")
    media?.addEventListener("change", sendTheme)
    return () => {
      observer.disconnect()
      media?.removeEventListener("change", sendTheme)
    }
  }, [ready])

  if (error) {
    return (
      <div role="alert" className="p-4 text-sm text-red-500">
        {error}
      </div>
    )
  }

  return (
    <div className="relative w-full h-full flex-1 flex flex-col min-h-0 min-w-0">
      <iframe
        ref={frameRef}
        src={src}
        sandbox="allow-scripts"
        className="w-full h-full flex-1 border-0"
        title="Plugin View"
        onError={() => setError("Failed to load plugin view")}
      />
    </div>
  )
}

export function usePluginTableViews(isPublish: boolean): EidosFilePlugin[] {
  const [listing, setListing] = useState<PluginListing | null>(null)

  useEffect(() => {
    let active = true
    void fetchPlugins()
      .then((data) => {
        if (active) setListing(data)
      })
      .catch(() => {
        if (active) setListing(null)
      })
    return () => {
      active = false
    }
  }, [])

  return useMemo(() => {
    if (!listing?.plugins) return []
    return listing.plugins
      .filter((p) => p.enabled)
      .flatMap(({ manifest }) => {
        const views = (manifest.views ?? []).filter(
          (view) =>
            view.context === "table" &&
            manifest.placements?.some(
              (p) => p.location === "table/view" && p.view === view.id
            )
        )
        if (!views.length) return []
        return [
          {
            id: manifest.id,
            views: views.map((view) => {
              const contribution = `${manifest.id}/${view.id}`
              return {
                type: `plugin:${contribution}`,
                label: view.title,
                description: manifest.name,
                icon: ({ className }: { className?: string }) => (
                  <PluginIcon icon={manifest.icon} className={className} />
                ),
                create: { defaultName: view.title },
                settings: view.configuration
                  ? (props: any) => (
                      <EidosFileSchemaSettings
                        schema={view.configuration as any}
                        fields={props.table.fields}
                        values={
                          (props.view.properties?.plugin ?? {}) as Record<
                            string,
                            unknown
                          >
                        }
                        disabled={isPublish || props.disabled}
                        onUpdate={async (values: Record<string, unknown>) => {
                          if (view.configuration?.properties) {
                            for (const [key, property] of Object.entries(
                              view.configuration.properties
                            )) {
                              if (Object.hasOwn(values, key)) {
                                validateSetting(property, values[key])
                              }
                            }
                          }
                          await props.onUpdate(values)
                        }}
                      />
                    )
                  : undefined,
                renderer: (props: EidosFileViewRendererProps) => (
                  <PluginFrame
                    {...props}
                    pluginId={manifest.id}
                    viewId={view.id}
                    isPublish={isPublish}
                    schema={view.configuration}
                  />
                ),
              }
            }),
          },
        ]
      })
  }, [listing, isPublish])
}
