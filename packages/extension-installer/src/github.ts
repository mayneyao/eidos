import type {
  GitHubExtensionRequest,
  GitHubExtensionSnapshot,
  NormalizedGitHubExtensionRequest,
} from "./types"
import { canonicalExtensionPackagePath } from "@eidos.space/extension-manifest"

const GITHUB_API_ORIGIN = "https://api.github.com"
const DEFAULT_REQUESTED_REF = "HEAD"
const DEFAULT_MAX_ARCHIVE_BYTES = 40 * 1024 * 1024
const MAX_JSON_BYTES = 1024 * 1024
const REQUEST_TIMEOUT_MS = 30_000
const REPOSITORY_PART_PATTERN = /^[A-Za-z0-9_.-]+$/
const MAX_SUBDIRECTORY_LENGTH = 512
const MAX_SUBDIRECTORY_DEPTH = 32

function requestHeaders(): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  }
}

function safeRequestRef(value: unknown): string {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_REQUESTED_REF
  }
  if (
    typeof value !== "string" ||
    value.length > 200 ||
    value.trim() !== value ||
    /[\0\r\n]/.test(value)
  ) {
    throw new Error(
      "GitHub extension ref must be a non-empty value up to 200 characters"
    )
  }
  return value
}

function safeSubdirectory(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined
  if (
    typeof value !== "string" ||
    value.length > MAX_SUBDIRECTORY_LENGTH ||
    value.trim() !== value
  ) {
    throw new Error(
      `GitHub extension package path must be a relative path up to ${MAX_SUBDIRECTORY_LENGTH} characters`
    )
  }
  let canonical: string
  try {
    canonical = canonicalExtensionPackagePath(value)
  } catch {
    throw new Error("GitHub extension package path must be a relative path")
  }
  if (canonical.split("/").length > MAX_SUBDIRECTORY_DEPTH) {
    throw new Error(
      `GitHub extension package path exceeds ${MAX_SUBDIRECTORY_DEPTH} segments`
    )
  }
  return canonical
}

function parseRepository(value: unknown): { owner: string; repo: string } {
  if (typeof value !== "string" || !value.trim() || value.length > 300) {
    throw new Error("A GitHub repository is required")
  }
  const input = value.trim()
  let pathname: string
  if (input.includes("://")) {
    let url: URL
    try {
      url = new URL(input)
    } catch {
      throw new Error("GitHub repository URL is invalid")
    }
    if (
      url.protocol !== "https:" ||
      url.hostname.toLowerCase() !== "github.com" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new Error(
        "Only canonical https://github.com repositories are supported"
      )
    }
    pathname = url.pathname
  } else {
    pathname = input
  }

  const segments = pathname
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean)
  if (segments.length !== 2) {
    throw new Error("GitHub repository must be owner/repository")
  }
  const owner = segments[0]
  const repo = segments[1].replace(/\.git$/i, "")
  if (
    !owner ||
    !repo ||
    owner.length > 100 ||
    repo.length > 100 ||
    !REPOSITORY_PART_PATTERN.test(owner) ||
    !REPOSITORY_PART_PATTERN.test(repo)
  ) {
    throw new Error("GitHub repository owner or name is invalid")
  }
  return { owner, repo }
}

export function normalizeGitHubExtensionRequest(
  request: GitHubExtensionRequest
): NormalizedGitHubExtensionRequest {
  if (!request || typeof request !== "object") {
    throw new Error("A GitHub extension request is required")
  }
  const { owner, repo } = parseRepository(request.repository)
  const subdirectory = safeSubdirectory(request.subdirectory)
  return {
    repository: `https://github.com/${owner}/${repo}`,
    owner,
    repo,
    requested: safeRequestRef(request.requested),
    ...(subdirectory ? { subdirectory } : {}),
  }
}

async function readLimitedResponse(
  response: Response,
  maxBytes: number,
  label: string
): Promise<Uint8Array> {
  const declaredLength = response.headers.get("content-length")
  if (
    declaredLength &&
    Number.isFinite(Number(declaredLength)) &&
    Number(declaredLength) > maxBytes
  ) {
    throw new Error(`${label} exceeds the ${maxBytes}-byte download limit`)
  }
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > maxBytes) {
      throw new Error(`${label} exceeds the ${maxBytes}-byte download limit`)
    }
    return bytes
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      total += result.value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        throw new Error(`${label} exceeds the ${maxBytes}-byte download limit`)
      }
      chunks.push(result.value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

function responseError(response: Response, operation: string): Error {
  if (response.status === 404) {
    return new Error(`${operation} failed: repository or ref was not found`)
  }
  if (response.status === 403 || response.status === 429) {
    return new Error(
      `${operation} failed: GitHub rate limit or access policy rejected the request`
    )
  }
  return new Error(`${operation} failed with GitHub HTTP ${response.status}`)
}

async function requestWithTimeout(
  fetcher: typeof globalThis.fetch,
  url: string
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetcher(url, {
      headers: requestHeaders(),
      redirect: "follow",
      signal: controller.signal,
    })
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`GitHub request timed out after ${REQUEST_TIMEOUT_MS}ms`)
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

export async function resolveGitHubExtensionSnapshot(
  request: GitHubExtensionRequest,
  options: {
    fetch?: typeof globalThis.fetch
    maxArchiveBytes?: number
  } = {}
): Promise<GitHubExtensionSnapshot> {
  const normalized = normalizeGitHubExtensionRequest(request)
  const fetcher = options.fetch ?? globalThis.fetch
  if (typeof fetcher !== "function") {
    throw new Error("GitHub installation requires a host fetch implementation")
  }
  const repositoryApi = `${GITHUB_API_ORIGIN}/repos/${encodeURIComponent(normalized.owner)}/${encodeURIComponent(normalized.repo)}`
  const commitResponse = await requestWithTimeout(
    fetcher,
    `${repositoryApi}/commits/${encodeURIComponent(normalized.requested)}`
  )
  if (!commitResponse.ok)
    throw responseError(commitResponse, "Commit resolution")
  const commitBytes = await readLimitedResponse(
    commitResponse,
    MAX_JSON_BYTES,
    "GitHub commit response"
  )
  let commit: unknown
  try {
    commit = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(commitBytes)
    )
  } catch {
    throw new Error("GitHub returned an invalid commit response")
  }
  const sha =
    commit && typeof commit === "object" && "sha" in commit
      ? (commit as { sha?: unknown }).sha
      : undefined
  if (typeof sha !== "string" || !/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error("GitHub did not resolve the ref to a 40-character commit")
  }

  const archiveResponse = await requestWithTimeout(
    fetcher,
    `${repositoryApi}/tarball/${sha}`
  )
  if (!archiveResponse.ok)
    throw responseError(archiveResponse, "Archive download")
  const archive = await readLimitedResponse(
    archiveResponse,
    options.maxArchiveBytes ?? DEFAULT_MAX_ARCHIVE_BYTES,
    "GitHub extension archive"
  )
  const { parseGitHubTarball } = await import("./tarball")
  return {
    source: {
      kind: "github",
      repository: normalized.repository,
      requested: normalized.requested,
      commit: sha,
      ...(normalized.subdirectory
        ? { subdirectory: normalized.subdirectory }
        : {}),
    },
    files: await parseGitHubTarball(archive, {
      subdirectory: normalized.subdirectory,
    }),
  }
}
