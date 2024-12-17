import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Chat } from "@/components/remix-chat/chat"

import { useEditorStore } from "../../stores/editor-store"

interface ChatSidebarProps {
  scriptId: string
  createNewChat: () => void
}

export function ChatSidebar({ scriptId, createNewChat }: ChatSidebarProps) {
  const { chatId, chatHistoryMap } = useEditorStore()

  return (
    <div className="w-full h-full flex flex-col overflow-hidden border-r bg-background">
      <div className="flex-1 overflow-hidden">
        {chatId ? (
          <div className="h-full overflow-y-auto">
            <Chat
              key={chatId}
              id={chatId}
              scriptId={scriptId}
              initialMessages={chatHistoryMap.get(chatId) || []}
              selectedModelId={""}
            />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">
              No chat selected, create a new chat
            </p>
            <Button onClick={createNewChat} size="icon" variant="ghost">
              <Plus className="h-5 w-5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
