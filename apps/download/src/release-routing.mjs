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
const ANDROID_TAG_PATTERN =
  /^android-v(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta|rc)\.(\d+))?$/u

// This historical preview predates the continued 0.x release line. Keep its
// GitHub assets available, but do not let its higher version pin beta updates.
const RETIRED_LITE_UPDATE_TAGS = new Set(["lite-v1.0.0-rc.1"])

function releaseVersion(release, tagPattern) {
  if (release?.draft !== false) return null
  const match = tagPattern.exec(release?.tag_name ?? "")
  if (!match) return null
  const prerelease = match[4] ?? null
  if (release.prerelease !== (prerelease !== null)) return null
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease,
    prereleaseNumber: Number(match[5] ?? 0),
  }
}

function liteVersion(release) {
  if (RETIRED_LITE_UPDATE_TAGS.has(release?.tag_name)) return null
  return releaseVersion(release, LITE_TAG_PATTERN)
}

function compareReleaseVersions(left, right) {
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
    compareReleaseVersions(right.version, left.version)
  )
  return candidates[0]?.release ?? null
}

/**
 * @template {{draft: boolean, prerelease: boolean, tag_name: string, assets: Array<{name: string, browser_download_url: string}>}} T
 * @param {T[]} releases
 * @param {"stable" | "beta"} channel
 * @returns {{release: T, asset: T["assets"][number]} | null}
 */
export function selectEidosAndroidDownload(releases, channel) {
  const candidates = releases
    .map((release) => {
      const version = releaseVersion(release, ANDROID_TAG_PATTERN)
      const assetName = `eidos-android-${release.tag_name.slice("android-v".length)}.apk`
      const asset = release.assets.find(
        (candidate) => candidate.name === assetName
      )
      return { release, version, asset }
    })
    .filter(
      (candidate) =>
        candidate.version !== null &&
        candidate.asset !== undefined &&
        (channel === "beta" || candidate.version.prerelease === null)
    )
  candidates.sort((left, right) =>
    compareReleaseVersions(right.version, left.version)
  )
  const selected = candidates[0]
  return selected ? { release: selected.release, asset: selected.asset } : null
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
