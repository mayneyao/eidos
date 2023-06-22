import Link from "next/link"
import { CalendarDays } from "lucide-react"

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

// convertMarkdown2State
export const EverydaySidebarItem = ({ space }: { space: string }) => {
  const { sqlite } = useSqlite(space)
  const { convertMarkdown2State } = useDocEditor(sqlite)
  const getDir = async () => {
    if (!sqlite) return
    const dirHandle = await (window as any).showDirectoryPicker()
    const oldDays = await sqlite.listDays()
    const oldDayFileNameSet = new Set(oldDays.map((d) => d.name))
    for await (let [name, handle] of dirHandle.entries()) {
      if (oldDayFileNameSet.has(name)) {
        continue
      } else if (name.endsWith(".md")) {
        const fileHandle = handle as FileSystemFileHandle
        const file = await fileHandle.getFile()
        const content = await file.text()
        try {
          const state = await convertMarkdown2State(content)
          await sqlite.createDayNote(name, state)
        } catch (error) {
          console.warn(error)
        }
      }
    }
  }

  return (
    <Dialog>
      <ContextMenu>
        <ContextMenuTrigger>
          <Button
            variant={"ghost"}
            size="sm"
            className="w-full justify-start font-normal"
            asChild
          >
            <Link href={`/${space}/everyday`}>
              <CalendarDays className="pr-2" />
              Everyday
            </Link>
          </Button>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem>Open</ContextMenuItem>
          <ContextMenuItem>Download</ContextMenuItem>
          <DialogTrigger asChild>
            <ContextMenuItem>
              <span>Import</span>
            </ContextMenuItem>
          </DialogTrigger>
        </ContextMenuContent>
      </ContextMenu>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import</DialogTitle>
        </DialogHeader>
        <div>
          <div onClick={getDir}>select logseq file </div>
        </div>
        <DialogFooter>
          <Button type="submit">Import</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
