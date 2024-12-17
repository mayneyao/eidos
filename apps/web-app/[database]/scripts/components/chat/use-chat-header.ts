import { useMemo } from "react"
import { uuidv7 } from "@/lib/utils"
import { useSqlite } from "@/hooks/use-sqlite"

interface UseChatHeaderProps {
  scriptId: string
  chatId: string
  chatHistoryMap: Map<string, any[]>
  setChatHistoryMap: (map: Map<string, any[]>) => void
  setChatId: (id: string) => void
  setChatHistory: (history: any[]) => void
}

export function useChatHeader({
  scriptId,
  chatId,
  chatHistoryMap,
  setChatHistoryMap,
  setChatId,
  setChatHistory,
}: UseChatHeaderProps) {
  const { sqlite } = useSqlite()
  
  const chatIds = Array.from(chatHistoryMap.keys())

  const sortedChats = useMemo(() => {
    return Array.from(chatHistoryMap.entries())
      .map(([id, messages]) => ({
        id,
        messages,
        updatedAt:
          messages.length > 0
            ? messages[messages.length - 1]?.createdAt ?? new Date(0)
            : new Date(0),
      }))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
  }, [chatHistoryMap])

  const createNewChat = async () => {
    if (!sqlite) return

    const newChatId = uuidv7()
    await sqlite.chat.add({
      id: newChatId,
      project_id: scriptId,
    })

    const newMap = new Map(chatHistoryMap)
    newMap.set(newChatId, [])
    setChatHistoryMap(newMap)
    setChatId(newChatId)
    setChatHistory([])
  }

  const switchChat = (id: string) => {
    setChatId(id)
    setChatHistory(chatHistoryMap.get(id) || [])
  }

  const deleteChat = async (id: string) => {
    if (!sqlite) return
    await sqlite.chat.delete(id)
    const newMap = new Map(chatHistoryMap)
    newMap.delete(id)
    setChatHistoryMap(newMap)

    if (id === chatId) {
      const remainingIds = Array.from(newMap.keys())
      if (remainingIds.length > 0) {
        switchChat(remainingIds[0])
      } else {
        setChatId("")
        setChatHistory([])
      }
    }
  }

  return {
    chatIds,
    sortedChats,
    createNewChat,
    switchChat,
    deleteChat,
  }
} 