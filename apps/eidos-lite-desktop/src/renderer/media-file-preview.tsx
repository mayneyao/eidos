import { FileMusic, FolderOpen, Image, MonitorPlay } from "lucide-react"

import type { TextFilePreviewResult } from "../shared/contracts"
import { fileManagerMessage } from "../shared/platform-copy"
import { useEidosLiteI18n } from "./i18n"

type MediaPreview = Extract<TextFilePreviewResult, { type: "media" }>

function formatBytes(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`
  if (bytes < 1_024 * 1_024) return `${(bytes / 1_024).toFixed(1)} KB`
  return `${(bytes / (1_024 * 1_024)).toFixed(1)} MB`
}

export function MediaFilePreview({
  preview,
  platform,
  onReveal,
}: {
  preview: MediaPreview
  platform: string
  onReveal(): void
}) {
  const { t } = useEidosLiteI18n()
  const kindLabel =
    preview.mediaKind === "image"
      ? t("Image")
      : preview.mediaKind === "video"
        ? t("Video")
        : t("Audio")

  return (
    <section
      className="media-file-preview"
      aria-label={t("{kind} preview of {path}", {
        kind: kindLabel,
        path: preview.relativePath,
      })}
      data-media-file-preview={preview.relativePath}
      data-media-file-preview-kind={preview.mediaKind}
    >
      <header className="media-preview-meta">
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
        <button
          type="button"
          className="editor-empty-action media-preview-reveal"
          onClick={onReveal}
        >
          <FolderOpen aria-hidden="true" /> {t(fileManagerMessage(platform))}
        </button>
      </header>
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
