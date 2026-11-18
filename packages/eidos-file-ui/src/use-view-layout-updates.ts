import { useLayoutEffect, useRef, useState } from "react"
import type {
  EidosFileViewInfo,
  UpdateEidosFileViewInput,
} from "@eidos.space/eidos-file"
import { eidosFileViewVisibleSystemFields } from "./eidos-file-field-visibility"

type LayoutChange = Pick<
  UpdateEidosFileViewInput,
  "hiddenFields" | "properties" | "orderMap"
>
type Change = (view: EidosFileViewInfo) => LayoutChange
type Save = (changes: UpdateEidosFileViewInput) => Promise<void> | void
type Operation = { change: Change; save: Save }
type Model = {
  confirmed: EidosFileViewInfo
  incoming: EidosFileViewInfo
  queue: Operation[]
  awaitingSnapshot: boolean
  settled: Promise<boolean>
}

function sameLayout(left: EidosFileViewInfo, right: EidosFileViewInfo) {
  const sorted = (values: readonly string[]) => [...values].sort()
  return (
    JSON.stringify(sorted(left.hiddenFields)) ===
      JSON.stringify(sorted(right.hiddenFields)) &&
    JSON.stringify(sorted(eidosFileViewVisibleSystemFields(left))) ===
      JSON.stringify(sorted(eidosFileViewVisibleSystemFields(right))) &&
    JSON.stringify(Object.entries(left.orderMap ?? {}).sort()) ===
      JSON.stringify(Object.entries(right.orderMap ?? {}).sort())
  )
}

function apply(
  view: EidosFileViewInfo,
  changes: LayoutChange
): EidosFileViewInfo {
  return {
    ...view,
    hiddenFields: changes.hiddenFields ?? view.hiddenFields,
    properties: changes.properties ?? view.properties,
    orderMap: changes.orderMap ?? view.orderMap,
  }
}

/** Project local layout intents immediately, and rebase each save after the previous result. */
export function useViewLayoutUpdates(
  view: EidosFileViewInfo,
  onUpdate: Save,
  fallbackError: string
) {
  const model = useRef<Model | null>(null)
  if (!model.current || model.current.confirmed.id !== view.id) {
    model.current = {
      confirmed: view,
      incoming: view,
      queue: [],
      awaitingSnapshot: false,
      settled: Promise.resolve(true),
    }
  }
  const current = model.current
  current.incoming = view
  const [draft, setDraft] = useState<EidosFileViewInfo | null>(null)
  const [pendingSaves, setPendingSaves] = useState(0)
  const [error, setError] = useState<string | null>(null)
  useLayoutEffect(() => {
    setError(null)
  }, [current])
  useLayoutEffect(() => {
    if (current.queue.length) return
    if (current.awaitingSnapshot && !sameLayout(view, current.confirmed)) return
    current.confirmed = view
    current.awaitingSnapshot = false
    setDraft(null)
  }, [view, current])

  const project = (target: Model) =>
    target.queue.reduce(
      (next, operation) => apply(next, operation.change(next)),
      target.confirmed
    )
  const enqueue = (change: Change) => {
    current.queue.push({ change, save: onUpdate })
    setError(null)
    setDraft(project(current))
    if (current.queue.length > 1) return
    setPendingSaves((count) => count + 1)
    current.settled = (async () => {
      let succeeded = true
      while (current.queue.length) {
        const operation = current.queue[0]!
        const changes = operation.change(current.confirmed)
        try {
          await operation.save(changes)
          current.confirmed = apply(current.confirmed, changes)
        } catch (cause) {
          succeeded = false
          if (model.current === current)
            setError(cause instanceof Error ? cause.message : fallbackError)
        }
        current.queue.shift()
        if (model.current === current) setDraft(project(current))
      }
      current.awaitingSnapshot = !sameLayout(
        current.incoming,
        current.confirmed
      )
      if (model.current === current) {
        if (!current.awaitingSnapshot) setDraft(null)
      }
      setPendingSaves((count) => count - 1)
      return succeeded
    })()
  }
  const projected = draft?.id === view.id ? draft : view
  return {
    view: {
      ...view,
      hiddenFields: projected.hiddenFields,
      properties: projected.properties,
      orderMap: projected.orderMap,
    },
    busy: pendingSaves > 0,
    error,
    enqueue,
    settle: () =>
      current.queue.length ? current.settled : Promise.resolve(true),
    clearError: () => setError(null),
  }
}
