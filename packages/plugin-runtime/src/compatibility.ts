import type { PluginManifest } from "@eidos.space/plugin-sdk"
import data from "./compatibility-data.json"
import { PluginError } from "./errors"

export type PluginHost = keyof typeof data.hosts
export type CompatibilityResult = {
  compatible: boolean
  reason:
    | "COMPATIBLE"
    | "UNDECLARED"
    | "INVALID_REQUIREMENT"
    | "UNSUPPORTED_PROTOCOL"
    | "API_VERSION"
    | "HOST_FEATURES"
  requiredApi: string | null
  supportedApi: string
  missingFeatures: string[]
  message: string
}
export function pluginHostInfo(host: PluginHost) {
  return {
    host,
    pluginApiVersion: data.hosts[host].pluginApi,
    features: [...data.hosts[host].features],
  }
}
function version(value: string): number[] | null {
  return /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value) &&
    value.split(".").every((p) => Number.isSafeInteger(Number(p)))
    ? value.split(".").map(Number)
    : null
}
/** Derive requirements from contributions; this does not infer arbitrary JS calls. */
export function pluginFeatures(manifest: PluginManifest): string[] {
  const features = new Set(
    (manifest.views ?? []).map((v) => `view.${v.context}`)
  )
  for (const rule of data.rules) {
    const value = (manifest as unknown as Record<string, unknown>)[rule.key]
    if (value && (typeof value !== "object" || Object.keys(value).length))
      features.add(rule.feature)
  }
  if (manifest.browser?.workers) features.add("browser.workers")
  if (manifest.theme) features.add("theme.lite")
  if (manifest.browser?.networkOrigins?.length) features.add("browser.network")
  return [...features].sort()
}
export function checkPluginCompatibility(
  manifest: PluginManifest,
  host: PluginHost
): CompatibilityResult {
  const info = pluginHostInfo(host)
  const requiredApi = manifest.requires?.pluginApi ?? null
  const missingFeatures = pluginFeatures(manifest).filter(
    (feature) => !info.features.includes(feature)
  )
  const result = (
    reason: CompatibilityResult["reason"],
    message: string
  ): CompatibilityResult => ({
    compatible: reason === "COMPATIBLE" || reason === "UNDECLARED",
    reason,
    requiredApi,
    supportedApi: info.pluginApiVersion,
    missingFeatures,
    message,
  })
  if (manifest.apiVersion !== 1)
    return result(
      "UNSUPPORTED_PROTOCOL",
      "Unsupported plugin protocol; update your host."
    )
  if (host === "eidos-lite" && !manifest.theme && requiredApi === null) {
    return result(
      "API_VERSION",
      "This plugin must declare plugin API 2.0.0 and migrate to ctx.fs before it can run in Eidos Lite."
    )
  }
  if (requiredApi !== null) {
    const required = version(requiredApi),
      supported = version(info.pluginApiVersion)!
    if (!required)
      return result(
        "INVALID_REQUIREMENT",
        "Invalid minimum plugin API version."
      )
    // Themes contain no executable code; the 1.6 stylesheet contract is unchanged.
    const legacyTheme =
      host === "eidos-lite" &&
      Boolean(manifest.theme) &&
      required[0] === 1 &&
      required[1] === 6 &&
      required[2] === 0
    if (
      !legacyTheme &&
      (required[0] !== supported[0] ||
        required[1]! > supported[1]! ||
        (required[1] === supported[1] && required[2]! > supported[2]!))
    )
      return result(
        "API_VERSION",
        `This plugin requires plugin API ${requiredApi}; ${host} supports ${info.pluginApiVersion}. Install a compatible plugin version or migrate its source to the supported API.`
      )
  }
  if (missingFeatures.length)
    return result(
      "HOST_FEATURES",
      `${host} does not support this plugin's features: ${missingFeatures.join(", ")}.`
    )
  return requiredApi
    ? result("COMPATIBLE", "Compatible")
    : result(
        "UNDECLARED",
        "Legacy plugin: minimum API is undeclared; only manifest features were checked."
      )
}
export function assertPluginCompatibility(
  manifest: PluginManifest,
  host: PluginHost
): void {
  const result = checkPluginCompatibility(manifest, host)
  if (!result.compatible)
    throw new PluginError("UNSUPPORTED_API", result.message)
}
