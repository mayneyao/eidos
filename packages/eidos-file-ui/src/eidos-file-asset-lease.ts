import {
  type UrlImageLease,
  eidosFileUriClass,
  type AssetLease,
  type FileEntry,
} from "@eidos.space/eidos-file"

import type {
  AssetPresenter,
  EidosFileUIAssetSession,
  EidosFileThumbnailSize,
} from "./context"

export function resolveEidosFileThumbnail(
  session: EidosFileUIAssetSession,
  entryId: string,
  size: EidosFileThumbnailSize,
  context: ReturnType<typeof eidosFileAssetRequestContext>
): Promise<AssetLease> {
  const request = { sessionId: session.state.sessionId, entryId }
  return session.resolveThumbnail
    ? session.resolveThumbnail({ ...request, size }, context)
    : session.services.resolveAsset(
        { ...request, purpose: "thumbnail" },
        context
      )
}

export async function activateEidosFileAsset(
  session: EidosFileUIAssetSession,
  presenter: Pick<AssetPresenter<unknown>, "activate">,
  entry: FileEntry,
  action: "open" | "download"
): Promise<void> {
  const purpose = action === "download" ? "download" : "preview"
  if (!eidosFileAssetResolutionAllowed(session, entry, purpose)) return
  let lease: AssetLease | null = null
  try {
    lease = await session.services.resolveAsset(
      { sessionId: session.state.sessionId, entryId: entry.id, purpose },
      eidosFileAssetRequestContext(`asset-${action}`)
    )
    assertEidosFileAssetLease(session, entry, purpose, lease)
    await presenter.activate(
      { sessionId: session.state.sessionId, lease, action },
      eidosFileAssetRequestContext(`asset-${action}-activate`)
    )
  } finally {
    if (lease) await releaseEidosFileAssetLease(session, lease)
  }
}

let requestSequence = 0

export function eidosFileAssetRequestContext(prefix: string) {
  requestSequence = (requestSequence + 1) % Number.MAX_SAFE_INTEGER
  return {
    requestId: `eidos-ui-${prefix}-${requestSequence}`,
    deadlineMilliseconds: 30_000,
  }
}

function decimalWithin(value: string, maximum: string): boolean {
  try {
    return BigInt(value) >= 0n && BigInt(value) <= BigInt(maximum)
  } catch {
    return false
  }
}

function assetPurposeLimit(
  session: EidosFileUIAssetSession,
  purpose: AssetLease["purpose"],
  entry: FileEntry
): string {
  if (
    purpose === "thumbnail" &&
    eidosFileUriClass(entry.uri) === "relative" &&
    session.localAssetThumbnailBytesMax
  ) {
    return session.localAssetThumbnailBytesMax
  }
  if (
    purpose === "preview" &&
    eidosFileUriClass(entry.uri) === "relative" &&
    session.localAssetOpenBytesMax
  ) {
    return session.localAssetOpenBytesMax
  }
  return purpose === "download"
    ? session.state.limits.assetBytesMax
    : session.state.limits.assetPreviewBytesMax
}

export function eidosFileHasThumbnail(entry: FileEntry): boolean {
  return (
    eidosFileUriClass(entry.uri) === "relative" ||
    entry.mediaType.toLowerCase().startsWith("image/")
  )
}

export function eidosFileAssetResolutionAllowed(
  session: EidosFileUIAssetSession | undefined,
  entry: FileEntry,
  purpose: AssetLease["purpose"]
): session is EidosFileUIAssetSession {
  if (
    !session?.serviceCapabilities.canUseAssets ||
    session.state.limits.concurrentAssetLeasesMax < 1 ||
    ["fatal", "closed"].includes(session.state.phase)
  ) {
    return false
  }
  const uriClass = eidosFileUriClass(entry.uri)
  return (
    uriClass !== null &&
    session.state.capabilities.assetReadSchemes.includes(uriClass) &&
    decimalWithin(entry.size, assetPurposeLimit(session, purpose, entry))
  )
}

export function assertEidosFileAssetLease(
  session: EidosFileUIAssetSession,
  entry: FileEntry,
  purpose: AssetLease["purpose"],
  lease: AssetLease
): void {
  if (
    lease.entryId !== entry.id ||
    lease.purpose !== purpose ||
    lease.name !== entry.name ||
    lease.mediaType !== entry.mediaType ||
    lease.size !== entry.size ||
    lease.resourceToken.length === 0 ||
    !decimalWithin(lease.size, assetPurposeLimit(session, purpose, entry)) ||
    !Number.isFinite(Date.parse(lease.expiresAt)) ||
    Date.parse(lease.expiresAt) <= Date.now()
  ) {
    throw new Error("Host returned an invalid or expired asset lease")
  }
}

export async function releaseEidosFileAssetLease(
  session: EidosFileUIAssetSession,
  lease: AssetLease | UrlImageLease
): Promise<void> {
  try {
    await session.services.releaseAsset(
      { sessionId: session.state.sessionId, leaseId: lease.leaseId },
      eidosFileAssetRequestContext("asset-release")
    )
  } catch {
    // The Host owns final lease revocation and session-close cleanup.
  }
}
