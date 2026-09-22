import { useEffect, useMemo, useRef, useState } from "react"
import { PluginIcon } from "./plugin-icon"
import { EidosFileSchemaSettings } from "@eidos.space/eidos-file-ui"
import { validateSetting } from "@eidos.space/plugin-runtime/manifest"
import type { ViewConfiguration } from "@eidos.space/plugin-runtime/contracts"
import type {
  EidosFilePlugin,
  EidosFileViewRendererProps,
} from "@eidos.space/eidos-file-ui"
import type { PluginRequest } from "@eidos.space/plugin-runtime/rpc"
import type { PluginListing, PluginOpenResult } from "../shared/plugins"
import { PluginEditor } from "./plugin-editor"
import type { JsonObject } from "@eidos.space/eidos-file"

/** IDs come only from this mounted host view, never from guest request arguments. */
export async function tableViewRequest(
  props: EidosFileViewRendererProps,
  request: PluginRequest,
  schema?: ViewConfiguration,
  pluginId?: string
): Promise<unknown> {
  const { view, table, source } = props
  if (!view) throw new Error("Table view is unavailable")
  const params = request.params
  if (
    request.method === "table.pluginConfig.read" ||
    request.method === "table.pluginConfig.write"
  ) {
    if (!pluginId) throw new Error("Plugin binding is unavailable")
    if (request.method === "table.pluginConfig.read") {
      if (params !== null) throw new Error("Unexpected config parameters")
      if (!source.readTablePluginConfig)
        throw new Error("Plugin config is unsupported")
      return source.readTablePluginConfig(table.table.id, pluginId)
    }
    if (props.disabled || !props.capabilities.mutate)
      throw new Error("Table is read-only")
    if (
      !params ||
      typeof params !== "object" ||
      Array.isArray(params) ||
      Object.keys(params).sort().join() !== "expectedVersion,value" ||
      !("expectedVersion" in params) ||
      typeof params.expectedVersion !== "string" ||
      !("value" in params) ||
      (params.value !== null &&
        (typeof params.value !== "object" || Array.isArray(params.value)))
    )
      throw new Error("Invalid plugin config request")
    if (!source.writeTablePluginConfig)
      throw new Error("Plugin config is unsupported")
    const result = await source.writeTablePluginConfig(
      table.table.id,
      pluginId,
      {
        value: params.value as JsonObject | null,
        expectedVersion: params.expectedVersion,
      }
    )
    props.onSnapshot?.(await source.getSnapshot())
    return result
  }
  if (request.method === "table.read")
    return {
      fields: table.fields,
      view: schema
        ? {
            ...view,
            properties: {
              ...view.properties,
              plugin: {
                ...Object.fromEntries(
                  Object.entries(schema.properties).map(([key, property]) => [
                    key,
                    property.default,
                  ])
                ),
                ...((view.properties?.plugin as Record<string, unknown>) ?? {}),
              },
            },
          }
        : view,
    }
  if (request.method === "table.page") {
    if (!params || typeof params !== "object" || Array.isArray(params))
      throw new Error("Invalid page")
    const { offset, limit } = params as Record<string, unknown>
    if (
      Object.keys(params).some((key) => !["offset", "limit"].includes(key)) ||
      typeof offset !== "number" ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      typeof limit !== "number" ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 1000
    )
      throw new Error("Invalid page bounds")
    return source.getPage(table.table.id, offset, limit, props.query)
  }
  if (request.method === "table.properties") {
    if (props.disabled || !props.capabilities.mutate)
      throw new Error("View is read-only")
    if (
      !params ||
      typeof params !== "object" ||
      Array.isArray(params) ||
      JSON.stringify(params).length > 16384
    )
      throw new Error("Invalid view properties")
    for (const [key, property] of Object.entries(schema?.properties ?? {})) {
      if (Object.hasOwn(params, key))
        validateSetting(property, (params as Record<string, unknown>)[key])
    }
    const snapshot = await source.updateView(view.id, {
      properties: { ...view.properties, plugin: params },
    })
    props.onSnapshot?.(snapshot)
    return null
  }
  if (request.method === "table.openRecord") {
    const rowId =
      params && typeof params === "object" && "rowId" in params
        ? params.rowId
        : undefined
    if (typeof rowId !== "string" || rowId.length > 128)
      throw new Error("Invalid row")
    const row = await source.getRow?.(table.table.id, rowId)
    if (!row) throw new Error("Record is unavailable")
    props.onInspectedRowChange?.(rowId)
    return null
  }
  if (request.method === "table.aggregate") {
    if (!params || typeof params !== "object" || Array.isArray(params))
      throw new Error("Invalid aggregate parameters")
    const { metric } = params as Record<string, unknown>
    if (!metric || typeof metric !== "object" || Array.isArray(metric))
      throw new Error("Invalid aggregate metric")
    const op = (metric as Record<string, unknown>).op
    if (
      typeof op !== "string" ||
      !["count", "sum", "average", "min", "max"].includes(op)
    )
      throw new Error("Invalid metric operation")
    if (!source.aggregateTable)
      throw new Error("Aggregate is not supported by data source")
    return source.aggregateTable(table.table.id, params as any, props.query)
  }
  throw new Error("Unsupported table method")
}

function TableView({
  contribution,
  schema,
  ...props
}: EidosFileViewRendererProps & {
  contribution: string
  schema?: ViewConfiguration
}) {
  const [instance, setInstance] = useState<PluginOpenResult["instance"]>(null)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const latest = useRef(props)
  latest.current = props
  useEffect(() => {
    let active = true
    let ticket: string | undefined
    setInstance(null)
    setError(null)
    if (props.view)
      void window.eidosLite
        .openPluginTable(contribution, props.table.table.id, props.view.id)
        .then((result) => {
          ticket = result.instance?.ticket
          if (active) setInstance(result.instance)
          else if (ticket) void window.eidosLite.closePluginEditor(ticket)
        })
        .catch((cause) => {
          if (active) setError(String(cause))
        })
    return () => {
      active = false
      if (ticket) void window.eidosLite.closePluginEditor(ticket)
    }
  }, [contribution, props.table.table.id, props.view?.id, retry])
  const revision = useMemo(
    () => ({}),
    [props.table, props.view, props.query, props.reloadToken]
  )
  if (error)
    return (
      <div role="alert">
        {error}
        <button onClick={() => setRetry((value) => value + 1)}>Retry</button>
      </div>
    )
  return instance ? (
    <PluginEditor
      key={instance.ticket}
      instance={instance}
      onDraft={() => {}}
      onRetry={() => setRetry((value) => value + 1)}
      onFallback={() => setError("Choose another view from the view menu.")}
      onTableRequest={(request) =>
        tableViewRequest(
          latest.current,
          request,
          schema,
          contribution.split("/")[0]
        )
      }
      tableRevision={revision}
    />
  ) : (
    <div className="plugin-editor" aria-label="Loading table view" />
  )
}

export function usePluginTableViews(): EidosFilePlugin[] {
  const [listing, setListing] = useState<PluginListing | null>(null)
  useEffect(() => {
    if (!window.eidosLite?.listPlugins) return
    let active = true,
      generation = 0
    const refresh = () => {
      const current = ++generation
      void window.eidosLite
        ?.listPlugins?.()
        .then((value) => {
          if (active && current === generation) setListing(value)
        })
        .catch(() => {
          if (active) setListing(null)
        })
    }
    refresh()
    const unsubscribe = window.eidosLite?.onPluginEvent?.(({ event }) => {
      if (event.observation === "host.catalog") refresh()
    })
    return () => {
      active = false
      unsubscribe?.()
    }
  }, [])
  return useMemo(
    () =>
      (listing?.plugins ?? [])
        .filter((plugin) => plugin.enabled)
        .flatMap(({ manifest }) => {
          const views = (manifest.views ?? []).filter(
            (view) =>
              view.context === "table" &&
              manifest.placements?.some(
                (p) => p.location === "table/view" && p.view === view.id
              )
          )
          return views.length
            ? [
                {
                  id: manifest.id,
                  views: views.map((view) => {
                    const contribution = `${manifest.id}/${view.id}`
                    return {
                      type: `plugin:${contribution}`,
                      label: view.title,
                      description: manifest.name,
                      icon: ({ className }: { className?: string }) => (
                        <PluginIcon
                          icon={manifest.icon}
                          className={className}
                        />
                      ),
                      create: { defaultName: view.title },
                      settings: view.configuration
                        ? (props) => (
                            <EidosFileSchemaSettings
                              {...props}
                              schema={view.configuration!}
                              values={
                                (props.view.properties?.plugin ?? {}) as Record<
                                  string,
                                  unknown
                                >
                              }
                              onUpdate={async (values) => {
                                for (const [key, property] of Object.entries(
                                  view.configuration!.properties
                                ))
                                  if (Object.hasOwn(values, key))
                                    validateSetting(property, values[key])
                                await props.onUpdate(values)
                              }}
                            />
                          )
                        : undefined,
                      renderer: (props: EidosFileViewRendererProps) => (
                        <TableView
                          {...props}
                          contribution={contribution}
                          schema={view.configuration}
                        />
                      ),
                    }
                  }),
                },
              ]
            : []
        }),
    [listing]
  )
}
