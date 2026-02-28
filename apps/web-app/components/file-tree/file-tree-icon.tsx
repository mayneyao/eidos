import {
  BlocksIcon,
  File,
  FileSpreadsheet,
  Folder,
  ViewIcon,
} from "lucide-react"

import { IconRenderer } from "@/components/ui/icon-picker"

import type { FileTreeNode } from "./index"

// Check if a string is an emoji character
const isEmoji = (str: string): boolean => {
  // Emoji regex pattern - matches most emoji characters including:
  // - Basic emoji (😀, 🎉, etc.)
  // - Emoji with modifiers (👨‍👩‍👧, etc.)
  // - Flag emojis
  // - Keycap sequences
  const emojiRegex =
    /^(?:[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F700}-\u{1F77F}]|[\u{1F780}-\u{1F7FF}]|[\u{1F800}-\u{1F8FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{200D}]|[\u{20D0}-\u{20FF}]|[\u{FE00}-\u{FE0F}]|[\u{FE20}-\u{FE2F}])+$/u
  return emojiRegex.test(str.trim())
}

interface FileTreeIconProps {
  node: FileTreeNode
}

export const FileTreeIcon = ({ node }: FileTreeIconProps) => {
  // Use custom icon from metadata if available
  if (node.metadata?.icon) {
    const iconValue = String(node.metadata.icon)
    // If icon is an emoji, display it directly
    if (isEmoji(iconValue)) {
      return (
        <span className="w-4 h-4 flex items-center justify-center text-base leading-none">
          {iconValue}
        </span>
      )
    }
    // Otherwise use IconRenderer
    return <IconRenderer name={node.metadata.icon as any} className="w-4 h-4" />
  }

  // Use default icons based on node type
  if (node.kind === "directory") {
    return <Folder className="w-4 h-4 text-muted-foreground" />
  }

  switch (node.metadata?.nodeType) {
    case "table":
      return <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
    case "doc":
      return <File className="w-4 h-4 text-muted-foreground" />
    case "extension":
      return <BlocksIcon className="w-4 h-4 text-muted-foreground" />
    case "dataview":
      return <ViewIcon className="w-4 h-4 text-muted-foreground" />
    case "folder":
      return <Folder className="w-4 h-4 text-muted-foreground" />
    default:
      return <File className="w-4 h-4 text-muted-foreground" />
  }
}
