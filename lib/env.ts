export const logger = console // TODO: remove this
export const EIDOS_VERSION = "0.11.0"
export const isDevMode = Boolean(import.meta.env?.DEV)
export const isSelfHosted = import.meta.env?.MODE === "self-host"
export const isInkServiceMode = import.meta.env?.MODE === "ink"
export const isDesktopMode = import.meta.env?.MODE === "desktop"
export const isStagingMode = import.meta.env?.MODE === "staging"