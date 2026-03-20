import {
  FolderIcon,
  FileIcon,
  ImageIcon,
  VideoIcon,
  MusicIcon,
  FileTextIcon,
  FileSpreadsheetIcon,
  FileJsonIcon,
  FileArchiveIcon,
  CodeIcon,
} from "lucide-react"

interface FileIconProps {
  name: string
  kind: "file" | "directory"
  className?: string
}

export function FileIconComponent({
  name,
  kind,
  className = "h-5 w-5",
}: FileIconProps) {
  if (kind === "directory") {
    return <FolderIcon className={`${className} text-amber-500`} />
  }

  const ext = name.split(".").pop()?.toLowerCase() || ""

  // Images
  if (
    ["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp"].includes(ext)
  ) {
    return <ImageIcon className={`${className} text-purple-500`} />
  }
  // Videos
  if (["mp4", "webm", "mov", "avi", "mkv"].includes(ext)) {
    return <VideoIcon className={`${className} text-rose-500`} />
  }
  // Audio
  if (["mp3", "wav", "ogg", "flac", "m4a"].includes(ext)) {
    return <MusicIcon className={`${className} text-cyan-500`} />
  }
  // Documents
  if (["pdf", "doc", "docx", "txt", "rtf"].includes(ext)) {
    return <FileTextIcon className={`${className} text-blue-500`} />
  }
  // Spreadsheets
  if (["xls", "xlsx", "csv"].includes(ext)) {
    return <FileSpreadsheetIcon className={`${className} text-emerald-500`} />
  }
  // Code/Data
  if (["json", "xml", "yaml", "yml"].includes(ext)) {
    return <FileJsonIcon className={`${className} text-amber-600`} />
  }
  // Archives
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) {
    return <FileArchiveIcon className={`${className} text-orange-500`} />
  }
  // Code files
  if (
    [
      "js",
      "ts",
      "jsx",
      "tsx",
      "html",
      "css",
      "py",
      "go",
      "rs",
      "java",
      "cpp",
      "c",
      "h",
    ].includes(ext)
  ) {
    return <CodeIcon className={`${className} text-slate-500`} />
  }

  return <FileIcon className={`${className} text-slate-400`} />
}
