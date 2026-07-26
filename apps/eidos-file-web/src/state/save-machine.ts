import type {
  FileAccessMode,
  FileWritePermission,
} from "../files/browser-file-adapter"

export type SavePhase =
  | "empty"
  | "opening"
  | "clean"
  | "dirty"
  | "saving"
  | "saved"
  | "error"
  | "conflict"

export interface SaveState {
  phase: SavePhase
  mode: FileAccessMode | null
  permission: FileWritePermission | null
  error: string | null
  lastSavedAt: number | null
}

export type SaveEvent =
  | { type: "OPEN_START" }
  | {
      type: "OPEN_SUCCESS"
      mode: FileAccessMode
      permission: FileWritePermission
      dirty?: boolean
    }
  | { type: "OPEN_FAILURE"; message: string }
  | { type: "MUTATION_COMMITTED" }
  | { type: "SAVE_START" }
  | { type: "SAVE_SUCCESS"; at: number; mode?: FileAccessMode }
  | { type: "SAVE_SETTLED" }
  | { type: "SAVE_FAILURE"; message: string }
  | { type: "CONFLICT"; message: string }
  | { type: "PERMISSION"; permission: FileWritePermission }
  | { type: "RESET" }

export const initialSaveState: SaveState = {
  phase: "empty",
  mode: null,
  permission: null,
  error: null,
  lastSavedAt: null,
}

export function hasUnsavedChanges(state: SaveState): boolean {
  return ["dirty", "saving", "error", "conflict"].includes(state.phase)
}

export function canAutoReloadExternalChange(state: SaveState): boolean {
  return state.phase === "clean" || state.phase === "saved"
}

export function canSaveToOriginal(state: SaveState): boolean {
  return state.mode === "direct" && state.permission === "granted"
}

export function saveReducer(state: SaveState, event: SaveEvent): SaveState {
  switch (event.type) {
    case "OPEN_START":
      return { ...initialSaveState, phase: "opening" }
    case "OPEN_SUCCESS":
      return {
        phase: event.dirty ? "dirty" : "clean",
        mode: event.mode,
        permission: event.permission,
        error: null,
        lastSavedAt: null,
      }
    case "OPEN_FAILURE":
      return {
        ...initialSaveState,
        phase: "error",
        error: event.message,
      }
    case "MUTATION_COMMITTED":
      if (state.phase === "empty" || state.phase === "opening") return state
      return { ...state, phase: "dirty", error: null }
    case "SAVE_START":
      if (!hasUnsavedChanges(state)) return state
      return { ...state, phase: "saving", error: null }
    case "SAVE_SUCCESS":
      return {
        ...state,
        phase: "saved",
        mode: event.mode ?? state.mode,
        error: null,
        lastSavedAt: event.at,
      }
    case "SAVE_SETTLED":
      return state.phase === "saved" ? { ...state, phase: "clean" } : state
    case "SAVE_FAILURE":
      return { ...state, phase: "error", error: event.message }
    case "CONFLICT":
      return { ...state, phase: "conflict", error: event.message }
    case "PERMISSION":
      return { ...state, permission: event.permission }
    case "RESET":
      return initialSaveState
  }
}
