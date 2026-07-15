import { canonicalExtensionPackagePath } from "./digest"
import { parseStrictJson } from "./strict-json"
import type { ExtensionDiagnostic, ExtensionLockV1 } from "./types"

const LOCK_MAX_BYTES = 64 * 1024
const LOCK_MAX_DEPTH = 16

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function hasExactKeys(
  value: Record<string, unknown>,
  required: readonly string[]
): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...required].sort()
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  )
}

function isCanonicalGithubRepository(value: string): boolean {
  try {
    const url = new URL(value)
    return (
      url.protocol === "https:" &&
      url.hostname === "github.com" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      /^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(url.pathname) &&
      url.origin + url.pathname === value
    )
  } catch {
    return false
  }
}

function isCanonicalSubdirectory(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 512) return false
  try {
    return (
      canonicalExtensionPackagePath(value) === value &&
      value.split("/").length <= 32
    )
  } catch {
    return false
  }
}

function invalidLock(message: string): {
  lock?: undefined
  diagnostics: ExtensionDiagnostic[]
} {
  return {
    diagnostics: [
      {
        code: "package-lock-invalid",
        severity: "warning",
        message,
        path: "extension.lock.json",
      },
    ],
  }
}

export function parseExtensionLock(text: string): {
  lock?: ExtensionLockV1
  diagnostics: ExtensionDiagnostic[]
} {
  const parsed = parseStrictJson(text, {
    label: "extension.lock.json",
    maxBytes: LOCK_MAX_BYTES,
    maxDepth: LOCK_MAX_DEPTH,
  })
  if (parsed.issues.length > 0) {
    return invalidLock(parsed.issues.map((issue) => issue.message).join("; "))
  }
  const value = parsed.value
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["lockVersion", "source", "contentDigest"]) ||
    value.lockVersion !== 1 ||
    !isRecord(value.source) ||
    !hasExactKeys(
      value.source,
      "subdirectory" in value.source
        ? ["kind", "repository", "requested", "commit", "subdirectory"]
        : ["kind", "repository", "requested", "commit"]
    ) ||
    value.source.kind !== "github" ||
    typeof value.source.repository !== "string" ||
    !isCanonicalGithubRepository(value.source.repository) ||
    typeof value.source.requested !== "string" ||
    value.source.requested.length === 0 ||
    value.source.requested.length > 200 ||
    /[\0\r\n]/.test(value.source.requested) ||
    typeof value.source.commit !== "string" ||
    !/^[0-9a-f]{40}$/.test(value.source.commit) ||
    ("subdirectory" in value.source &&
      !isCanonicalSubdirectory(value.source.subdirectory)) ||
    typeof value.contentDigest !== "string" ||
    !/^sha256:[0-9a-f]{64}$/.test(value.contentDigest)
  ) {
    return invalidLock(
      "extension.lock.json does not match the host-owned version 1 lock contract"
    )
  }

  return { lock: value as unknown as ExtensionLockV1, diagnostics: [] }
}
