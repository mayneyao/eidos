import type {
  PublishAccessGrant,
  SourceBundleFile,
  ValidatedSourceBundle,
} from "./contracts"

export const FREE_LIMITS = {
  activePublications: 10,
  storageBytes: 100 * 1024 * 1024,
  objectBytes: 25 * 1024 * 1024,
  markdownBytes: 2 * 1024 * 1024,
  bundleBytes: 50 * 1024 * 1024,
  attachments: 20,
  uploadsPerDay: 20,
} as const

const ATTACHMENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "video/mp4",
  "video/webm",
  "video/quicktime",
])

// Clamp at the service boundary as well as in the account projection. Older
// cached grants must never enable Runtime or raise the Free storage ceiling.
export function enforceFreeGrant(
  access: PublishAccessGrant
): PublishAccessGrant {
  if (access.plan !== "free") return access
  const cap = (value: string, maximum: number) =>
    (BigInt(value) < BigInt(maximum)
      ? BigInt(value)
      : BigInt(maximum)
    ).toString()
  return {
    ...access,
    handle: false,
    privatePublications: false,
    removeBranding: false,
    maxStorageBytes: cap(access.maxStorageBytes, FREE_LIMITS.storageBytes),
    maxObjectBytes: cap(access.maxObjectBytes, FREE_LIMITS.objectBytes),
    maxEidosFileBytes: cap(access.maxEidosFileBytes, FREE_LIMITS.objectBytes),
    retentionDays: 1,
    runtimeSecondsPerPeriod: "0",
    collect: {
      ...access.collect,
      maxInboxBytes: "0",
      passwordForms: false,
      emailNotifications: false,
    },
  }
}

export function freeBundleError(
  bundle: Pick<ValidatedSourceBundle, "entrypoint" | "sourceBytes"> & {
    driver: { id: string }
    manifest: { files: SourceBundleFile[] }
  }
): string | null {
  if (bundle.driver.id !== "org.eidos.driver.markdown")
    return "Publish Free supports Markdown only; Eidos Files and Forms require Pro"
  if (BigInt(bundle.entrypoint.bytes) > BigInt(FREE_LIMITS.markdownBytes))
    return "Publish Free Markdown documents cannot exceed 2 MiB"
  if (BigInt(bundle.sourceBytes) > BigInt(FREE_LIMITS.bundleBytes))
    return "Publish Free Source Bundles cannot exceed 50 MiB"
  const attachments = bundle.manifest.files.filter(
    (file) => file.role === "attachment"
  )
  if (attachments.length > FREE_LIMITS.attachments)
    return "Publish Free allows up to 20 attachments per publication"
  if (
    bundle.manifest.files.some(
      (file) => BigInt(file.bytes) > BigInt(FREE_LIMITS.objectBytes)
    )
  )
    return "Publish Free attachments cannot exceed 25 MiB"
  if (
    attachments.some(
      (file) => !ATTACHMENT_TYPES.has(file.mediaType.toLowerCase())
    )
  )
    return "This attachment type is not supported by Publish Free"
  return null
}
