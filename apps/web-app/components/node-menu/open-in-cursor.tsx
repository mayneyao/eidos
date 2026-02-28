import { ExternalLinkIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { isDesktopMode } from "@/lib/env"
import type { ITreeNode } from "@/packages/core/types/ITreeNode"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"

interface NodeOpenInCursorProps {
  node: ITreeNode
  openInPlayground: (docId: string, filename?: string) => Promise<void>
}

export const NodeOpenInCursor = ({
  node,
  openInPlayground,
}: NodeOpenInCursorProps) => {
  const { t } = useTranslation()

  if (!isDesktopMode || node.type !== "doc") {
    return null
  }

  return (
    <DropdownMenuItem
      onClick={() => {
        openInPlayground(node.id, `${node.id}.md`)
      }}
    >
      <ExternalLinkIcon className="mr-2 h-4 w-4" />
      {t("common.openInCursor", "Open in Cursor")}
    </DropdownMenuItem>
  )
}
