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
} from "@eidos.space/eidos-file-ui/context"

import {
  acquireCliHostRemoteAsset,
  releaseCliHostAsset,
  resolveCliHostAsset,
  resolveCliHostUrlImage,
  type CliHostAssetManifest,
} from "./client"

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

function hostCapabilities(
  manifest: CliHostAssetManifest,
  access: "read" | "readwrite"
): HostCapabilities {
  const canWriteCurrent = access === "readwrite"
  return {
    canWriteCurrent,
    canSaveCopy: false,
    canRequestPermission: false,
    hasRecovery: false,
    assetReadSchemes: manifest.assetReadSchemes,
    assetWriteSchemes: canWriteCurrent ? manifest.assetWriteSchemes : [],
    casGuarantee: "cooperative",
    atomicReplace: canWriteCurrent,
    durability: "best-effort",
  }
}

function hostLimits(manifest: CliHostAssetManifest): HostLimits {
  return {
    sourceBytesMax: String(256 * 1024 * 1024),
    candidateBytesMax: String(256 * 1024 * 1024),
    recoveryBytesMax: "0",
    recoveryEntriesMax: 0,
    recoveryRetentionSecondsMax: 0,
    assetBytesMax: manifest.assetBytesMax,
    assetPreviewBytesMax: manifest.assetPreviewBytesMax,
    concurrentAssetLeasesMax: manifest.concurrentAssetLeasesMax,
    concurrentSessionsMax: 1,
  }
}

export function createCliHostAssetSession(
  manifest: CliHostAssetManifest,
  sessionId: string,
  fileId: string,
  access: "read" | "readwrite" = "readwrite"
): EidosFileUIAssetSession {
  const limits = hostLimits(manifest)
  const state: HostSessionState = {
    sessionId,
    phase: "ready-clean",
    capabilities: hostCapabilities(manifest, access),
    limits,
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
      return {
        entry: await acquireCliHostRemoteAsset(request.uri, request.name),
      }
    },
    async resolveAsset(request: {
      sessionId: string
      entryId: string
      purpose: AssetLease["purpose"]
    }) {
      if (request.sessionId !== sessionId) {
        throw new Error("Attachment session is no longer active")
      }
      return resolveCliHostAsset(request.entryId, request.purpose)
    },
    async resolveUrlImage(request: {
      sessionId: string
      uri: string
      purpose: UrlImageLease["purpose"]
    }) {
      if (request.sessionId !== sessionId) {
        throw new Error("Network image session is no longer active")
      }
      return resolveCliHostUrlImage(request.uri, request.purpose)
    },
    async releaseAsset(request: { sessionId: string; leaseId: string }) {
      if (request.sessionId !== sessionId) return
      await releaseCliHostAsset(request.leaseId)
    },
  } as unknown as HostServices
  return { services, serviceCapabilities: SERVICE_CAPABILITIES, state }
}

function activateResource(lease: AssetLease, action: "open" | "download") {
  const anchor = document.createElement("a")
  anchor.href = lease.resourceToken
  anchor.rel = "noopener noreferrer"
  if (action === "download") {
    anchor.download = lease.name
  } else {
    anchor.target = "_blank"
  }
  anchor.click()
}

function checkedExternalUrl(uri: string): string {
  if (uri.length === 0 || uri.length > 8_192 || uri !== uri.trim()) {
    throw new Error("Invalid external URL")
  }
  const url = new URL(uri)
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username !== "" ||
    url.password !== ""
  ) {
    throw new Error("External URLs require HTTP or HTTPS without credentials")
  }
  return uri
}

export function activateCliHostUrl(uri: string): void {
  window.open(checkedExternalUrl(uri), "_blank", "noopener,noreferrer")
}

export const cliHostAssetPresenter: AssetPresenter<ReactNode> = {
  renderImage({ lease, altText }) {
    return createElement("img", {
      src: lease.resourceToken,
      alt: altText,
      draggable: false,
      referrerPolicy: "no-referrer",
    })
  },
  loadImage({ lease, altText }) {
    return new Promise((resolve, reject) => {
      const image = new Image()
      image.alt = altText
      image.referrerPolicy = "no-referrer"
      image.onload = () => resolve(image)
      image.onerror = () =>
        reject(new Error("Attachment thumbnail failed to load"))
      image.src = lease.resourceToken
    })
  },
  async activate({ lease, action }) {
    activateResource(lease, action)
  },
}

export function pickCliHostAssetFiles(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input")
    input.type = "file"
    input.multiple = true
    input.addEventListener(
      "change",
      () => resolve(Array.from(input.files ?? [])),
      { once: true }
    )
    input.addEventListener("cancel", () => resolve([]), { once: true })
    input.click()
  })
}
