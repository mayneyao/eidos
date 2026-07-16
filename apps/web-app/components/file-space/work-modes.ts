import { Bot, Files, GitBranch, type LucideIcon } from "lucide-react"

export type FileSpaceWorkMode = "files" | "version" | "agent"

export interface FileSpaceWorkModeDescriptor {
  id: FileSpaceWorkMode
  label: string
  description: string
  shortcut: 1 | 2 | 3
  icon: LucideIcon
}

export const FILE_SPACE_WORK_MODES: readonly FileSpaceWorkModeDescriptor[] = [
  {
    id: "files",
    label: "Files",
    description: "Browse and edit files in this Space",
    shortcut: 1,
    icon: Files,
  },
  {
    id: "version",
    label: "Version",
    description: "Review changes and history for this Space",
    shortcut: 2,
    icon: GitBranch,
  },
  {
    id: "agent",
    label: "Agent",
    description: "Continue Agent sessions for this Space",
    shortcut: 3,
    icon: Bot,
  },
]

export function fileSpaceAgentConversationId(url: string): string | null {
  try {
    const pathname = new URL(url, "https://eidos.local").pathname
    const match = pathname.match(/^\/agent\/([^/]+)$/)
    return match ? decodeURIComponent(match[1]) : null
  } catch {
    return null
  }
}

export function isFileSpaceAgentUrl(url: string): boolean {
  return fileSpaceAgentConversationId(url) !== null
}
