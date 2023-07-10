"use client"

import { useEffect, useMemo, useState } from "react"
import {  useParams } from 'react-router-dom';


import { opfsDocManager } from "@/lib/opfs"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { Editor } from "@/components/doc/editor"

export default function EverydayPage() {
  const params = useCurrentPathInfo()
  const { day } = useParams()
  const [initContent, setInitContent] = useState("")
  const filename = `${day}.md`

  const filepath = useMemo(
    () => ["spaces", params.database, "everyday", filename],
    [params.database, filename]
  ) as string[]

  useEffect(() => {
    opfsDocManager.getDocContent(filepath).then((content) => {
      setInitContent(content)
    })
  }, [filepath])

  const handleSaveDoc = (content: string) => {
    opfsDocManager.updateDocFile(filepath, content)
  }

  return (
    <div className="prose mx-auto lg:prose-xl xl:prose-2xl">
      <h2>{day}</h2>
      <Editor isEditable onSave={handleSaveDoc} initContent={initContent} />
    </div>
  )
}
