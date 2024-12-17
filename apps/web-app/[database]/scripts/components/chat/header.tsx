import { History, Plus, Trash2, MessageSquare } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

interface HeaderProps {
  chatId: string
  sortedChats: Array<{
    id: string
    updatedAt: Date
  }>
  chatTitles: Map<string, string>
  chatIds: string[]
  createNewChat: () => Promise<void>
  switchChat: (id: string) => void
  deleteChat: (id: string) => void
}

export function Header({
  chatId,
  sortedChats,
  chatTitles,
  chatIds,
  createNewChat,
  switchChat,
  deleteChat,
}: HeaderProps) {
  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="hover:bg-accent">
            <History className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-[300px] max-h-[400px] overflow-y-auto"
        >
          {sortedChats.map(({ id, updatedAt }) => (
            <DropdownMenuItem
              key={id}
              className={cn(
                "flex items-center justify-between group pr-1",
                chatId === id && "bg-accent"
              )}
            >
              <div
                className="flex items-center gap-2 min-w-0 flex-1"
                onClick={() => switchChat(id)}
              >
                <MessageSquare className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="truncate">
                    {chatTitles.get(id) || `Chat ${chatIds.indexOf(id) + 1}`}
                  </div>
                  {updatedAt.getTime() > 0 && (
                    <div className="text-xs text-muted-foreground truncate">
                      {formatDistanceToNow(new Date(updatedAt), {
                        addSuffix: true,
                      })}
                    </div>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 p-0.5 opacity-0 group-hover:opacity-100 hover:bg-destructive hover:text-destructive-foreground flex-shrink-0"
                onClick={(e) => {
                  e.stopPropagation()
                  deleteChat(id)
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        variant="ghost"
        size="icon"
        onClick={createNewChat}
        className="hover:bg-accent"
      >
        <Plus className="h-5 w-5" />
      </Button>
    </div>
  )
} 