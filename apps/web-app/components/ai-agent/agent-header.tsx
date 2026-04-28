import { PlusIcon, HistoryIcon } from "lucide-react"
import { useCallback, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAgentStore } from "./agent-store"

interface AgentHeaderProps {
  onSelectSession: (id: string | null) => Promise<void>
}

export function AgentHeader({ onSelectSession }: AgentHeaderProps) {
  const { sessions, setCurrentSession } = useAgentStore()
  const [open, setOpen] = useState(false)

  const handleNewSession = useCallback(() => {
    setCurrentSession(null)
    onSelectSession(null)
    setOpen(false)
  }, [setCurrentSession, onSelectSession])

  const handleSelectSession = useCallback(
    (id: string) => {
      setCurrentSession(id)
      onSelectSession(id)
      setOpen(false)
    },
    [setCurrentSession, onSelectSession]
  )

  return (
    <div className="flex items-center justify-between px-6 py-3 border-b">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold">AI Agent</h1>
      </div>
      <div className="flex items-center gap-2">
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              <HistoryIcon className="h-4 w-4 mr-1" />
              Sessions
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            {sessions.length === 0 ? (
              <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                No sessions yet
              </div>
            ) : (
              sessions.slice(0, 20).map((s) => (
                <DropdownMenuItem
                  key={s.id}
                  className="flex flex-col items-start gap-1"
                  onClick={() => handleSelectSession(s.id)}
                >
                  <span className="text-sm font-medium truncate w-full">
                    {s.goal.length > 60 ? s.goal.slice(0, 60) + "..." : s.goal}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(s.createdAt).toLocaleString()} · {s.status}
                  </span>
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuItem onClick={handleNewSession}>
              <PlusIcon className="h-4 w-4 mr-2" />
              New Session
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
