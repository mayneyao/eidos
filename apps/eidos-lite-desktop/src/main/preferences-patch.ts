import type { EidosLitePreferences } from "../shared/contracts"
import { isEidosLiteKeyboardShortcuts } from "../shared/keyboard-shortcuts"
import { normalizeEidosLiteTimeZone } from "./app-preferences"

export function eidosLitePreferencesPatch(
  value: unknown
): Partial<EidosLitePreferences> {
  if (typeof value !== "object" || value === null) {
    throw new Error("Invalid preferences")
  }
  const candidate = value as Record<string, unknown>
  const patch: Partial<EidosLitePreferences> = {}
  if ("appearance" in candidate) {
    if (
      candidate.appearance !== "system" &&
      candidate.appearance !== "light" &&
      candidate.appearance !== "dark"
    ) {
      throw new Error("Invalid appearance preference")
    }
    patch.appearance = candidate.appearance
  }
  if ("language" in candidate) {
    if (
      candidate.language !== "system" &&
      candidate.language !== "en" &&
      candidate.language !== "zh"
    ) {
      throw new Error("Invalid language preference")
    }
    patch.language = candidate.language
  }
  if ("timeZone" in candidate) {
    const normalized = normalizeEidosLiteTimeZone(candidate.timeZone)
    if (normalized !== candidate.timeZone) {
      throw new Error("Invalid time zone preference")
    }
    patch.timeZone = normalized
  }
  if ("weekStartsOnMonday" in candidate) {
    if (typeof candidate.weekStartsOnMonday !== "boolean") {
      throw new Error("Invalid first day of week preference")
    }
    patch.weekStartsOnMonday = candidate.weekStartsOnMonday
  }
  if ("keyboardShortcuts" in candidate) {
    if (!isEidosLiteKeyboardShortcuts(candidate.keyboardShortcuts)) {
      throw new Error("Invalid keyboard shortcut preferences")
    }
    patch.keyboardShortcuts = candidate.keyboardShortcuts
  }
  if ("automaticUpdates" in candidate) {
    if (typeof candidate.automaticUpdates !== "boolean") {
      throw new Error("Invalid automatic update preference")
    }
    patch.automaticUpdates = candidate.automaticUpdates
  }
  if ("automaticCheckpoints" in candidate) {
    if (typeof candidate.automaticCheckpoints !== "boolean") {
      throw new Error("Invalid automatic checkpoint preference")
    }
    patch.automaticCheckpoints = candidate.automaticCheckpoints
  }
  if ("defaultSpaceLocation" in candidate) {
    if (
      candidate.defaultSpaceLocation !== null &&
      (typeof candidate.defaultSpaceLocation !== "string" ||
        !candidate.defaultSpaceLocation.trim())
    ) {
      throw new Error("Invalid default Space location")
    }
    patch.defaultSpaceLocation = candidate.defaultSpaceLocation
  }
  return patch
}
