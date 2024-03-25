"use client"

import { Download, MoreHorizontalIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router-dom"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useSpace } from "@/hooks/use-space"
import { spaceFileSystem } from "@/lib/storage/space"

import { CommonSettingLayout } from "../common-setting-layout"

type IActionMode = "remove" | "export"
export default function SpaceManagerPage() {
  const { spaceList, updateSpaceList } = useSpace()
  const [mode, setMode] = useState<IActionMode>()
  const [modeLoading, setModeLoading] = useState(false)

  const handleAction = async (space: string, mode: IActionMode) => {
    setModeLoading(true)
    setMode(mode)
    switch (mode) {
      case "remove":
        await spaceFileSystem.remove(space)
        break
      case "export":
        await spaceFileSystem.export(space)
        break
    }
    updateSpaceList()
    setModeLoading(false)
  }

  return (
    <CommonSettingLayout title="Space Manage" description="">
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
                  onSelect={() => handleAction(space, "remove")}
                >
                  <Trash2Icon className="mr-2 h-4 w-4" /> <span>Remove</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      })}
    </CommonSettingLayout>
  )
}
