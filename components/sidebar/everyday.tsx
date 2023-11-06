import { useState } from "react"
import { CalendarDays } from "lucide-react"
import { Link, useNavigate } from "react-router-dom"

import { useDocEditor } from "@/hooks/use-doc-editor"
import { useSqlite } from "@/hooks/use-sqlite"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

import { Button } from "../ui/button"
import { Progress } from "../ui/progress"

// convertMarkdown2State
export const EverydaySidebarItem = ({ space }: { space: string }) => {
  const { sqlite } = useSqlite(space)
  const { convertMarkdown2State } = useDocEditor(sqlite)
  const [progress, setProgress] = useState(0)
  const [importing, setImporting] = useState(false)
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const getDir = async () => {
    if (!sqlite) return
    const dirHandle = await (window as any).showDirectoryPicker()
    const oldDays = await sqlite.listAllDays()
    const oldDayFileNameSet = new Set(oldDays.map((d) => d.id))
    const allDays = []
    for await (let [name, handle] of dirHandle.entries()) {
      allDays.push(name)
    }
    const allCount = allDays.length
    setImporting(true)
    let index = 0
    for await (let [name, handle] of dirHandle.entries()) {
      const _p = (index / allCount) * 100
      setProgress(_p)
      index++
      if (oldDayFileNameSet.has(name)) {
        console.log(index, name, "skip")
        continue
      } else if (name.endsWith(".md")) {
        console.log(index, _p)
        const nameWithoutExt = name.split(".")[0]
        const fileHandle = handle as FileSystemFileHandle
        const file = await fileHandle.getFile()
        const content = await file.text()
        try {
          const newFilename = nameWithoutExt.split("_").join("-")
          const state = await convertMarkdown2State(content)
          await sqlite.addDoc(newFilename, state, content, true)
        } catch (error) {
          console.warn(error)
        }
      }
    }
    navigate(`/${space}/everyday`)
    setOpen(false)
    setImporting(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <ContextMenu>
        <ContextMenuTrigger>
          <Button
            variant={"ghost"}
            size="sm"
            className="w-full justify-start font-normal"
            asChild
          >
            <Link to={`/${space}/everyday`}>
              <CalendarDays className="pr-2" />
              Everyday
            </Link>
          </Button>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem disabled>Open</ContextMenuItem>
          <ContextMenuItem disabled>Download</ContextMenuItem>
          <DialogTrigger asChild>
            <ContextMenuItem>
              <span>Import</span>
            </ContextMenuItem>
          </DialogTrigger>
        </ContextMenuContent>
      </ContextMenu>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import From Logseq(Beta)</DialogTitle>
        </DialogHeader>
        <div className="flex h-20 cursor-pointer items-center justify-center border border-dashed border-slate-500 p-2">
          <div onClick={getDir}>click here to select logseq journal folder</div>
        </div>
        <DialogFooter>
          {importing && <Progress value={progress} />}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
