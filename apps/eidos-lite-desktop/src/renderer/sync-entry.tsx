import type { ComponentProps } from "react"
import { OpenSyncedSpacePanel } from "./open-synced-space-panel"
import { SyncPanel } from "./sync-panel"

export function SyncEntry(props: ComponentProps<typeof SyncPanel>) {
  if (props.mode === "clone") {
    return (
      <OpenSyncedSpacePanel
        variant={props.variant}
        platform={props.platform ?? "unknown"}
        onClose={props.onClose}
        onClone={props.onClone}
      />
    )
  }
  return <SyncPanel {...props} />
}
