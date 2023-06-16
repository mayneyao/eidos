import { Share2 } from "lucide-react"
import { useMemo, useState } from "react"

import { useCurrentDomain } from "@/app/[database]/hook"
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
import { useCopyToClipboard } from "@/hooks/use-copy"
import { usePeer } from "@/hooks/use-peer"

import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { toast } from "./ui/use-toast"

export function ShareDialog() {
  const { peerId } = usePeer()
  const { database, tableName: table }  = useCurrentPathInfo()
  const currentDomain = useCurrentDomain()
  const [open, setOpen] = useState(false)
  const shareLink = useMemo(() => {
    return `${currentDomain}/share/${database}/${table}?peerId=${peerId}`
  }, [currentDomain, database, table, peerId])
  const [link, copy] = useCopyToClipboard()
  const handleCopy = () => {
    copy(shareLink)
    setOpen(false)
    toast({
      duration: 2000,
      description: "Link Copied",
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost">
          <Share2 className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Share</DialogTitle>
          <DialogDescription>
            copy the link below, share it with your friends
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div>{shareLink}</div>
        </div>
        <DialogFooter>
          <Button type="submit" onClick={handleCopy}>
            Copy Link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
