import { useMemo, useState } from "react"
import { Share2 } from "lucide-react"

import { useCopyToClipboard } from "@/hooks/use-copy"
import { useCurrentNode } from "@/hooks/use-current-node"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { usePeer } from "@/hooks/use-peer"
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
import { useCurrentDomain } from "@/app/[database]/hook"

import { Input } from "./ui/input"
import { toast } from "./ui/use-toast"

export function ShareDialog() {
  const { peerId } = usePeer()
  const currentNode = useCurrentNode()

  const { space } = useCurrentPathInfo()
  const currentDomain = useCurrentDomain()
  const [open, setOpen] = useState(false)
  const shareLink = useMemo(() => {
    if (!currentNode) return ""
    return `${currentDomain}/share/${space}/${currentNode?.id}?peerId=${peerId}`
  }, [currentDomain, space, currentNode, peerId])

  const [link, copy] = useCopyToClipboard()
  const handleCopy = () => {
    copy(shareLink)
    // setOpen(false)
    toast({
      duration: 2000,
      description: "Link Copied✅",
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" disabled>
          <Share2 className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:min-w-[425px]">
        <DialogHeader>
          <DialogTitle>Share</DialogTitle>
          <DialogDescription>
            copy the link below, share it with your friends
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-4 py-4">
          <Input value={shareLink} />{" "}
          <Button type="submit" onClick={handleCopy}>
            Copy
          </Button>
        </div>
        <DialogFooter>
          {/* <Button type="submit" onClick={handleCopy}>
            Copy Link
          </Button> */}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
