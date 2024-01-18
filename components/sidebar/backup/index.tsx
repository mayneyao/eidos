import { useState } from "react"
import { ArrowDownUpIcon } from "lucide-react"

import { timeAgo } from "@/lib/utils"
import { useBackup } from "@/hooks/use-backup"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useToast } from "@/components/ui/use-toast"

export const BackupStatus = () => {
  const { space } = useCurrentPathInfo()
  const [pullOpen, setPullOpen] = useState(false)
  const [pushOpen, setPushOpen] = useState(false)
  const { toast } = useToast()
  const { lastSyncStatus, backup, pull } = useBackup()
  const lastSyncDate = space && lastSyncStatus[space]
  const lastSyncTip = lastSyncDate ? timeAgo(new Date(lastSyncDate)) : ""
  const handlePush = () => {
    setPushOpen(false)
    backup(space)
    toast({
      title: "Start backup process",
    })
  }
  const handlePull = async () => {
    setPullOpen(false)
    toast({
      title: "Start pull process",
    })
    await pull(space)
    window.location.reload()
  }

  return (
    <Popover>
      <PopoverTrigger>
        <div className="flex cursor-pointer items-center gap-2 text-gray-500">
          <span>last sync:</span> <span>{lastSyncTip}</span>
          <ArrowDownUpIcon className="mt-1 h-4 w-4" />
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2">
        <Dialog open={pushOpen} onOpenChange={setPushOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" className="w-full font-mono">
              ⬆️Push
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Are you absolutely sure?</DialogTitle>
              <DialogDescription>
                This action cannot be undone. This will{" "}
                <span className="text-red-500"> overwrite </span> files in your
                <span className="text-red-500"> backup server</span>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="submit" onClick={handlePush}>
                Confirm
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={pullOpen} onOpenChange={setPullOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" className="w-full font-mono">
              ⬇️Pull
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Are you absolutely sure?</DialogTitle>
              <DialogDescription>
                This action cannot be undone. This will{" "}
                <span className="text-red-500"> overwrite </span> files in your
                <span className="text-red-500"> local browser</span>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="submit" onClick={handlePull}>
                Confirm
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PopoverContent>
    </Popover>
  )
}
