"use client"

import { useParams } from "react-router-dom"

import { Editor } from "@/components/doc/editor"

export default function EverydayPage() {
  const { day } = useParams()

  return (
    <div className="prose mx-auto w-full p-4 lg:prose-xl xl:prose-2xl">
      <Editor isEditable title={day} showTitle docId={day} />
    </div>
  )
}
