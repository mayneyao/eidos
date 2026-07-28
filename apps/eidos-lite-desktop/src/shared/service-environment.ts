export const EIDOS_LITE_ENVIRONMENT_NAMES = ["staging", "production"] as const

export type EidosLiteEnvironmentName =
  (typeof EIDOS_LITE_ENVIRONMENT_NAMES)[number]

export interface EidosLiteServiceEnvironment {
  name: EidosLiteEnvironmentName
  accountOrigin: string
  billingOrigin: string
  syncRemoteOrigin: string
}

export const EIDOS_LITE_SERVICE_ENVIRONMENTS = Object.freeze({
  staging: Object.freeze({
    name: "staging",
    accountOrigin: "https://staging.eidos.space",
    billingOrigin: "https://staging.eidos.space",
    syncRemoteOrigin: "https://sync-staging.eidos.space",
  }),
  production: Object.freeze({
    name: "production",
    accountOrigin: "https://eidos.space",
    billingOrigin: "https://eidos.space",
    syncRemoteOrigin: "https://sync.eidos.space",
  }),
}) satisfies Readonly<
  Record<EidosLiteEnvironmentName, EidosLiteServiceEnvironment>
>

declare const __EIDOS_LITE_DEFAULT_ENVIRONMENT__: string | undefined

function compiledDefaultEnvironment(): string {
  return typeof __EIDOS_LITE_DEFAULT_ENVIRONMENT__ === "string"
    ? __EIDOS_LITE_DEFAULT_ENVIRONMENT__
    : "staging"
}

export function isEidosLiteEnvironmentName(
  value: unknown
): value is EidosLiteEnvironmentName {
  return (
    typeof value === "string" &&
    EIDOS_LITE_ENVIRONMENT_NAMES.some((name) => name === value)
  )
}

export function resolveEidosLiteServiceEnvironment(
  override: string | undefined = typeof process === "undefined"
    ? undefined
    : process.env.EIDOS_LITE_ENVIRONMENT,
  fallback = compiledDefaultEnvironment()
): EidosLiteServiceEnvironment {
  const name = override ?? fallback
  if (!isEidosLiteEnvironmentName(name)) {
    throw new Error(
      `EIDOS_LITE_ENVIRONMENT must be "staging" or "production"; received ${JSON.stringify(name)}`
    )
  }
  return EIDOS_LITE_SERVICE_ENVIRONMENTS[name]
}
