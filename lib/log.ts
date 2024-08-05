export const logger = console
export const EIDOS_VERSION = "0.5.5"
export const isDevMode = import.meta.env.MODE === "development"
export const isSelfHosted = import.meta.env.VITE_EIDOS_SELF_HOSTED === "true"
