import { useState } from "react"
import { useTranslation } from "react-i18next"

import { ITreeNode } from "@/lib/store/ITreeNode"
import { useGotoCurrentSpaceHome } from "@/hooks/use-goto"
import { useSqlite } from "@/hooks/use-sqlite"
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

export const NodeRestore = ({ node }: { node: ITreeNode | null }) => {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const { restoreNode, permanentlyDeleteNode } = useSqlite()
  const { t } = useTranslation()

  const gotoSpaceHome = useGotoCurrentSpaceHome()
  const confirmDelete = () => {
    if (!node) return
    permanentlyDeleteNode(node)
    setDeleteConfirmOpen(false)
    gotoSpaceHome()
  }

  if (!node) return null
  return (
    <>
      {Boolean(node && node.is_deleted) && (
        <>
          <div className="my-1 flex w-full items-center justify-center gap-8 bg-red-400 p-2">
            {t("doc.nodeInTrash")}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => restoreNode(node)}
              >
                {t("common.restore")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDeleteConfirmOpen(true)}
              >
                {t("common.delete")}
              </Button>
            </div>
          </div>
          <AlertDialog
            open={deleteConfirmOpen}
            onOpenChange={setDeleteConfirmOpen}
          >
            <AlertDialogTrigger></AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("common.areYouAbsolutelySure")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("doc.permanentDeleteWarning")}
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
      )}
    </>
  )
}
