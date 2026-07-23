import {
  eidosFileUriClass,
  type AssetLease,
  type FileEntry,
} from "@eidos.space/eidos-file"

import type { EidosFileUIAssetSession } from "./context"

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
  purpose: AssetLease["purpose"]
): string {
  return purpose === "download"
    ? session.state.limits.assetBytesMax
    : session.state.limits.assetPreviewBytesMax
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
    decimalWithin(entry.size, assetPurposeLimit(session, purpose))
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
    !decimalWithin(lease.size, assetPurposeLimit(session, purpose)) ||
    !Number.isFinite(Date.parse(lease.expiresAt)) ||
    Date.parse(lease.expiresAt) <= Date.now()
  ) {
    throw new Error("Host returned an invalid or expired asset lease")
  }
}

export async function releaseEidosFileAssetLease(
  session: EidosFileUIAssetSession,
  lease: AssetLease
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
