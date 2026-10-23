import { useRef } from "react"
import { FileMusic, Image, MonitorPlay } from "lucide-react"

import type { TextFilePreviewResult } from "../shared/contracts"
import { useFileContentFocusRequest } from "./file-content-focus"
import { useEidosLiteI18n } from "./i18n"

type MediaPreview = Extract<TextFilePreviewResult, { type: "media" }>

function formatBytes(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`
  if (bytes < 1_024 * 1_024) return `${(bytes / 1_024).toFixed(1)} KB`
  return `${(bytes / (1_024 * 1_024)).toFixed(1)} MB`
}

export function MediaFileMetadata({ preview }: { preview: MediaPreview }) {
  const { t } = useEidosLiteI18n()
  const kindLabel =
    preview.mediaKind === "image"
      ? t("Image")
      : preview.mediaKind === "video"
        ? t("Video")
        : t("Audio")
  return (
    <span className="media-file-metadata">
      <span className="media-preview-kind">
        {preview.mediaKind === "image" ? (
          <Image aria-hidden="true" />
        ) : preview.mediaKind === "video" ? (
          <MonitorPlay aria-hidden="true" />
        ) : (
          <FileMusic aria-hidden="true" />
        )}
        {kindLabel}
      </span>
      <span>{formatBytes(preview.size)}</span>
    </span>
  )
}

export function MediaFilePreview({
  preview,
  focusRequestToken = 0,
}: {
  preview: MediaPreview
  focusRequestToken?: number
}) {
  const { t } = useEidosLiteI18n()
  const previewRef = useRef<HTMLElement>(null)
  useFileContentFocusRequest(focusRequestToken, () => {
    const preview = previewRef.current
    const media = preview?.querySelector<HTMLElement>("video, audio")
    ;(media ?? preview)?.focus({ preventScroll: true })
  })
  const kindLabel = t(
    preview.mediaKind === "image"
      ? "Image"
      : preview.mediaKind === "video"
        ? "Video"
        : "Audio"
  )

  return (
    <section
      ref={previewRef}
      tabIndex={-1}
      className="media-file-preview"
      aria-label={t("{kind} preview of {path}", {
        kind: kindLabel,
        path: preview.relativePath,
      })}
      data-media-file-preview={preview.relativePath}
      data-media-file-preview-kind={preview.mediaKind}
    >
      <div className="media-preview-stage">
        {preview.mediaKind === "image" ? (
          <img src={preview.previewUrl} alt={preview.relativePath} />
        ) : preview.mediaKind === "video" ? (
          <video src={preview.previewUrl} controls playsInline />
        ) : (
          <div className="media-preview-audio">
            <FileMusic aria-hidden="true" />
            <audio src={preview.previewUrl} controls />
          </div>
        )}
      </div>
    </section>
  )
}
