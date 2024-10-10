import { useRef } from "react"
import { useVirtualList } from "ahooks"
import { ArrowLeftIcon } from "lucide-react"

import { useAppStore } from "@/lib/store/app-store"
import { cn } from "@/lib/utils"
import { Separator } from "@/components/ui/separator"

import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { ScrollArea } from "../ui/scroll-area"
import { EntrySelector } from "./entry-selector"
import { FileEntry } from "./file-entry"
import { useCurrentRootDir } from "./hooks/use-current-root-dir"
import { useFileManager } from "./hooks/use-file-manager"

export const FileManager = () => {
  const { search, setSearch } = useCurrentRootDir()
  const { entries: originalEntries } = useFileManager(search)
  const { setFileManagerOpen } = useAppStore()
  const backToSidebar = () => {
    setFileManagerOpen(false)
  }

  const containerRef = useRef(null)
  const wrapperRef = useRef(null)

  const [entries] = useVirtualList(originalEntries, {
    containerTarget: containerRef,
    wrapperTarget: wrapperRef,
    itemHeight: 40,
    overscan: 10,
  })

  return (
    <div className="flex h-full w-full flex-col justify-between p-1 pt-0">
      <div>
        <div className="flex w-full items-center gap-2">
          <Input
            className="h-8 grow"
            placeholder="Search Files..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="flex gap-1">
            <Button size="xs" variant="ghost" onClick={backToSidebar}>
              <ArrowLeftIcon className="h-5 w-5 cursor-pointer"></ArrowLeftIcon>
            </Button>
          </div>
        </div>
        <Separator className="my-2" />
        <ScrollArea className={cn("h-[calc(100vh-122px)]")} ref={containerRef}>
          <ul className="flex max-w-[300px] flex-col" ref={wrapperRef}>
            {entries.map((item) => {
              const entry = item.data
              const { kind, name } = entry
              const isFile = kind === "file"
              return (
                <li
                  className="target flex justify-start"
                  data-name={name}
                  data-isdir={!isFile}
                >
                  <FileEntry name={name} entry={entry} />
                </li>
              )
            })}
          </ul>
        </ScrollArea>
      </div>
      <div className="flex gap-2">
        <EntrySelector />
        {/* <FileManagerSettings /> */}
      </div>
    </div>
  )
}
