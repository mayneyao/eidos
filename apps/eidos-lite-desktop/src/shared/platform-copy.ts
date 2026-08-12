export type FileManagerMessage =
  | "Reveal in Finder"
  | "Show in File Explorer"
  | "Show in File Manager"

export function fileManagerMessage(platform: string): FileManagerMessage {
  if (platform === "darwin") return "Reveal in Finder"
  if (platform === "win32") return "Show in File Explorer"
  return "Show in File Manager"
}
