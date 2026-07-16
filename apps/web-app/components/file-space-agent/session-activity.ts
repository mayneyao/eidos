import { useSyncExternalStore } from "react"

export type FileSpaceAgentSessionStatus =
  | "idle"
  | "queued"
  | "running"
  | "waiting-approval"
  | "failed"

export interface FileSpaceAgentSessionActivity {
  status: FileSpaceAgentSessionStatus
}

type FileSpaceAgentSessionActivities = Readonly<
  Record<string, FileSpaceAgentSessionActivity>
>

const listeners = new Set<() => void>()
const emptySnapshot: FileSpaceAgentSessionActivities = {}
let snapshot: FileSpaceAgentSessionActivities = emptySnapshot

function emitChange() {
  for (const listener of listeners) listener()
}

export function setFileSpaceAgentSessionActivity(
  conversationId: string,
  activity: FileSpaceAgentSessionActivity
) {
  const current = snapshot[conversationId]
  if (current?.status === activity.status) return
  snapshot = { ...snapshot, [conversationId]: activity }
  emitChange()
}

export function clearFileSpaceAgentSessionActivity(conversationId: string) {
  if (!snapshot[conversationId]) return
  const { [conversationId]: _removed, ...remaining } = snapshot
  snapshot = remaining
  emitChange()
}

export function getFileSpaceAgentSessionActivities() {
  return snapshot
}

export function subscribeToFileSpaceAgentSessionActivities(
  listener: () => void
) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useFileSpaceAgentSessionActivities() {
  return useSyncExternalStore(
    subscribeToFileSpaceAgentSessionActivities,
    getFileSpaceAgentSessionActivities,
    () => emptySnapshot
  )
}
