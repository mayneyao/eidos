import { useMemo } from "react"
import {
  useExtensionContext,
  type FileHandlerContext,
} from "@eidos.space/react"

/**
 * Extension metadata for Eidos
 * FileHandler type - handles media preview
 */
export const meta = {
  type: "fileHandler",
  componentName: "MediaPreview",
  icon: "image",
  fileHandler: {
    title: "Media Preview",
    description:
      "Built-in viewer for various media formats. Supports previewing images, playing video and audio files, and rendering PDF documents directly within the application.",
    extensions: [
      // Images
      ".png",
      ".jpg",
      ".jpeg",
      ".gif",
      ".svg",
      ".webp",
      ".ico",
      ".bmp",
      // Video
      ".mp4",
      ".webm",
      ".ogg",
      ".mov",
      // Audio
      ".mp3",
      ".wav",
      // PDF
      ".pdf",
    ],
  },
}

export function MediaPreview() {
  const ctx = useExtensionContext<FileHandlerContext>()
  const filePath = ctx.filePath

  // Normalize path for URL src (ensure leading slash to treat as absolute URL path in app)
  // Example: ~/image.png -> /~/image.png
  const src = filePath.startsWith("/") ? filePath : `/${filePath}`

  const ext = filePath.split(".").pop()?.toLowerCase() || ""

  const type = useMemo(() => {
    if (
      ["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp"].includes(ext)
    )
      return "image"
    if (["mp4", "webm", "ogg", "mov"].includes(ext)) return "video"
    if (["mp3", "wav"].includes(ext)) return "audio"
    if (ext === "pdf") return "pdf"
    return "unknown"
  }, [ext])

  if (type === "image") {
    return (
      <div className="flex items-center justify-center h-full w-full bg-background/50 overflow-hidden">
        <img
          src={src}
          alt={filePath}
          className="max-w-full max-h-full object-contain shadow-sm"
        />
      </div>
    )
  }

  if (type === "video") {
    return (
      <div className="flex items-center justify-center h-full w-full bg-black">
        <video src={src} controls className="max-w-full max-h-full" />
      </div>
    )
  }

  if (type === "audio") {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <audio src={src} controls />
      </div>
    )
  }

  if (type === "pdf") {
    return <iframe src={src} className="w-full h-full border-none" />
  }

  return (
    <div className="flex items-center justify-center h-full">
      <p className="text-muted-foreground">Unsupported media type: {ext}</p>
    </div>
  )
}
