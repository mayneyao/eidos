import type { LiteWindowKind } from "./window-chrome"

export type WelcomeWindowAction = "none" | "focus" | "create"

export function welcomeWindowActionAfterSpaceClosed(
  appClosing: boolean,
  remainingWindowKinds: readonly LiteWindowKind[]
): WelcomeWindowAction {
  if (appClosing) return "none"
  if (remainingWindowKinds.includes("welcome")) return "focus"
  return remainingWindowKinds.includes("space") ? "none" : "create"
}
