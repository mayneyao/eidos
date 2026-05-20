"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { usePermissionContext } from "./PermissionProvider"

function summarizeArgs(args: any): string {
  if (!args) return ""
  if (args.path) return args.path
  if (args.command) {
    const cmd = args.command as string
    return cmd.length > 60 ? cmd.slice(0, 57) + "..." : cmd
  }
  const s = JSON.stringify(args)
  return s.length > 60 ? s.slice(0, 57) + "..." : s
}

function getDisplayLabel(toolName: string, args: any): string {
  if (toolName === "bash" && args?.command) {
    const cmd = args.command as string
    if (cmd.startsWith("eidos ")) return cmd
    return `bash ${cmd}`
  }
  if (toolName === "file-write") return "Write File"
  if (toolName === "file-edit") return "Edit File"
  return toolName.replace(/-/g, " ")
}

type Action = "allow" | "allow-session" | "deny"

export function PermissionBanner() {
  const { permissionRequests, sendDecision } = usePermissionContext()
  const [activeAction, setActiveAction] = useState<Action>("allow")

  const req = permissionRequests[0]

  const handleAction = useCallback(
    (action: Action) => {
      if (!req) return
      switch (action) {
        case "allow":
          sendDecision(req.toolCallId, true, false)
          break
        case "allow-session":
          sendDecision(req.toolCallId, true, true)
          break
        case "deny":
          sendDecision(req.toolCallId, false, false)
          break
      }
    },
    [req, sendDecision]
  )

  useEffect(() => {
    if (!req) return

    const onKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "1":
          e.preventDefault()
          handleAction("allow")
          break
        case "2":
          e.preventDefault()
          handleAction("allow-session")
          break
        case "3":
          e.preventDefault()
          setActiveAction("deny")
          handleAction("deny")
          break
        case "Escape":
          e.preventDefault()
          setActiveAction("deny")
          handleAction("deny")
          break
        case "ArrowUp":
          e.preventDefault()
          setActiveAction((prev) => {
            const order: Action[] = ["allow", "allow-session", "deny"]
            const idx = order.indexOf(prev)
            return order[Math.max(0, idx - 1)]
          })
          break
        case "ArrowDown":
          e.preventDefault()
          setActiveAction((prev) => {
            const order: Action[] = ["allow", "allow-session", "deny"]
            const idx = order.indexOf(prev)
            return order[Math.min(order.length - 1, idx + 1)]
          })
          break
        case "Enter":
          e.preventDefault()
          handleAction(activeAction)
          break
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [req, activeAction, handleAction])

  if (!req) return null

  const label = getDisplayLabel(req.toolName, req.args)
  const summary = summarizeArgs(req.args)

  return (
    <div className="flex flex-col gap-2">
      <div className="bg-zinc-100 dark:bg-zinc-800 rounded-md px-2 py-1">
        <div className="flex items-center gap-2 text-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500 flex-shrink-0" />
          <span className="font-medium text-foreground whitespace-pre-wrap break-words">
            {label}
          </span>
        </div>
        {summary && summary !== label && (
          <div className="text-muted-foreground text-xs truncate pl-3.5">
            {summary}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <Button
          size="sm"
          variant={activeAction === "allow" ? "default" : "outline"}
          className="h-7 justify-start text-xs rounded-md"
          onClick={() => {
            setActiveAction("allow")
            handleAction("allow")
          }}
        >
          <span className="text-[10px] opacity-50 mr-1.5 font-mono">1</span>
          Allow
        </Button>
        <Button
          size="sm"
          variant={activeAction === "allow-session" ? "default" : "outline"}
          className="h-7 justify-start text-xs rounded-md"
          onClick={() => {
            setActiveAction("allow-session")
            handleAction("allow-session")
          }}
        >
          <span className="text-[10px] opacity-50 mr-1.5 font-mono">2</span>
          Allow in this session
        </Button>
        <Button
          size="sm"
          variant={activeAction === "deny" ? "default" : "outline"}
          className="h-7 justify-start text-xs rounded-md"
          onClick={() => {
            setActiveAction("deny")
            handleAction("deny")
          }}
        >
          <span className="text-[10px] opacity-50 mr-1.5 font-mono">3</span>
          Deny
        </Button>
      </div>
    </div>
  )
}
