import { createElement, type ReactNode } from "react"
import {
  assertEidosFileValues,
  eidosFileUriClass,
  type FileEntry,
  type HostServices,
} from "@eidos.space/eidos-file"
import type { AssetPresenter, EidosFileUIAssetSession } from "./context"

/** One trusted editor's Runtime results; never populated from plugin messages. */
export function createMobileAssets(sessionId: string, baseUrl: string) {
  const entries = new Map<string, FileEntry>()
  const dialogs = new Set<HTMLDialogElement>()
  let closed = false
  let sequence = 0
  function observe(value: unknown): void {
    if (closed) return
    if (typeof value === "string") {
      // Runtime File cells are encoded JSON, while some responses contain decoded cells.
      if (value.startsWith("[") && value.includes('"uri"')) {
        try {
          observe(JSON.parse(value))
        } catch {
          /* Ordinary text is not a File cell. */
        }
      }
    } else if (Array.isArray(value)) {
      for (const item of value) observe(item)
    } else if (value && typeof value === "object") {
      const candidate = value as Record<string, unknown>
      if (
        typeof candidate.uri === "string" &&
        typeof candidate.id === "string"
      ) {
        try {
          const entry = assertEidosFileValues([candidate])[0]
          entries.set(entry.id, entry)
        } catch {
          /* Only canonical File entries may become resources. */
        }
      } else {
        for (const item of Object.values(candidate)) observe(item)
      }
    }
  }
  const services = {
    async resolveAsset(request: {
      sessionId: string
      entryId: string
      purpose: "thumbnail" | "preview" | "download"
    }) {
      if (closed || request.sessionId !== sessionId)
        throw new Error("附件会话已结束")
      const entry = entries.get(request.entryId)
      if (!entry) throw new Error("附件记录不存在，请重新打开记录")
      if (BigInt(entry.size) > 16n * 1024n * 1024n)
        throw new Error("图片超过 16 MB")
      const kind = eidosFileUriClass(entry.uri)
      if (kind !== "data" && kind !== "relative")
        throw new Error("此附件需要在线访问")
      const url = kind === "data" ? entry.uri : new URL(entry.uri, baseUrl).href
      if (kind === "relative" && !url.startsWith(baseUrl))
        throw new Error("附件超出数据文件所在目录")
      return {
        leaseId: `${sessionId}:${++sequence}`,
        entryId: entry.id,
        purpose: request.purpose,
        name: entry.name,
        mediaType: entry.mediaType,
        size: entry.size,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        resourceToken: url,
      }
    },
    async releaseAsset() {},
  } as unknown as HostServices
  const session: EidosFileUIAssetSession = {
    services,
    serviceCapabilities: {
      canOpenSource: true,
      canCreateSource: false,
      canRequestPermission: false,
      canSaveCopy: false,
      canReconcileCommit: false,
      canResolveConflict: false,
      canRecover: false,
      canUseAssets: true,
    },
    state: {
      sessionId,
      phase: "ready-clean",
      fileId: sessionId,
      capabilities: {
        canWriteCurrent: true,
        canSaveCopy: false,
        canRequestPermission: false,
        hasRecovery: false,
        assetReadSchemes: ["data", "relative"],
        assetWriteSchemes: [],
        casGuarantee: "cooperative",
        atomicReplace: false,
        durability: "best-effort",
      },
      limits: {
        sourceBytesMax: "268435456",
        candidateBytesMax: "268435456",
        recoveryBytesMax: "0",
        recoveryEntriesMax: 0,
        recoveryRetentionSecondsMax: 0,
        assetBytesMax: "0",
        assetPreviewBytesMax: "16777216",
        concurrentAssetLeasesMax: 128,
        concurrentSessionsMax: 1,
      },
    },
  }
  return {
    session,
    observe,
    presenter: createMobileAssetPresenter(dialogs),
    close() {
      closed = true
      entries.clear()
      for (const dialog of dialogs) dialog.remove()
      dialogs.clear()
    },
  }
}

function createMobileAssetPresenter(
  dialogs: Set<HTMLDialogElement>
): AssetPresenter<ReactNode> {
  return {
    renderImage: ({ lease, altText }) =>
      createElement("img", {
        src: lease.resourceToken,
        alt: altText,
        draggable: false,
      }),
    loadImage: ({ lease, altText }) =>
      new Promise((resolve, reject) => {
        const image = new Image()
        image.alt = altText
        image.onload = () => resolve(image)
        image.onerror = () =>
          reject(new Error("图片无法读取，请确认附件文件已同步到本机"))
        image.src = lease.resourceToken
      }),
    async activate({ lease, action }) {
      if (action === "download") throw new Error("移动端暂不支持导出此附件")
      if (!lease.mediaType.startsWith("image/"))
        throw new Error("请使用原生编辑器打开此附件")
      const dialog = document.createElement("dialog")
      dialogs.add(dialog)
      const close = document.createElement("button")
      close.textContent = "关闭"
      const image = document.createElement("img")
      image.src = lease.resourceToken
      image.alt = lease.name
      image.style.cssText =
        "display:block;max-width:100%;max-height:80dvh;object-fit:contain"
      close.onclick = () => dialog.close()
      dialog.onclose = () => {
        dialogs.delete(dialog)
        dialog.remove()
      }
      dialog.append(close, image)
      document.body.append(dialog)
      dialog.showModal()
    },
  }
}
