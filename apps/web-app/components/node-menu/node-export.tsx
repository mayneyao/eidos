import { CopyIcon, DownloadIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import type { ITreeNode } from "@/packages/core/types/ITreeNode"
import { downloadFile } from "@/lib/web/file"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import {
  NativeContextMenuItem as ContextMenuItem,
  NativeContextMenuSub as ContextMenuSub,
  NativeContextMenuSubContent as ContextMenuSubContent,
  NativeContextMenuSubTrigger as ContextMenuSubTrigger,
} from "@/components/ui/native-context-menu"
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu"
import { useToast } from "@/components/ui/use-toast"

const useCopyDocAsMarkdown = () => {
  const { sqlite } = useSqlite()
  const { t } = useTranslation()
  const { toast } = useToast()
  const copyDocAsMarkdown = async (docId: string) => {
    const md = await sqlite?.getDocMarkdown(docId, { withTitle: true })
    if (md) {
      await navigator.clipboard.writeText(md)
      toast({
        title: t("common.copied"),
        description: "Markdown content copied to clipboard",
      })
    }
  }
  return { copyDocAsMarkdown }
}

export const NodeExportContextMenu = ({ node }: { node: ITreeNode }) => {
  const { sqlite } = useSqlite()
  const { t } = useTranslation()

  const { copyDocAsMarkdown } = useCopyDocAsMarkdown()

  const exportTable = async (tableId: string) => {
    const file = await sqlite?.exportCsv(tableId)
    file &&
      downloadFile(
        new Blob([file], { type: "text/csv" }),
        `${node.name || "Untitled"}.csv`
      )
  }
  if (node.type === "table") {
    return (
      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <DownloadIcon className="pr-2" />
          {t("common.export")}
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="w-48">
          <ContextMenuItem
            onClick={() => {
              exportTable(node.id)
            }}
          >
            Csv(.csv)
          </ContextMenuItem>
          <ContextMenuItem disabled>Excel(.xlsx)</ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuSub>
    )
  }
  if (node.type === "doc") {
    return (
      <ContextMenuItem
        onClick={() => {
          copyDocAsMarkdown(node.id)
        }}
      >
        <CopyIcon className="pr-2" />
        Copy as Markdown
      </ContextMenuItem>
    )
  }
  return null
}

export const NodeExport = ({ node }: { node: ITreeNode }) => {
  const { sqlite } = useSqlite()
  const { t } = useTranslation()
  const { copyDocAsMarkdown } = useCopyDocAsMarkdown()

  const exportTable = async (tableId: string) => {
    const file = await sqlite?.exportCsv(tableId)
    file &&
      downloadFile(
        new Blob([file], { type: "text/csv" }),
        `${node.name || "Untitled"}.csv`
      )
  }

  if (node.type === "table") {
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <DownloadIcon className="mr-2 h-4 w-4" />
          {t("common.export")}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-48">
          <DropdownMenuItem
            onClick={() => {
              exportTable(node.id)
            }}
          >
            Csv(.csv)
          </DropdownMenuItem>
          <DropdownMenuItem disabled>Excel(.xlsx)</DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    )
  }

  return (
    <DropdownMenuItem
      onClick={() => {
        copyDocAsMarkdown(node.id)
      }}
    >
      <CopyIcon className="mr-2 h-4 w-4" />
      Copy as Markdown
    </DropdownMenuItem>
  )
}
