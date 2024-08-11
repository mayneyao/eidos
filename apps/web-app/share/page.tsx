"use client"

import { useState } from "react"
import { useNavigate } from "react-router-dom";


import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function Page() {
  const [link, setLink] = useState("")
  const router = useNavigate()
  const goShare = () => {
    const path = link.split("/share")[1]
    router("/share" + path)
  }
  return (
    <div className="flex h-full w-full flex-col items-center justify-center">
      <div className="flex gap-2">
        <Input
          autoFocus
          className="w-[300px]"
          placeholder="Enter a share link"
          value={link}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              goShare()
            }
          }}
          onChange={(e) => setLink(e.target.value)}
        />
        <Button onClick={goShare}>Enter</Button>
      </div>
    </div>
  )
}
