import { randomUUID } from "node:crypto"
import type { AssetLease } from "@eidos.space/eidos-file"

import { Injectable } from "../../common/di"

export interface DesktopEidosFileAssetLeaseRecord {
  lease: AssetLease
  sessionId: string
  spaceId: string
  bytes: Uint8Array
  expiresAtMilliseconds: number
}

/** Main-process lease registry consumed by the Host and the local HTTP presenter. */
@Injectable()
export class EidosFileAssetLeaseStore {
  private readonly leases = new Map<string, DesktopEidosFileAssetLeaseRecord>()
  private readonly presentationTokens = new Map<string, string>()

  issue(
    record: Omit<DesktopEidosFileAssetLeaseRecord, "lease"> & {
      lease: Omit<AssetLease, "resourceToken">
    }
  ): AssetLease {
    this.prune()
    const presentationToken = randomUUID()
    const lease: AssetLease = {
      ...record.lease,
      resourceToken: `/_eidos-file-assets/${presentationToken}`,
    }
    this.leases.set(lease.leaseId, { ...record, lease })
    this.presentationTokens.set(presentationToken, lease.leaseId)
    return lease
  }

  get(sessionId: string, leaseId: string): DesktopEidosFileAssetLeaseRecord {
    this.prune()
    const record = this.leases.get(leaseId)
    if (!record || record.sessionId !== sessionId) {
      throw Object.assign(new Error("Asset lease is unavailable"), {
        code: "asset-unavailable",
      })
    }
    return record
  }

  resolvePresentation(
    presentationToken: string,
    spaceId: string
  ): DesktopEidosFileAssetLeaseRecord | null {
    this.prune()
    const leaseId = this.presentationTokens.get(presentationToken)
    if (!leaseId) return null
    const record = this.leases.get(leaseId)
    if (
      !record ||
      record.spaceId !== spaceId ||
      record.lease.purpose !== "thumbnail"
    ) {
      return null
    }
    return record
  }

  release(sessionId: string, leaseId: string): void {
    const record = this.leases.get(leaseId)
    if (!record || record.sessionId !== sessionId) return
    this.delete(record)
  }

  releaseSession(sessionId: string): void {
    for (const record of this.leases.values()) {
      if (record.sessionId === sessionId) this.delete(record)
    }
  }

  countSession(sessionId: string): number {
    this.prune()
    let count = 0
    for (const record of this.leases.values()) {
      if (record.sessionId === sessionId) count += 1
    }
    return count
  }

  private prune(): void {
    const now = Date.now()
    for (const record of this.leases.values()) {
      if (record.expiresAtMilliseconds <= now) this.delete(record)
    }
  }

  private delete(record: DesktopEidosFileAssetLeaseRecord): void {
    this.leases.delete(record.lease.leaseId)
    const token = record.lease.resourceToken.split("/").at(-1)
    if (token) this.presentationTokens.delete(token)
  }
}
