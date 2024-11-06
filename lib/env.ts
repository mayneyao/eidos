export const logger = console // TODO: remove this
export const EIDOS_VERSION = "0.9.0"
export const isDevMode = Boolean(import.meta.env?.DEV)
export const isSelfHosted = import.meta.env?.VITE_EIDOS_SELF_HOSTED === "true"
export const isInkServiceMode =
  import.meta.env?.VITE_EIDOS_SERVICE_MODE === "ink"
export const isDesktopMode = Boolean(import.meta.env?.VITE_EIDOS_SERVICE_MODE === "desktop")