"use client"

import { useState } from "react"
import Link from "next/link"
import { Download } from "lucide-react"

import { getAllSpaceNames } from "@/lib/opfs"
import { exportSpace, importSpace } from "@/lib/space"
import { useSpace } from "@/hooks/use-space"
import { useSqliteStore } from "@/hooks/use-sqlite"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/use-toast"

export default function SpaceManagerPage() {
  const { spaceList, updateSpaceList } = useSpace()
  const [loading, setLoading] = useState(false)
  const [file, setFile] = useState(null)
  const [spaceName, setSpaceName] = useState("")
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
    })
  }

  return (
    <div className="prose mx-auto flex flex-col gap-2 p-10 dark:prose-invert">
      {spaceList.map((space) => {
        return (
          <div
            key={space}
            className="flex  items-center justify-between rounded-sm px-2 py-1"
          >
            <div className="grow">
              <Link href={`/${space}`}>{space}</Link>
            </div>
            <Button variant="ghost" onClick={() => exportSpace(space)}>
              <Download className="h-4 w-4" />
            </Button>
          </div>
        )
      })}
      <hr />
      Import Space from file
      {loading && <div>importing...</div>}
      <div className="mt-2 flex items-center gap-2">
        <Input
          type="text"
          onChange={(e) => setSpaceName(e.target.value)}
          placeholder="space name"
        />
        <Input type="file" onChange={handleFileChange} className="w-[200px]" />
        <Button onClick={handleImport} disabled={spaceName.length < 1}>
          Import{" "}
        </Button>
      </div>
    </div>
  )
}
