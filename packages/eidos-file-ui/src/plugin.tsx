import { Fragment, useMemo, type ComponentType, type ReactNode } from "react"
import type {
  EidosFileFieldInfo,
  EidosFileSnapshot,
  EidosFileTableSnapshot,
  EidosFileViewInfo,
} from "@eidos.space/eidos-file"

import type { EidosFileEditorDataSource } from "./data-source"
import type { EidosFileViewRenderer } from "./eidos-file-editor-view"

export type EidosFilePluginSlot = "empty-state" | "sheet-create" | "workbar"

export interface EidosFilePluginContext {
  source: EidosFileEditorDataSource
  snapshot: EidosFileSnapshot
  activeTable?: EidosFileTableSnapshot | null
  activeView?: EidosFileViewInfo | null
  disabled: boolean
  onSnapshot: (snapshot: EidosFileSnapshot) => void
  onTableSelect?: (tableId: string) => void
  onError?: (error: unknown) => void
}

export interface EidosFileViewPluginContribution {
  /** Stable value persisted in `eidos__views.type`. */
  type: string
  label: string
  description: string
  icon?: ComponentType<{ className?: string }>
  renderer: EidosFileViewRenderer
  /** Defaults used by hosts that expose view creation. */
  create?: {
    defaultName: string
    isAvailable?: (fields: readonly EidosFileFieldInfo[]) => boolean
    properties?: (
      fields: readonly EidosFileFieldInfo[]
    ) => Record<string, unknown> | undefined
  }
}

export interface EidosFileActionPluginContribution {
  id: string
  slot: EidosFilePluginSlot
  order?: number
  render: (context: EidosFilePluginContext) => ReactNode
}

/**
 * A trusted Eidos File editor composition unit.
 *
 * Plugins are imported by the host application. They are not Eidos Space
 * extensions: there is no manifest, installation lifecycle, sandbox, or raw
 * SQLite/file-handle access. Runtime semantics stay behind public adapters.
 */
export interface EidosFilePlugin {
  id: string
  views?: readonly EidosFileViewPluginContribution[]
  actions?: readonly EidosFileActionPluginContribution[]
}

export interface EidosFilePluginRegistry {
  plugins: readonly EidosFilePlugin[]
  views: Readonly<Record<string, EidosFileViewPluginContribution>>
  viewRenderers: Readonly<Record<string, EidosFileViewRenderer>>
  actions: Readonly<
    Record<EidosFilePluginSlot, EidosFileActionPluginContribution[]>
  >
}

export function defineEidosFilePlugin<T extends EidosFilePlugin>(plugin: T): T {
  return plugin
}

function assertUnique(seen: Set<string>, value: string, kind: string): void {
  if (!value.trim()) throw new Error(`Eidos File ${kind} identifier is empty`)
  if (seen.has(value)) {
    throw new Error(`Duplicate Eidos File ${kind}: ${value}`)
  }
  seen.add(value)
}

export function createEidosFilePluginRegistry(
  plugins: readonly EidosFilePlugin[]
): EidosFilePluginRegistry {
  const pluginIds = new Set<string>()
  const viewTypes = new Set<string>(["grid"])
  const actionIds = new Set<string>()
  const views: Record<string, EidosFileViewPluginContribution> = {}
  const viewRenderers: Record<string, EidosFileViewRenderer> = {}
  const actions: Record<
    EidosFilePluginSlot,
    EidosFileActionPluginContribution[]
  > = {
    "empty-state": [],
    "sheet-create": [],
    workbar: [],
  }

  for (const plugin of plugins) {
    assertUnique(pluginIds, plugin.id, "plugin")
    for (const view of plugin.views ?? []) {
      assertUnique(viewTypes, view.type, "view type")
      views[view.type] = view
      viewRenderers[view.type] = view.renderer
    }
    for (const action of plugin.actions ?? []) {
      assertUnique(actionIds, action.id, "action")
      actions[action.slot].push(action)
    }
  }

  for (const slot of Object.keys(actions) as EidosFilePluginSlot[]) {
    actions[slot].sort(
      (left, right) =>
        (left.order ?? 0) - (right.order ?? 0) ||
        left.id.localeCompare(right.id)
    )
  }

  return { plugins: [...plugins], views, viewRenderers, actions }
}

export function EidosFilePluginSlot({
  context,
  plugins,
  slot,
}: {
  context: EidosFilePluginContext
  plugins: readonly EidosFilePlugin[]
  slot: EidosFilePluginSlot
}) {
  const registry = useMemo(
    () => createEidosFilePluginRegistry(plugins),
    [plugins]
  )
  return registry.actions[slot].map((action) => (
    <Fragment key={action.id}>{action.render(context)}</Fragment>
  ))
}
