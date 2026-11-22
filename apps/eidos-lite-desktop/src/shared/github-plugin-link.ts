export interface GitHubPluginLink {
  repository: string
  tag?: string
  filename?: string
}

export function githubPluginFilename(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,239}\.eidos-plugin$/i.test(value)
}

export function githubReleaseTag(value: string): boolean {
  return (
    /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(value) &&
    value.split("/").every((part) => part && part !== "." && part !== "..")
  )
}

export function parseGitHubPluginLink(value: string): GitHubPluginLink | null {
  const text = value.trim()
  if (text.length > 2048 || /[\s\\]/u.test(text)) return null
  const input = /^github\.com\//i.test(text) ? `https://${text}` : text
  try {
    const url = new URL(input)
    if (
      url.protocol !== "https:" ||
      url.hostname !== "github.com" ||
      url.port ||
      url.username ||
      url.password
    )
      return null

    const [, owner, rawRepo, ...parts] = url.pathname
      .replace(/\/$/, "")
      .split("/")
    const repo = rawRepo?.replace(/\.git$/i, "")
    if (
      !owner ||
      !repo ||
      !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(owner) ||
      !/^[A-Za-z0-9_.-]{1,100}$/.test(repo) ||
      repo === "." ||
      repo === ".."
    )
      return null
    const repository = `${owner}/${repo}`
    if (!parts.length) return { repository }
    if (parts[0] !== "releases") return null
    if (parts.length === 1 || (parts.length === 2 && parts[1] === "latest"))
      return { repository }
    if (parts.length === 3 && parts[1] === "tag") {
      const tag = decodeURIComponent(parts[2]!)
      return githubReleaseTag(tag) ? { repository, tag } : null
    }
    if (parts.length === 4) {
      const filename = decodeURIComponent(parts[3]!)
      if (!githubPluginFilename(filename)) return null
      if (parts[1] === "latest" && parts[2] === "download")
        return { repository, filename }
      if (parts[1] === "download") {
        const tag = decodeURIComponent(parts[2]!)
        if (githubReleaseTag(tag)) return { repository, tag, filename }
      }
    }
    return null
  } catch {
    return null
  }
}
