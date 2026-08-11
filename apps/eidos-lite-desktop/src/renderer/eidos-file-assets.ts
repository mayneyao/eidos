import { createElement, type ReactNode } from "react"
import type {
  AssetLease,
  HostCapabilities,
  HostLimits,
  HostServiceCapabilities,
  HostServices,
  HostSessionState,
  UrlImageLease,
} from "@eidos.space/eidos-file"
import type {
  AssetPresenter,
  EidosFileUIAssetSession,
} from "@eidos.space/eidos-file-ui"

const objectUrlsByResource = new Map<string, string>()
const resourcesByLease = new Map<string, string>()

function releaseObjectUrl(leaseId: string): void {
  const resourceToken = resourcesByLease.get(leaseId)
  if (!resourceToken) return
  resourcesByLease.delete(leaseId)
  const objectUrl = objectUrlsByResource.get(resourceToken)
  objectUrlsByResource.delete(resourceToken)
  if (objectUrl) URL.revokeObjectURL(objectUrl)
}

function objectUrl(lease: AssetLease | UrlImageLease): string {
  const value = objectUrlsByResource.get(lease.resourceToken)
  if (!value) throw new Error("Attachment preview resource is unavailable")
  return value
}

const SERVICE_CAPABILITIES: HostServiceCapabilities = {
  canOpenSource: true,
  canCreateSource: false,
  canRequestPermission: false,
  canSaveCopy: false,
  canReconcileCommit: false,
  canResolveConflict: false,
  canRecover: false,
  canUseAssets: true,
}

const HOST_CAPABILITIES: HostCapabilities = {
  canWriteCurrent: true,
  canSaveCopy: false,
  canRequestPermission: false,
  hasRecovery: false,
  assetReadSchemes: ["https", "relative"],
  assetWriteSchemes: ["https", "relative"],
  casGuarantee: "cooperative",
  atomicReplace: true,
  durability: "best-effort",
}

const HOST_LIMITS: HostLimits = {
  sourceBytesMax: String(256 * 1024 * 1024),
  candidateBytesMax: String(256 * 1024 * 1024),
  recoveryBytesMax: "0",
  recoveryEntriesMax: 0,
  recoveryRetentionSecondsMax: 0,
  assetBytesMax: String(256 * 1024 * 1024),
  assetPreviewBytesMax: String(64 * 1024 * 1024),
  concurrentAssetLeasesMax: 16,
  concurrentSessionsMax: 16,
}

export function createEidosLiteAssetSession(
  sessionId: string,
  fileId: string
): EidosFileUIAssetSession {
  const state: HostSessionState = {
    sessionId,
    phase: "ready-clean",
    capabilities: HOST_CAPABILITIES,
    limits: HOST_LIMITS,
    fileId,
  }
  const services = {
    async acquireRemoteAsset(request: {
      sessionId: string
      uri: string
      name?: string
    }) {
      if (request.sessionId !== sessionId) {
        throw new Error("Attachment session is no longer active")
      }
      const entry = await window.eidosLite.acquireRemoteEidosFileAsset(
        sessionId,
        request.uri,
        request.name
      )
      return { entry }
    },
    async resolveAsset(request: {
      sessionId: string
      entryId: string
      purpose: AssetLease["purpose"]
    }) {
      if (request.sessionId !== sessionId) {
        throw new Error("Attachment session is no longer active")
      }
      const resolution = await window.eidosLite.resolveEidosFileAsset(
        sessionId,
        request.entryId,
        request.purpose
      )
      if (resolution.bytes) {
        registerObjectUrl(resolution.lease, resolution.bytes)
      }
      return resolution.lease
    },
    async resolveUrlImage(request: {
      sessionId: string
      uri: string
      purpose: UrlImageLease["purpose"]
    }) {
      if (request.sessionId !== sessionId) {
        throw new Error("Network image session is no longer active")
      }
      const resolution = await window.eidosLite.resolveEidosFileUrlImage(
        sessionId,
        request.uri,
        request.purpose
      )
      registerObjectUrl(resolution.lease, resolution.bytes)
      return resolution.lease
    },
    async releaseAsset(request: { sessionId: string; leaseId: string }) {
      if (request.sessionId !== sessionId) return
      releaseObjectUrl(request.leaseId)
      await window.eidosLite.releaseEidosFileAsset(sessionId, request.leaseId)
    },
  } as unknown as HostServices
  return { services, serviceCapabilities: SERVICE_CAPABILITIES, state }
}

function registerObjectUrl(
  lease: AssetLease | UrlImageLease,
  bytes: Uint8Array
): void {
  const blobBytes = new Uint8Array(bytes.byteLength)
  blobBytes.set(bytes)
  const url = URL.createObjectURL(
    new Blob([blobBytes], { type: lease.mediaType })
  )
  objectUrlsByResource.set(lease.resourceToken, url)
  resourcesByLease.set(lease.leaseId, lease.resourceToken)
}

export const eidosLiteAssetPresenter: AssetPresenter<ReactNode> = {
  renderImage({ lease, altText }) {
    return createElement("img", {
      src: objectUrl(lease),
      alt: altText,
      draggable: false,
    })
  },
  loadImage({ lease, altText }) {
    return new Promise((resolve, reject) => {
      const image = new Image()
      image.alt = altText
      image.onload = () => resolve(image)
      image.onerror = () =>
        reject(new Error("Attachment thumbnail failed to load"))
      image.src = objectUrl(lease)
    })
  },
  activate({ sessionId, lease, action }) {
    return window.eidosLite.activateEidosFileAsset(
      sessionId,
      lease.leaseId,
      action
    )
  },
}
