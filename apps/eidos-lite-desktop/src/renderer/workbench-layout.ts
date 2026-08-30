import type { EidosLiteTerminalLayout } from "../shared/contracts"

export type WorkbenchAuxiliaryView = "history" | "sync" | null
export type WorkbenchContentSurface = "file" | "diff" | "merge"
export type WorkbenchRightSidebarView = "history" | "sync" | null

export interface WorkbenchLayoutState {
  terminalLayout: EidosLiteTerminalLayout
  terminalVisible: boolean
  auxiliaryView: WorkbenchAuxiliaryView
  diffOpen: boolean
  mergeOpen: boolean
}

export interface WorkbenchSurfaces {
  content: WorkbenchContentSurface
  right: WorkbenchRightSidebarView
  terminal: EidosLiteTerminalLayout | null
}

/**
 * Explorer and the History/Sync sidebar keep fixed outer roles. File content
 * and Terminal share only the middle work area, split vertically or
 * horizontally according to the Terminal layout preference.
 */
export function resolveWorkbenchSurfaces({
  terminalLayout,
  terminalVisible,
  auxiliaryView,
  diffOpen,
  mergeOpen,
}: WorkbenchLayoutState): WorkbenchSurfaces {
  return {
    content: mergeOpen ? "merge" : diffOpen ? "diff" : "file",
    right: mergeOpen ? "history" : auxiliaryView,
    terminal: terminalVisible ? terminalLayout : null,
  }
}
