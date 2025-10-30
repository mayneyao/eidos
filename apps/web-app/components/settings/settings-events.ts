// Settings modal event system
export type SettingsSection =
  | "space-general"
  | "space-document"
  | "space-mounts"
  | "general"
  | "ai"
  | "api"
  | "key-store"
  | "storage"
  | "sync"
  | "security"

export interface SettingsOpenEvent {
  section?: SettingsSection
  showSpaceSettings?: boolean
}

// Event names
export const SETTINGS_OPEN_EVENT = 'eidos-settings-open'
export const SETTINGS_CLOSE_EVENT = 'eidos-settings-close'

// Event dispatchers
export const openSettings = (options: SettingsOpenEvent = {}) => {
  const event = new CustomEvent(SETTINGS_OPEN_EVENT, {
    detail: options
  })
  window.dispatchEvent(event)
}

export const closeSettings = () => {
  const event = new CustomEvent(SETTINGS_CLOSE_EVENT)
  window.dispatchEvent(event)
}

// Event listeners
export const onSettingsOpen = (callback: (event: CustomEvent<SettingsOpenEvent>) => void) => {
  window.addEventListener(SETTINGS_OPEN_EVENT, callback as EventListener)
  return () => window.removeEventListener(SETTINGS_OPEN_EVENT, callback as EventListener)
}

export const onSettingsClose = (callback: (event: CustomEvent) => void) => {
  window.addEventListener(SETTINGS_CLOSE_EVENT, callback as EventListener)
  return () => window.removeEventListener(SETTINGS_CLOSE_EVENT, callback as EventListener)
}
