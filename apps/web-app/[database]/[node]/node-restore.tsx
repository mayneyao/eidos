import { useState } from "react"

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
            This node is in the trash
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => restoreNode(node)}
              >
                Restore
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDeleteConfirmOpen(true)}
              >
                Delete
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
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete the
                  node
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={confirmDelete}
                  className="bg-red-500 hover:bg-red-600"
                >
                  Continue
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </>
  )
}
