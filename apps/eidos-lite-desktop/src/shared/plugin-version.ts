/**
 * Compares two semver version strings (e.g. "0.1.0" and "0.1.1").
 * Returns:
 *  - positive number if a > b
 *  - negative number if a < b
 *  - 0 if a == b
 */
export function comparePluginVersions(a: string, b: string): number {
  if (a === b) return 0

  // Strip leading 'v' or 'V' if present
  const cleanA = a.trim().replace(/^v/i, "")
  const cleanB = b.trim().replace(/^v/i, "")

  const partsA = cleanA.split(".").map((part) => {
    const num = Number.parseInt(part, 10)
    return Number.isFinite(num) ? num : 0
  })
  const partsB = cleanB.split(".").map((part) => {
    const num = Number.parseInt(part, 10)
    return Number.isFinite(num) ? num : 0
  })

  const length = Math.max(partsA.length, partsB.length, 3)
  for (let i = 0; i < length; i++) {
    const numA = partsA[i] ?? 0
    const numB = partsB[i] ?? 0
    if (numA !== numB) {
      return numA - numB
    }
  }

  return 0
}

/**
 * Returns true if a newer version is available in the marketplace.
 */
export function isPluginUpdateAvailable(
  installedVersion?: string | null,
  marketplaceVersion?: string | null
): boolean {
  if (!installedVersion || !marketplaceVersion) return false
  return comparePluginVersions(marketplaceVersion, installedVersion) > 0
}
