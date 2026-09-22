import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
  EidosFileTableActionsContext,
  type EidosFileActionTarget,
  type EidosFileViewRendererProps,
} from "@eidos.space/eidos-file-ui"
import {
  canonicalizeEidosFileJson,
  type EidosFileDataSource,
  type EidosFileSnapshot,
  type EidosFileTableSnapshot,
  type EidosFileViewInfo,
  type EidosFileRowQuery,
  type LogicalValue,
} from "@eidos.space/eidos-file"
import type { PluginManifest, TableActionItem } from "@eidos.space/plugin-sdk"
import type { PluginRequest } from "@eidos.space/plugin-runtime/rpc"
import type { PluginOpenResult } from "../shared/plugins"
import { PluginEditor } from "./plugin-editor"
import { tableViewRequest } from "./plugin-table-view"
import { TableActionSession } from "./table-action-session"
import { useEidosLiteI18n } from "./i18n"
import { PluginIcon } from "./plugin-icon"
import { PluginTaskCard } from "./plugin-task-card"
import { createTaskProgress } from "./task-progress"
import { Redo2, Undo2 } from "lucide-react"
import { validateIconDefinition } from "@eidos.space/plugin-runtime/manifest"

interface Props {
  source: EidosFileDataSource
  table: EidosFileTableSnapshot
  view?: EidosFileViewInfo
  query: EidosFileRowQuery
  disabled: boolean
  onSnapshot(snapshot: EidosFileSnapshot): void
  children: ReactNode
}
interface Runner {
  list(
    target: EidosFileActionTarget
  ): Promise<Array<{ id: string; title: string; icon?: ReactNode }>>
  run(id: string, target: EidosFileActionTarget): void
}
type Instance = NonNullable<PluginOpenResult["instance"]>
type Output = { readToken: string; values: Record<string, LogicalValue> }
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid action request")
  return value as Record<string, unknown>
}

function taskError(error: unknown) {
  return String(error)
    .replace(/^(?:Error:\s*)+/, "")
    .replace(/^Error invoking remote method '[^']+':\s*/, "")
    .replace(/^(?:Error:\s*)+/, "")
}

export function PluginTableActions(props: Props) {
  const [plugins, setPlugins] = useState<
    Array<{ manifest: PluginManifest; hash: string }>
  >([])
  const [catalogRevision, setCatalogRevision] = useState(0)
  const runners = useRef(new Map<string, Runner>())
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    const load = () => {
      void window.eidosLite
        .listPlugins()
        .then((listing) => {
          if (active)
            setPlugins(
              listing.plugins.filter(
                (p) =>
                  p.enabled &&
                  p.manifest.actions?.some((a) => a.context === "table")
              )
            )
        })
        .catch(() => {})
    }
    load()
    const stop = window.eidosLite.onPluginEvent(({ event }) => {
      if (event.observation === "host.catalog") load()
    })
    return () => {
      active = false
      stop()
    }
  }, [catalogRevision])
  const actions = useMemo(
    () => ({
      async list(target: EidosFileActionTarget) {
        if (props.disabled) return []
        return (
          await Promise.all(
            [...runners.current.values()].map((runner) => runner.list(target))
          )
        ).flat()
      },
      run(id: string, target: EidosFileActionTarget) {
        if (!props.disabled)
          runners.current.get(id.split("/")[0]!)?.run(id, target)
      },
    }),
    [props.disabled, revision]
  )
  return (
    <EidosFileTableActionsContext.Provider value={actions}>
      <div className="relative flex h-full min-h-0 w-full flex-col">
        <div className="pointer-events-none absolute bottom-4 right-4 z-30 flex max-h-[calc(100%-2rem)] max-w-[calc(100%-2rem)] flex-col items-end gap-2 overflow-y-auto p-1">
          {plugins.map(({ manifest, hash }) => (
            <TableRunner
              key={`${manifest.id}:${hash}:${catalogRevision}:${props.table.table.id}:${props.view?.id}`}
              {...props}
              manifest={manifest}
              restart={() => setCatalogRevision((value) => value + 1)}
              register={(runner) => {
                if (runner) runners.current.set(manifest.id, runner)
                else runners.current.delete(manifest.id)
                setRevision((v) => v + 1)
              }}
            />
          ))}
        </div>

        <div className="min-h-0 flex-1">{props.children}</div>
      </div>
    </EidosFileTableActionsContext.Provider>
  )
}

function TableRunner(
  props: Props & {
    manifest: PluginManifest
    restart(): void
    register(runner: Runner | null): void
  }
) {
  const { t } = useEidosLiteI18n()
  const latest = useRef(props)
  latest.current = props
  const [instance, setInstance] = useState<Instance | null>(null)
  const [event, setEvent] = useState<{ observation: string; value: unknown }>()
  const [status, setStatus] = useState("")
  const [taskMessage, setTaskMessage] = useState("")
  const [needsRestart, setNeedsRestart] = useState(false)
  const [busy, setBusy] = useState(false)
  const [undoing, setUndoing] = useState(false)
  const running = useRef(false)
  const [title, setTitle] = useState(props.manifest.name)
  const [actionIcon, setActionIcon] = useState<TableActionItem["icon"]>()
  const [completed, setCompleted] = useState(0)
  const progress = useMemo(
    () =>
      createTaskProgress<{ count: number; status: string }>((value) => {
        setCompleted(value.count)
        setStatus(value.status)
      }),
    []
  )
  const [runNumber, setRunNumber] = useState(0)
  const actionItems = useRef(new Map<string, TableActionItem>())
  const session = useRef<TableActionSession | null>(null)
  const active = useRef(true)
  const pending = useRef<{
    id: string
    operation: "list" | "run"
    provider: string
    resolve(items: TableActionItem[]): void
    reject(error: Error): void
    timer: ReturnType<typeof setTimeout>
  } | null>(null)
  const ready = useRef(false)
  const listing = useRef<Promise<
    Array<TableActionItem & { provider: string }>
  > | null>(null)
  const hostProps = (): EidosFileViewRendererProps => ({
    ...latest.current,
    search: "",
    reloadToken: 0,
    commands: [],
    selection: { rowIds: [] },
    state: {},
    capabilities: {
      read: true,
      mutate: !latest.current.disabled,
      rawFile: false,
      nativeFileSystem: false,
      resolveAssets: false,
    },
  })
  const send = (
    operation: "list" | "run",
    provider: string,
    itemId?: string
  ): Promise<TableActionItem[]> => {
    if (!ready.current || pending.current)
      return Promise.reject(new Error("Plugin is not ready or is busy"))
    const id = crypto.randomUUID()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => {
          if (operation === "run") {
            cancel()
            return
          }
          pending.current = null
          reject(new Error("Table action timed out"))
          setEvent({ observation: "host.tableAction.abort", value: id })
        },
        operation === "list" ? 15000 : 30 * 60 * 1000
      )
      pending.current = { id, operation, provider, resolve, reject, timer }
      setEvent({
        observation: "host.tableAction",
        value: {
          id,
          operation,
          provider,
          itemId,
          tableId: props.table.table.id,
          viewId: props.view?.id ?? "",
          count: session.current?.ids.length ?? 0,
        },
      })
    })
  }
  const runner: Runner = {
    async list(target) {
      if (!ready.current || running.current) return []
      const kind =
        target.ranges === null
          ? "view"
          : target.ranges.reduce((n, r) => n + r.endIndex - r.startIndex, 0) > 1
            ? "selection"
            : "row"
      if (!listing.current) {
        listing.current = (async () => {
          const items: Array<TableActionItem & { provider: string }> = []
          for (const declaration of props.manifest.actions ?? []) {
            if (
              declaration.context !== "table" ||
              !props.manifest.placements?.some(
                (p) =>
                  p.location === "table/context" && p.action === declaration.id
              )
            )
              continue
            for (const item of await send("list", declaration.id)) {
              items.push({ ...item, provider: declaration.id })
              actionItems.current.set(
                `${props.manifest.id}/${declaration.id}/${item.id}`,
                item
              )
            }
          }
          return items
        })().finally(() => {
          listing.current = null
        })
      }
      return (await listing.current)
        .filter((item) => item.targets.includes(kind))
        .map((item) => ({
          id: `${props.manifest.id}/${item.provider}/${item.id}`,
          title: item.title,
          icon: (
            <PluginIcon
              icon={item.icon ?? props.manifest.icon}
              id={props.manifest.id}
              name={item.title}
              className="h-3.5 w-3.5 shrink-0"
            />
          ),
        }))
    },
    run(id, target) {
      if (pending.current || running.current || latest.current.disabled) return
      running.current = true
      const [, provider, itemId] = id.split("/")
      setTitle(actionItems.current.get(id)?.title ?? props.manifest.name)
      setActionIcon(actionItems.current.get(id)?.icon)
      setRunNumber((n) => n + 1)
      progress.cancel()
      setTaskMessage("")
      setCompleted(0)
      session.current?.dispose()
      const run = new TableActionSession(props.source, props.table.table.id)
      session.current = run
      setBusy(true)
      setStatus(t("Capturing records…"))
      void (async () => {
        try {
          await run.capture(
            structuredClone(latest.current.query),
            target.ranges
          )
          if (!run.ids.length) {
            setStatus(t("No records to process"))
            return
          }
          setStatus(
            t("Processing {count} / {total} records", {
              count: 0,
              total: run.ids.length,
            })
          )
          await send("run", provider!, itemId)
          progress.flush()
          setStatus(
            t("Done · {count} updated · {unchanged} unchanged", {
              count: run.undo.length,
              unchanged: run.unchanged,
            })
          )
        } catch (error) {
          progress.flush()
          if (active.current)
            setStatus(
              run.controller.signal.aborted
                ? t("Cancelled · {count} completed records retained", {
                    count: run.undo.length,
                  })
                : t(taskError(error))
            )
        } finally {
          running.current = false
          if (active.current) {
            setBusy(false)
            try {
              const snapshot = await props.source.getSnapshot()
              if (active.current) props.onSnapshot(snapshot)
            } catch (error) {
              if (active.current) setStatus(t(taskError(error)))
            }
          }
        }
      })()
    },
  }
  const runnerRef = useRef(runner)
  runnerRef.current = runner
  useEffect(() => {
    active.current = true
    let live = true
    let ticket: string | undefined
    void window.eidosLite
      .openPluginExtension(props.manifest.id, {
        tableId: props.table.table.id,
        viewId: props.view?.id ?? "",
      })
      .then((opened) => {
        ticket = opened.instance?.ticket
        if (live) setInstance(opened.instance ?? null)
        else if (ticket) void window.eidosLite.closePluginEditor(ticket)
      })
      .catch((error) => {
        if (live) setStatus(t(taskError(error)))
      })
    return () => {
      live = false
      active.current = false
      progress.cancel()
      ready.current = false
      session.current?.dispose()
      latest.current.register(null)
      if (pending.current) {
        clearTimeout(pending.current.timer)
        pending.current.reject(new Error("Table closed"))
        pending.current = null
      }
      if (ticket) void window.eidosLite.closePluginEditor(ticket)
    }
  }, [])
  const request = async (request: PluginRequest) => {
    const p = object(request.params)
    if (request.method === "table.actions.ready") {
      ready.current = true
      latest.current.register({
        list: (target) => runnerRef.current.list(target),
        run: (id, target) => runnerRef.current.run(id, target),
      })
      return null
    }
    const job = pending.current
    if (!job || p.runId !== job.id) throw new Error("Action has expired")
    if (request.method === "table.actions.result") {
      clearTimeout(job.timer)
      pending.current = null
      if (p.error) job.reject(new Error(String(p.error)))
      else {
        try {
          const items = job.operation === "list" ? p.items : []
          if (!Array.isArray(items) || items.length > 100)
            throw new Error("Invalid menu items")
          const ids = new Set<string>()
          for (const raw of items) {
            const item = object(raw)
            if (
              typeof item.id !== "string" ||
              !/^[a-zA-Z0-9_-]{1,64}$/.test(item.id) ||
              ids.has(item.id) ||
              typeof item.title !== "string" ||
              !item.title.trim() ||
              item.title.length > 200 ||
              !Array.isArray(item.targets) ||
              item.targets.some(
                (v) => !["row", "selection", "view"].includes(String(v))
              )
            )
              throw new Error("Invalid menu item")
            if (item.icon !== undefined) {
              const icon = object(item.icon)
              if (Object.keys(icon).join() !== "paths")
                throw new Error("Menu icons require SVG paths")
              validateIconDefinition(icon)
            }
            ids.add(item.id)
          }
          job.resolve(items as TableActionItem[])
        } catch (error) {
          job.reject(error as Error)
        }
      }
      return null
    }
    if (
      request.method === "table.read" ||
      request.method === "table.pluginConfig.read"
    )
      return tableViewRequest(
        hostProps(),
        { ...request, params: p.args },
        undefined,
        props.manifest.id
      )
    const run = session.current
    if (job.operation !== "run" || !run || latest.current.disabled)
      throw new Error("Capability is unavailable while listing actions")
    run.controller.signal.throwIfAborted()
    const args = object(p.args)
    if (request.method === "table.target.read")
      return run.read(
        Number(args.offset),
        Number(args.limit),
        args.fields as string[]
      )
    if (request.method === "table.target.update") {
      if (
        props.manifest.actions?.find((a) => a.id === job.provider)?.access !==
        "write"
      )
        throw new Error("Action is read-only")
      await run.update(
        String(args.readToken),
        args.values as Record<string, LogicalValue>
      )
      if (active.current) {
        const count = run.undo.length + run.unchanged
        progress.update({
          count,
          status: t("Processing {count} / {total} records", {
            count,
            total: run.ids.length,
          }),
        })
        const snapshot = await props.source.getSnapshot()
        if (active.current) props.onSnapshot(snapshot)
      }
      return null
    }
    if (request.method === "table.connection.request") {
      if (!instance) throw new Error("Plugin closed")
      const result = await window.eidosLite.pluginConnection(
        instance.ticket,
        String(args.connection),
        "request",
        args.body
      )
      run.controller.signal.throwIfAborted()
      return result
    }
    if (request.method === "table.task.report") {
      if (
        !Number.isSafeInteger(args.completed) ||
        Number(args.completed) < 0 ||
        Number(args.completed) > run.ids.length
      )
        throw new Error("Invalid progress")
      const count = Number(args.completed)
      if (typeof args.message === "string")
        setTaskMessage(args.message.slice(0, 300))
      progress.update({
        count,
        status: t("Processing {count} / {total} records", {
          count,
          total: run.ids.length,
        }),
      })
      return null
    }
    if (request.method === "table.task.preview") {
      if (
        run.approved ||
        !Array.isArray(args.rows) ||
        !args.rows.length ||
        args.rows.length > 3 ||
        args.rows.some((raw) => !run.records.has(String(object(raw).readToken)))
      )
        throw new Error("Invalid preview")
      if (canonicalizeEidosFileJson(args.rows).length > 65536)
        throw new Error("Preview exceeds its size limit")
      for (const raw of args.rows) {
        const entry = object(raw)
        object(entry.values)
      }
      // Legacy sample API declares the output scope; execution is now direct.
      run.approve(args.rows as Output[])
      return true
    }
    throw new Error("Unsupported table action API")
  }
  const cancel = () => {
    session.current?.cancel()
    if (instance)
      for (const id of Object.keys(props.manifest.connections ?? {}))
        void window.eidosLite
          .pluginConnection(instance.ticket, id, "cancel")
          .catch(() => {})
    const job = pending.current
    if (job) {
      setEvent({ observation: "host.tableAction.abort", value: job.id })
      void session.current?.settled().then(() => {
        if (pending.current === job) {
          clearTimeout(job.timer)
          pending.current = null
          job.reject(new Error("Action cancelled"))
        }
      })
    }
  }
  return (
    <div className="min-w-0">
      {(status ||
        busy ||
        needsRestart ||
        !!session.current?.undo.length ||
        !!session.current?.redo.length) && (
        <PluginTaskCard
          key={runNumber}
          title={title}
          icon={
            <PluginIcon
              icon={actionIcon ?? props.manifest.icon}
              id={props.manifest.id}
              name={title}
              className="h-4 w-4 shrink-0 text-primary"
            />
          }
          busy={busy}
          status={status}
          completed={completed}
          total={session.current?.ids.length ?? 0}
        >
          {taskMessage && (
            <p className="text-muted-foreground tabular-nums break-words">
              {taskMessage}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {needsRestart && !busy && (
              <button
                className="rounded border border-border px-2.5 py-1.5 hover:bg-accent"
                onClick={props.restart}
              >
                {t("Retry")}
              </button>
            )}
            {busy && !undoing && (
              <button
                className="rounded border border-border px-2.5 py-1.5 hover:bg-accent"
                onClick={cancel}
              >
                {t("Stop")}
              </button>
            )}
            {!busy &&
              (["undo", "redo"] as const).map((direction) => {
                const available = !!session.current?.[direction].length
                if (
                  !session.current?.undo.length &&
                  !session.current?.redo.length
                )
                  return null
                return (
                  <button
                    key={direction}
                    disabled={!available}
                    className="inline-flex items-center gap-1.5 rounded border border-border px-2.5 py-1.5 hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent"
                    onClick={() => {
                      if (running.current || !available) return
                      running.current = true
                      setUndoing(true)
                      setBusy(true)
                      setStatus(
                        t(
                          direction === "undo"
                            ? "Undoing changes…"
                            : "Redoing changes…"
                        )
                      )
                      void session
                        .current!.revert(direction)
                        .then(() => {
                          if (active.current)
                            setStatus(
                              t(
                                direction === "undo"
                                  ? "Run undone"
                                  : "Run redone"
                              )
                            )
                        })
                        .catch((error) => {
                          if (active.current) setStatus(t(taskError(error)))
                        })
                        .finally(async () => {
                          try {
                            if (active.current) {
                              const snapshot = await props.source.getSnapshot()
                              if (active.current) props.onSnapshot(snapshot)
                            }
                          } catch (error) {
                            if (active.current) setStatus(t(taskError(error)))
                          } finally {
                            running.current = false
                            if (active.current) {
                              setBusy(false)
                              setUndoing(false)
                            }
                          }
                        })
                    }}
                  >
                    {direction === "undo" ? (
                      <Undo2 className="h-3.5 w-3.5" />
                    ) : (
                      <Redo2 className="h-3.5 w-3.5" />
                    )}
                    {t(
                      direction === "undo" ? "Undo this run" : "Redo this run"
                    )}
                  </button>
                )
              })}
          </div>
        </PluginTaskCard>
      )}
      {instance && (
        <div hidden>
          <PluginEditor
            instance={instance}
            onDraft={() => {}}
            onFallback={cancel}
            onRetry={props.restart}
            onError={(message) => {
              ready.current = false
              setStatus(t(taskError(message)))
              setNeedsRestart(true)
            }}
            onTableRequest={request}
            hostEvent={event}
          />
        </div>
      )}
    </div>
  )
}
