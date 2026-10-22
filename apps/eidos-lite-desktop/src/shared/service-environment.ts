export const EIDOS_LITE_ENVIRONMENT_NAMES = ["staging", "production"] as const

export type EidosLiteEnvironmentName =
  (typeof EIDOS_LITE_ENVIRONMENT_NAMES)[number]

export interface EidosLiteServiceEnvironment {
  name: EidosLiteEnvironmentName
  accountOrigin: string
  billingOrigin: string
  publishOrigin: string
  syncRemoteOrigin: string
}

/** Explicit local Test Mode account server; packaged apps use fixed origins. */
export function developmentAccountEnvironment(
  environment: EidosLiteServiceEnvironment,
  packaged: boolean,
  origin?: string
): EidosLiteServiceEnvironment {
  if (packaged || !origin) return environment
  const url = new URL(origin)
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error("EIDOS_LITE_ACCOUNT_ORIGIN must be an HTTPS origin")
  return {
    ...environment,
    accountOrigin: url.origin,
    billingOrigin: url.origin,
  }
}

export function accountStorageKey(
  environment: EidosLiteServiceEnvironment
): string {
  return environment.accountOrigin ===
    EIDOS_LITE_SERVICE_ENVIRONMENTS[environment.name].accountOrigin
    ? environment.name
    : `${environment.name}-${encodeURIComponent(environment.accountOrigin)}`
}

export const EIDOS_LITE_SERVICE_ENVIRONMENTS = Object.freeze({
  staging: Object.freeze({
    name: "staging",
    accountOrigin: "https://staging.eidos.space",
    billingOrigin: "https://staging.eidos.space",
    publishOrigin: "https://publish-staging.eidos.space",
    syncRemoteOrigin: "https://sync-staging.eidos.space",
  }),
  production: Object.freeze({
    name: "production",
    accountOrigin: "https://eidos.space",
    billingOrigin: "https://eidos.space",
    publishOrigin: "https://publish.eidos.space",
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

export function runtimeEnvironmentOverride(
  packaged: boolean,
  override: string | undefined
): string | null | undefined {
  // undefined invokes the resolver's development default argument. Use null
  // to explicitly select the compiled preset without re-reading process.env.
  return packaged ? null : override
}

export function resolveEidosLiteServiceEnvironment(
  override: string | null | undefined = typeof process === "undefined"
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
