const INTERNAL_SLUG = /^u-([0-9a-f]{20})$/u
const PUBLIC_LABEL = /^r-([0-9a-f]{20})$/u

export function relayPublicHostLabel(
  internalSlug: string,
  environmentSuffix: string
): string {
  const identifier = INTERNAL_SLUG.exec(internalSlug)?.[1]
  if (identifier === undefined) throw new Error("Invalid Relay slug")
  return `r-${identifier}${environmentSuffix}`
}

export function relayInternalSlug(
  hostname: string,
  hostSuffix: string,
  environmentSuffix: string
): string | null {
  const ending = `.${hostSuffix.toLowerCase()}`
  const lower = hostname.toLowerCase()
  if (!lower.endsWith(ending)) return null
  const label = lower.slice(0, -ending.length)
  if (!label.endsWith(environmentSuffix)) return null
  const logicalLabel =
    environmentSuffix.length > 0
      ? label.slice(0, -environmentSuffix.length)
      : label
  const publicIdentifier = PUBLIC_LABEL.exec(logicalLabel)?.[1]
  if (publicIdentifier !== undefined) return `u-${publicIdentifier}`

  // Existing Relay links used the internal slug as the public label. Keep
  // them routable during the hostname migration, but never allocate new ones.
  return INTERNAL_SLUG.test(logicalLabel) ? logicalLabel : null
}
