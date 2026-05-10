"use client"

import { useCallback, useEffect, useState } from "react"
import { PlayIcon } from "lucide-react"
import { Streamdown } from "streamdown"
import { useEidos } from "@eidos.space/react"
import { useTabTitle } from "@/hooks/use-tab-title"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"

interface SkillDetail {
  name: string
  description: string
  instructions: string
  dirName: string
}

export default function SkillDetailPage() {
  const eidos = useEidos()
  const { params } = useRouterAdapter()
  const skillName = params.name as string

  useTabTitle(`$${skillName}`)

  const [skill, setSkill] = useState<SkillDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!skillName) return
    setLoading(true)
    fetch(`/api/agent/skills/${skillName}`)
      .then((r) => {
        if (!r.ok) throw new Error("Skill not found")
        return r.json()
      })
      .then((data) => setSkill(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [skillName])

  const handleTryInChat = useCallback(() => {
    if (!skill) return
    eidos.currentSpace.navigate("/agent")
    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent("agent:try-skill", {
          detail: { dirName: skill.dirName, name: skill.name },
        })
      )
    }, 100)
  }, [eidos.currentSpace, skill])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b px-4 py-1.5 shrink-0">
        <h1 className="text-sm font-semibold truncate">${skillName}</h1>
        {skill && (
          <button
            onClick={handleTryInChat}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors shrink-0"
          >
            <PlayIcon className="h-3 w-3" />
            Try in Chat
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 space-y-3 animate-pulse">
            <div className="h-4 w-3/4 rounded bg-muted" />
            <div className="h-4 w-1/2 rounded bg-muted" />
            <div className="h-32 w-full rounded bg-muted" />
          </div>
        ) : skill ? (
          <div className="p-4 max-w-3xl mx-auto prose-zinc prose-sm dark:prose-invert">
            <Streamdown>{skill.instructions}</Streamdown>
          </div>
        ) : null}
      </div>
    </div>
  )
}
