import { createHash } from "node:crypto"
import {
  githubPluginFilename,
  githubReleaseTag,
  type GitHubPluginLink,
} from "../../shared/github-plugin-link"
import { registryDownload } from "./plugin-registry"

function releaseAsset(value: unknown, filename?: string) {
  if (typeof value !== "object" || value === null)
    throw new Error("Invalid GitHub release")
  const release = value as Record<string, unknown>
  const tag = release.tag_name
  if (
    release.draft !== false ||
    typeof tag !== "string" ||
    !githubReleaseTag(tag) ||
    !Array.isArray(release.assets)
  )
    throw new Error("Invalid GitHub release")

  const assets = release.assets.flatMap((entry: unknown) => {
    if (typeof entry !== "object" || entry === null) return []
    const { name, digest, state } = entry as Record<string, unknown>
    if (
      typeof name !== "string" ||
      !githubPluginFilename(name) ||
      state !== "uploaded" ||
      (filename !== undefined && name !== filename)
    )
      return []
    return [{ tag, filename: name, digest }]
  })
  if (!assets.length)
    throw new Error("This GitHub release has no .eidos-plugin package")
  if (assets.length > 1)
    throw new Error(
      "This release has multiple plugin packages. Paste the link to the package you want."
    )
  return assets[0]!
}

export async function downloadGitHubPlugin(
  link: GitHubPluginLink,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch
) {
  const asset =
    link.filename && link.tag
      ? { tag: link.tag, filename: link.filename, digest: undefined }
      : releaseAsset(
          JSON.parse(
            new TextDecoder().decode(
              await registryDownload(
                `https://api.github.com/repos/${link.repository}/releases/${link.tag ? `tags/${encodeURIComponent(link.tag)}` : "latest"}`,
                2 * 1024 * 1024,
                fetcher,
                undefined,
                { allowGitHubApi: true, signal }
              )
            )
          ),
          link.filename
        )
  if (link.tag && asset.tag !== link.tag) throw new Error("GitHub tag mismatch")
  const url = `https://github.com/${link.repository}/releases/download/${encodeURIComponent(asset.tag)}/${encodeURIComponent(asset.filename)}`
  const bytes = await registryDownload(
    url,
    16 * 1024 * 1024,
    fetcher,
    undefined,
    { signal }
  )
  if (
    asset.digest &&
    asset.digest !==
      `sha256:${createHash("sha256").update(bytes).digest("hex")}`
  )
    throw new Error("Plugin checksum does not match the GitHub release")
  return { bytes, filename: asset.filename }
}
