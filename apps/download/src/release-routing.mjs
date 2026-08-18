const CLI_SOURCE_BASE =
  "https://raw.githubusercontent.com/mayneyao/eidos/dev/apps/cli"

const cliSources = Object.freeze({
  "/cli/install.ps1": `${CLI_SOURCE_BASE}/install.ps1`,
  "/cli/install.sh": `${CLI_SOURCE_BASE}/install.sh`,
  "/cli/latest": `${CLI_SOURCE_BASE}/LATEST`,
})

export function getCliSource(pathname) {
  return cliSources[pathname] ?? null
}

const LITE_TAG_PATTERN =
  /^lite-v(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta|rc)\.(\d+))?$/u

function liteVersion(release) {
  if (release?.draft !== false) return null
  const match = LITE_TAG_PATTERN.exec(release?.tag_name ?? "")
  if (!match) return null
  const prerelease = match[4] ?? null
  if (release.prerelease !== (prerelease !== null)) return null
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease,
    prereleaseNumber: Number(match[5] ?? 0),
  }
}

function compareLiteVersions(left, right) {
  for (let index = 0; index < left.core.length; index += 1) {
    if (left.core[index] !== right.core[index]) {
      return left.core[index] - right.core[index]
    }
  }
  if (left.prerelease === null || right.prerelease === null) {
    return left.prerelease === right.prerelease
      ? 0
      : left.prerelease === null
        ? 1
        : -1
  }
  const order = { alpha: 0, beta: 1, rc: 2 }
  return (
    order[left.prerelease] - order[right.prerelease] ||
    left.prereleaseNumber - right.prereleaseNumber
  )
}

export function isStableEidosLiteRelease(release) {
  return liteVersion(release)?.prerelease === null
}

export function selectEidosLiteRelease(releases, channel) {
  const candidates = releases
    .map((release) => ({ release, version: liteVersion(release) }))
    .filter(
      (candidate) =>
        candidate.version !== null &&
        (channel === "beta" || candidate.version.prerelease === null)
    )
  candidates.sort((left, right) =>
    compareLiteVersions(right.version, left.version)
  )
  return candidates[0]?.release ?? null
}

export function getEidosLiteUpdateRoute(pathname) {
  const match = /^\/lite\/updates\/(stable|beta)\/(arm64|x64)\/([^/]+)$/u.exec(
    pathname
  )
  if (!match) return null
  let assetName
  try {
    assetName = decodeURIComponent(match[3])
  } catch {
    return null
  }
  if (
    !assetName ||
    assetName === "." ||
    assetName === ".." ||
    assetName.includes("/") ||
    assetName.includes("\\")
  ) {
    return null
  }
  return { channel: match[1], architecture: match[2], assetName }
}

export function releaseAssetNameForLiteUpdate(route) {
  const metadata = /^(latest|beta)(-mac|-linux)?\.yml$/u.exec(route.assetName)
  if (!metadata) return route.assetName
  const platform =
    metadata[2] === "-mac" ? "mac" : metadata[2] === "-linux" ? "linux" : "win"
  return `${metadata[1]}-${platform}-${route.architecture}.yml`
}

/**
 * @param {string | undefined} platform
 * @param {string | null} format
 * @returns {string | null}
 */
export function releaseExtensionForLiteDownload(platform, format) {
  if (platform === "mac" && (format === null || format === "dmg")) {
    return ".dmg"
  }
  if (platform === "win" && (format === null || format === "exe")) {
    return ".exe"
  }
  if (platform === "linux") {
    if (format === null || format === "appimage") return ".appimage"
    if (format === "deb") return ".deb"
  }
  return null
}

/**
 * @param {string | undefined} platform
 * @param {string} architecture
 * @param {string | null} [format]
 * @returns {string}
 */
export function releaseArchitectureForPlatform(
  platform,
  architecture,
  format = null
) {
  if (platform === "linux" && architecture === "x64") {
    return format === "deb" ? "amd64" : "x86_64"
  }
  return architecture
}

export function findReleaseAsset(assets, assetName) {
  return assets.find(
    (candidate) => candidate.name === assetName || candidate.label === assetName
  )
}
