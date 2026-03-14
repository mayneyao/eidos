import { CopyIcon, DownloadIcon, Share2Icon } from "lucide-react"
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

export const useCopyTableSchema = () => {
  const { sqlite } = useSqlite()
  const { toast } = useToast()

  const copyTableSchema = async (tableId: string) => {
    if (!sqlite) return
    try {
      const schema = await sqlite.schema.export(tableId)
      const json = JSON.stringify(schema)
      // Use btoa for ASCII-safe base64; handle unicode via encodeURIComponent trick
      const encoded = btoa(
        encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_, p1) =>
          String.fromCharCode(parseInt(p1, 16))
        )
      )
      await navigator.clipboard.writeText(encoded)
      toast({
        title: "Schema Copied",
        description:
          "Table schema (base64) copied to clipboard. Use ⌘K → Import Schema to recreate it.",
      })
    } catch (err) {
      console.error("Failed to copy schema:", err)
      toast({
        title: "Export Failed",
        description:
          err instanceof Error ? err.message : "Unknown error occurred",
        variant: "destructive",
      })
    }
  }

  return { copyTableSchema }
}

export const NodeExportContextMenu = ({ node }: { node: ITreeNode }) => {
  const { sqlite } = useSqlite()
  const { t } = useTranslation()

  const { copyDocAsMarkdown } = useCopyDocAsMarkdown()
  const { copyTableSchema } = useCopyTableSchema()

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
          <ContextMenuItem
            onClick={() => {
              copyTableSchema(node.id)
            }}
          >
            <Share2Icon className="mr-2 h-3.5 w-3.5" />
            Copy Schema
          </ContextMenuItem>
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

export const CopyTableSchemaContextMenu = ({ node }: { node: ITreeNode }) => {
  const { copyTableSchema } = useCopyTableSchema()

  if (node.type !== "table") return null

  return (
    <ContextMenuItem
      onClick={() => {
        copyTableSchema(node.id)
      }}
    >
      <Share2Icon className="mr-2 h-3.5 w-3.5" />
      Copy Schema
    </ContextMenuItem>
  )
}

export const NodeExport = ({ node }: { node: ITreeNode }) => {
  const { sqlite } = useSqlite()
  const { t } = useTranslation()
  const { copyDocAsMarkdown } = useCopyDocAsMarkdown()
  const { copyTableSchema } = useCopyTableSchema()

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
          <DropdownMenuItem
            onClick={() => {
              copyTableSchema(node.id)
            }}
          >
            <Share2Icon className="mr-2 h-3.5 w-3.5" />
            Copy Schema
          </DropdownMenuItem>
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
