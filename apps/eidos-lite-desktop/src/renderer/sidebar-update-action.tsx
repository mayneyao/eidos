import { RotateCcw } from "lucide-react"

import type { EidosLiteUpdateStatus } from "../shared/contracts"

interface SidebarUpdateActionProps {
  label: string
  description: string
  onRestart(): void
}

export function isSidebarUpdateReady(
  status: EidosLiteUpdateStatus | null
): status is EidosLiteUpdateStatus & { state: "downloaded" } {
  return status?.state === "downloaded"
}

export function SidebarUpdateAction({
  label,
  description,
  onRestart,
}: SidebarUpdateActionProps) {
  return (
    <footer className="sidebar-update-action" data-sidebar-update-ready>
      <button
        type="button"
        className="sidebar-update-button"
        onClick={onRestart}
      >
        <RotateCcw aria-hidden="true" />
        <span>
          <strong>{label}</strong>
          <small>{description}</small>
        </span>
      </button>
    </footer>
  )
}
