"use client"

import { useEffect, useState } from "react"
import { useParams } from "react-router-dom"

import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useSqlite } from "@/hooks/use-sqlite"
import { Editor } from "@/components/doc/editor"

export default function EverydayPage() {
  const params = useCurrentPathInfo()
  const { day } = useParams()
  const { sqlite } = useSqlite(params.space)
  const [initContent, setInitContent] = useState("")

  useEffect(() => {
    sqlite?.getDoc(day!).then((content) => {
      setInitContent(content)
    })
  }, [day, sqlite])

  const handleSaveDoc = (content: string) => {
    sqlite?.updateDoc(day!, content, true)
  }

  return (
    <div className="prose mx-auto p-4 lg:prose-xl xl:prose-2xl">
      <h2>{day}</h2>
      <Editor isEditable onSave={handleSaveDoc} initContent={initContent} />
    </div>
  )
}
