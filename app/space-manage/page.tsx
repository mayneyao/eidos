"use client"

import { useState } from "react"
import { Download, UploadCloud } from "lucide-react"
import { Link } from "react-router-dom"

import { exportSpace, importSpace } from "@/lib/space"
import { useSpace } from "@/hooks/use-space"
import { useSync } from "@/hooks/use-sync"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/use-toast"

export default function SpaceManagerPage() {
  const { spaceList, updateSpaceList } = useSpace()
  const [loading, setLoading] = useState(false)
  const [file, setFile] = useState(null)
  const [spaceName, setSpaceName] = useState("")
  const { push } = useSync()
  const handleFileChange = (e: any) => {
    e.target.files[0] && setFile(e.target.files[0])
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
      {loading && <div>importing...</div>}
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
            <Button variant="ghost" onClick={() => push(space)}>
              <UploadCloud className="h-4 w-4" />
            </Button>
            <Button variant="ghost" onClick={() => exportSpace(space)}>
              <Download className="h-4 w-4" />
            </Button>
          </div>
        )
      })}
    </div>
  )
}
