"use client"

import {
  Download,
  MoreHorizontalIcon,
  Trash2Icon,
  UploadCloud,
} from "lucide-react"
import { useState } from "react"
import { Link } from "react-router-dom"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/use-toast"
import { useSpace } from "@/hooks/use-space"
import { useSync } from "@/hooks/use-sync"
import { exportSpace, importSpace, removeSpace } from "@/lib/space"

type IActionMode = "remove" | "export" | "upload"
export default function SpaceManagerPage() {
  const { spaceList, updateSpaceList } = useSpace()
  const [loading, setLoading] = useState(false)
  const [file, setFile] = useState(null)
  const [spaceName, setSpaceName] = useState("")
  const [mode, setMode] = useState<IActionMode>()
  const [modeLoading, setModeLoading] = useState(false)
  const { push } = useSync()
  const handleFileChange = (e: any) => {
    e.target.files[0] && setFile(e.target.files[0])
  }

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

  const handleImport = async () => {
    if (!file) return
    setLoading(true)
    await importSpace(spaceName, file)
    setLoading(false)
    updateSpaceList()
    toast({
      title: "Imported",
      description: `Space ${spaceName} imported`,
      action: (
        <Link to={`/${spaceName}`}>
          <Button variant="outline">Open</Button>
        </Link>
      ),
    })
  }

  return (
    <div className="prose mx-auto flex flex-col gap-2 p-10 dark:prose-invert">
      Import Space from file
      <div className="mt-2 flex items-center gap-2">
        <Input
          type="text"
          onChange={(e) => setSpaceName(e.target.value)}
          placeholder="space name"
        />
        <Input type="file" onChange={handleFileChange} className="w-[200px]" />
        <Button onClick={handleImport} disabled={spaceName.length < 1 || !file}>
          Import{" "}
        </Button>
      </div>
      {loading && <div>importing...</div>}
      {modeLoading && <div>{mode} ...</div>}
      <hr />
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
