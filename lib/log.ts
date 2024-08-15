export const logger = console
export const EIDOS_VERSION = "0.6.2"
export const isDevMode = import.meta.env?.MODE === "development"
export const isSelfHosted = import.meta.env?.VITE_EIDOS_SELF_HOSTED === "true"
export const isInkServiceMode =
  import.meta.env?.VITE_EIDOS_SERVICE_MODE === "ink"
