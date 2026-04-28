import { TreeNodeType } from "@/packages/core/types/ITreeNode"
import {
  CalendarDaysIcon,
  File,
  FileSpreadsheet,
  Folder,
  FolderOpenIcon,
  Hash,
  Link2,
  ViewIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"

export const ItemIcon = ({
  type,
  className,
}: {
  type: string
  className?: string
}) => {
  const _className = cn("opacity-60", className)
  switch (type) {
    case TreeNodeType.Table:
      return <FileSpreadsheet className={_className} />
    case TreeNodeType.Doc:
      return <File className={_className} />
    case TreeNodeType.Dataview:
      return <ViewIcon className={_className} />
    case TreeNodeType.Link:
      return <Link2 className={_className} />
    case "folder":
      return <Folder className={_className} />
    case "folder-open":
      return <FolderOpenIcon className={_className} />
    case "day":
      return <CalendarDaysIcon className={_className} />
    case "property":
      return <Hash className={_className} />
    default:
      return <File className={_className} />
  }
}
