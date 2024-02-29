import { useMemo, useState } from "react"
import { Trash2Icon, Undo2Icon } from "lucide-react"
import { useNavigate } from "react-router-dom"

import { ITreeNode } from "@/lib/store/ITreeNode"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useAllNodes } from "@/hooks/use-nodes"
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

export const Trash = () => {
  const [open, setOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const allDeletedNodes = useAllNodes({ isDeleted: true })
  const { restoreNode, permanentlyDeleteNode } = useSqlite()
  const { space } = useCurrentPathInfo()
  const [toDeleteNode, setToDeleteNode] = useState<ITreeNode | null>(null)
  const [search, setSearch] = useState("")
  const allNodes = useMemo(() => {
    return allDeletedNodes.filter((node) =>
      node.name.toLowerCase().includes(search.toLowerCase())
    )
  }, [search, allDeletedNodes])

  const router = useNavigate()

  const handleOpenChange = (open: boolean) => {
    setOpen(open)
    setSearch("")
  }
  const handleRestore = (node: ITreeNode) => {
    restoreNode(node)
    setOpen(false)
    router(`/${space}/${node.id}`)
  }

  const handleClickNode = (node: ITreeNode) => {
    setOpen(false)
    router(`/${space}/${node.id}`)
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
            className="w-full cursor-pointer justify-start font-normal"
            asChild
          >
            <span>
              <Trash2Icon className="pr-2" /> <span>Trash</span>
            </span>
          </Button>
        </DialogTrigger>
        <DialogContent className="min-w-[400px]">
          <DialogHeader>
            <DialogTitle>Trash</DialogTitle>
            <DialogDescription>
              restore or permanently delete nodes
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          ></Input>

          <ScrollArea className="h-[500px] w-full">
            {!Boolean(allDeletedNodes.length) && <p>Trash is empty</p>}
            {!Boolean(allNodes.length) && <p>no results found</p>}
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
  )
}
