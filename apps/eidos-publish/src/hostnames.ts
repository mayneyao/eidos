const LEGACY_RELAY_PUBLIC_LABEL = /^u-([0-9a-f]{20})$/u

export interface PublishHostnameEnv {
  PUBLISH_ROOT: string
  PUBLISH_HOST_LABEL_SUFFIX: string
}

export function publicationHostname(
  label: string,
  env: PublishHostnameEnv
): string {
  return `${label}${env.PUBLISH_HOST_LABEL_SUFFIX}.${env.PUBLISH_ROOT}`
}

export function publicationHostLabel(
  hostname: string,
  env: PublishHostnameEnv
): string | null {
  const label = publicHostLabel(hostname, env.PUBLISH_ROOT)
  if (label === null) return null
  const logicalLabel = stripEnvironmentSuffix(
    label,
    env.PUBLISH_HOST_LABEL_SUFFIX
  )
  if (logicalLabel === null || reservedRelayLabel(logicalLabel)) return null
  return logicalLabel
}

export function isRelayPublicHostname(
  hostname: string,
  env: PublishHostnameEnv
): boolean {
  const label = publicHostLabel(hostname, env.PUBLISH_ROOT)
  if (label === null) return false
  const logicalLabel = stripEnvironmentSuffix(
    label,
    env.PUBLISH_HOST_LABEL_SUFFIX
  )
  return logicalLabel !== null && reservedRelayLabel(logicalLabel)
}

export function reservedPublishHandle(value: string): boolean {
  return (
    value.startsWith("r-") ||
    value.startsWith("u-") ||
    value.endsWith("-staging")
  )
}

function reservedRelayLabel(label: string): boolean {
  return label.startsWith("r-") || LEGACY_RELAY_PUBLIC_LABEL.test(label)
}

function publicHostLabel(hostname: string, publishRoot: string): string | null {
  const suffix = "." + publishRoot
  if (!hostname.endsWith(suffix)) return null
  const label = hostname.slice(0, -suffix.length)
  return label.length > 0 &&
    !label.includes(".") &&
    label === label.toLowerCase()
    ? label
    : null
}

function stripEnvironmentSuffix(
  label: string,
  environmentSuffix: string
): string | null {
  if (environmentSuffix.length === 0) return label
  if (!label.endsWith(environmentSuffix)) return null
  const logicalLabel = label.slice(0, -environmentSuffix.length)
  return logicalLabel.length > 0 ? logicalLabel : null
}
