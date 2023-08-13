"use client"

import { useState } from "react"
import {
  Download,
  MoreHorizontalIcon,
  Trash2Icon,
  UploadCloud,
} from "lucide-react"
import { Link } from "react-router-dom"

import { exportSpace, removeSpace } from "@/lib/space"
import { useSpace } from "@/hooks/use-space"
import { useSync } from "@/hooks/use-sync"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type IActionMode = "remove" | "export" | "upload"
export default function SpaceManagerPage() {
  const { spaceList, updateSpaceList } = useSpace()
  const [mode, setMode] = useState<IActionMode>()
  const [modeLoading, setModeLoading] = useState(false)
  const { push } = useSync()

  const handleAction = async (space: string, mode: IActionMode) => {
    setModeLoading(true)
    setMode(mode)
    switch (mode) {
      case "remove":
        await removeSpace(space)
        break
      case "upload":
        await push(space)
        break
      case "export":
        await exportSpace(space)
        break
    }
    updateSpaceList()
    setModeLoading(false)
  }

  return (
    <div className="prose mx-auto flex flex-col gap-2 p-10 dark:prose-invert">
      {modeLoading && <div>{mode} ...</div>}
      {spaceList.map((space) => {
        return (
          <div
            key={space}
            className="flex  items-center justify-between rounded-sm px-2 py-1"
          >
            <div className="grow">
              <Link to={`/${space}`}>{space}</Link>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger>
                <Button variant="ghost">
                  <MoreHorizontalIcon className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem
                  onSelect={() => handleAction(space, "export")}
                >
                  <Download className="mr-2 h-4 w-4" /> <span>Export</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => handleAction(space, "upload")}
                >
                  <UploadCloud className="mr-2 h-4 w-4" /> <span>Upload</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => handleAction(space, "remove")}
                >
                  <Trash2Icon className="mr-2 h-4 w-4" /> <span>Remove</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      })}
    </div>
  )
}
