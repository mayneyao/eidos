"use client"

import { Editor } from "@/components/doc/editor"

export default function DocPage() {
  return (
    <div className="flex  items-center justify-center">
      <div className="h-full w-[49rem]">
        <Editor />
      </div>
    </div>
  )
}
