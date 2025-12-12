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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useAllNodes } from "@/apps/web-app/hooks/use-nodes"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"

export const Trash = () => {
  const [open, setOpen] = useState(false)
  const { t } = useTranslation()
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const allDeletedNodes = useAllNodes({ isDeleted: true })
  const { restoreNode, permanentlyDeleteNode } = useSqlite()
  const [toDeleteNode, setToDeleteNode] = useState<ITreeNode | null>(null)
  const [search, setSearch] = useState("")
  const allNodes = useMemo(() => {
    return allDeletedNodes.filter((node) =>
      node.name.toLowerCase().includes(search.toLowerCase())
    )
  }, [search, allDeletedNodes])

  const { navigate } = useRouterAdapter()

  const handleOpenChange = (open: boolean) => {
    setOpen(open)
    setSearch("")
  }
  const handleRestore = (node: ITreeNode) => {
    restoreNode(node)
    setOpen(false)
    navigate(`/${node.id}`)
  }

  const handleClickNode = (node: ITreeNode) => {
    setOpen(false)
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

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          <Button
            variant={"ghost"}
            size="sm"
            className="h-8 w-8 p-0 cursor-pointer"
            title={t("common.trash")}
          >
            <Trash2Icon className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent className="min-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t("common.trash")}</DialogTitle>
            <DialogDescription>
              {t("sidebar.trash.restoreOrPermanentlyDeleteNodes")}
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder={t("common.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          ></Input>

          <ScrollArea className="h-[500px] w-full">
            {!Boolean(allDeletedNodes.length) && (
              <p>{t("sidebar.trash.trashIsEmpty")}</p>
            )}
            {!Boolean(allNodes.length) && <p>{t("common.noResultsFound")}</p>}
            {allNodes.map((node) => {
              return (
                <div
                  key={node.id}
                  className="flex cursor-pointer items-center justify-between px-2 hover:bg-secondary"
                  onClick={() => handleClickNode(node)}
                >
                  <span>
                    {node.icon}
                    {node.name || "Untitled"}
                  </span>
                  <div className="flex opacity-70">
                    <Button variant="ghost" onClick={() => handleRestore(node)}>
                      <Undo2Icon className="h-4 w-4"></Undo2Icon>
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={(e) => handlePermanentlyDelete(e, node)}
                    >
                      <Trash2Icon className="h-4 w-4"></Trash2Icon>
                    </Button>
                  </div>
                </div>
              )
            })}
          </ScrollArea>
        </DialogContent>
      </Dialog>
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogTrigger></AlertDialogTrigger>
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
    </>
  )
}
