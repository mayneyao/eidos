// Settings modal event system
export type SettingsSection =
  | "space-general"
  | "space-document"
  | "space-mounts"
  | "space-extensions"
  | "space-tabs"
  | "space-relay"
  | "space-theme"
  | "space-sync"
  | "general"
  | "account"
  | "ai"
  | "storage"
  | "sync"
  | "security"
  | "browser"
  | "secrets"

export interface SettingsOpenEvent {
  section?: SettingsSection
  showSpaceSettings?: boolean
}

// Event names
export const SETTINGS_OPEN_EVENT = "eidos-settings-open"
export const SETTINGS_CLOSE_EVENT = "eidos-settings-close"

// Event dispatchers
export const openSettings = (options: SettingsOpenEvent = {}) => {
  const event = new CustomEvent(SETTINGS_OPEN_EVENT, {
    detail: options,
  })
  window.dispatchEvent(event)
}

export const closeSettings = () => {
  const event = new CustomEvent(SETTINGS_CLOSE_EVENT)
  window.dispatchEvent(event)
}

export const navigateToSection = (section: SettingsSection) => {
  const event = new CustomEvent("settings-navigate", {
    detail: section,
  })
  window.dispatchEvent(event)
}

// Event listeners
export const onSettingsOpen = (
  callback: (event: CustomEvent<SettingsOpenEvent>) => void
) => {
  window.addEventListener(SETTINGS_OPEN_EVENT, callback as EventListener)
  return () =>
    window.removeEventListener(SETTINGS_OPEN_EVENT, callback as EventListener)
}

export const onSettingsClose = (callback: (event: CustomEvent) => void) => {
  window.addEventListener(SETTINGS_CLOSE_EVENT, callback as EventListener)
  return () =>
    window.removeEventListener(SETTINGS_CLOSE_EVENT, callback as EventListener)
}

// External links for settings
export const SETTINGS_EXTERNAL_LINKS = {
  github: "https://github.com/mayneyao/eidos",
  discord: "https://discord.gg/cGQqjeFpZq",
  website: "https://eidos.space",
} as const
