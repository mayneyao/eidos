import { useMemo, useState } from "react"
import type { ITreeNode } from "@/packages/core/types/ITreeNode"
import { Trash2Icon, Undo2Icon } from "lucide-react"
import { useTranslation } from "react-i18next"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useAllNodes } from "@/apps/web-app/hooks/use-nodes"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { useTabTitle } from "@/hooks/use-tab-title"

export default function TrashPage() {
  const { t } = useTranslation()
  useTabTitle(t("common.trash"))

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [clearAllConfirmOpen, setClearAllConfirmOpen] = useState(false)
  const [clearProgressOpen, setClearProgressOpen] = useState(false)
  const [clearProgress, setClearProgress] = useState(0)
  const allDeletedNodes = useAllNodes({ isDeleted: true })
  const { restoreNode, permanentlyDeleteNode, permanentlyDeleteNodes } =
    useSqlite()
  const [toDeleteNode, setToDeleteNode] = useState<ITreeNode | null>(null)
  const [search, setSearch] = useState("")
  const allNodes = useMemo(() => {
    return allDeletedNodes.filter((node) =>
      node.name.toLowerCase().includes(search.toLowerCase())
    )
  }, [search, allDeletedNodes])

  const { navigate } = useRouterAdapter()

  const handleRestore = (node: ITreeNode) => {
    restoreNode(node)
    navigate(`/${node.id}`)
  }

  const handleClickNode = (node: ITreeNode) => {
    navigate(`/${node.id}`)
  }

  const handlePermanentlyDelete = (
    event: React.MouseEvent,
    node: ITreeNode
  ) => {
    event.stopPropagation()
    setDeleteConfirmOpen(true)
    setToDeleteNode(node)
  }

  const confirmDelete = () => {
    if (toDeleteNode) {
      permanentlyDeleteNode(toDeleteNode)
      setToDeleteNode(null)
      setDeleteConfirmOpen(false)
    }
  }

  const confirmClearAll = async () => {
    setClearAllConfirmOpen(false)
    setClearProgressOpen(true)
    setClearProgress(0)

    try {
      await permanentlyDeleteNodes(allDeletedNodes, (progress) => {
        setClearProgress(progress)
      })
      setClearProgressOpen(false)
    } catch (error) {
      setClearProgressOpen(false)
      console.error("Failed to clear trash:", error)
    }
  }

  return (
    <div className="flex flex-col h-full p-4 gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{t("common.trash")}</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        {t("sidebar.trash.restoreOrPermanentlyDeleteNodes")}
      </p>
      <div className="flex gap-2">
        <Input
          placeholder={t("common.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1"
        />
        {Boolean(allDeletedNodes.length) && (
          <Button
            variant="destructive"
            size="xs"
            onClick={() => setClearAllConfirmOpen(true)}
            className="shrink-0"
          >
            {t("sidebar.trash.clearAll")}
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1 min-h-0">
        {!Boolean(allDeletedNodes.length) && (
          <p className="text-muted-foreground">
            {t("sidebar.trash.trashIsEmpty")}
          </p>
        )}
        {Boolean(allDeletedNodes.length) && !Boolean(allNodes.length) && (
          <p className="text-muted-foreground">{t("common.noResultsFound")}</p>
        )}
        {allNodes.map((node) => {
          return (
            <div
              key={node.id}
              className="flex cursor-pointer items-center justify-between px-2 py-1.5 hover:bg-secondary rounded-sm"
              onClick={() => handleClickNode(node)}
            >
              <span>
                {node.icon}
                {node.name || "Untitled"}
              </span>
              <div className="flex opacity-70">
                <Button variant="ghost" onClick={() => handleRestore(node)}>
                  <Undo2Icon className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  onClick={(e) => handlePermanentlyDelete(e, node)}
                >
                  <Trash2Icon className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )
        })}
      </ScrollArea>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("common.areYouAbsolutelySure")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("sidebar.trash.thisActionCannotBeUndone")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-500 hover:bg-red-600"
            >
              {t("common.continue")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={clearAllConfirmOpen}
        onOpenChange={setClearAllConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("sidebar.trash.clearAllConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("sidebar.trash.clearAllConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmClearAll}
              className="bg-red-500 hover:bg-red-600"
            >
              {t("common.continue")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={clearProgressOpen} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t("sidebar.trash.clearingTrash")}</DialogTitle>
            <DialogDescription>
              {t("sidebar.trash.clearingTrashDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Progress value={clearProgress} className="w-full" />
            <p className="text-sm text-muted-foreground text-center">
              {clearProgress}% {t("common.complete")}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
