import { useSqlite } from "@/hooks/use-sqlite"
import { useEditorStore } from "../stores/editor-store"
import { useEffect } from "react"
import { DataSpace } from "@/worker/web-worker/DataSpace"
import { Message } from "ai"
import { uuidv7 } from "@/lib/utils"

const getChatIds = async (sqlite: DataSpace, scriptId: string) => {
    const chats = await sqlite?.chat.list({ project_id: scriptId })
    if (!chats || chats.length === 0) return []
    return chats.map(chat => ({
        id: chat.id,
        title: chat.title || 'Untitled Chat'
    }))
}

const listChatHistory = async (sqlite: DataSpace, chatId: string) => {
    if (!chatId) return []
    const messages = await sqlite?.message.list({ chat_id: chatId })
    return messages.map((m) => ({
        id: m.id,
        content: m.content,
        createdAt: new Date(m.created_at!.replace(' ', 'T') + 'Z'),
        role: m.role as Message["role"],
    }))
}

export function useExtensionChatHistory(scriptId: string) {
    const { sqlite } = useSqlite()
    const {
        chatHistory,
        clearChatHistory,
        setChatHistory,
        setChatId,
        chatId,
        chatHistoryMap = new Map<string, Message[]>(),
        setChatHistoryMap,
        setChatTitles = () => { },
    } = useEditorStore()

    useEffect(() => {
        async function fetchChatHistories() {
            if (scriptId && sqlite) {
                const chats = await getChatIds(sqlite, scriptId)
                if (chats.length > 0) {
                    setChatId(chats[0].id)

                    const titles = new Map(chats.map(chat => [chat.id, chat.title]))
                    setChatTitles(titles)

                    const historyMap = new Map()
                    await Promise.all(
                        chats.map(async ({ id }) => {
                            const history = await listChatHistory(sqlite, id)
                            historyMap.set(id, history)
                        })
                    )
                    setChatHistoryMap(historyMap)

                    const currentHistory = historyMap.get(chats[0].id) || []
                    setChatHistory(currentHistory)
                } else {
                    const newChatId = uuidv7()
                    setChatId(newChatId)
                    setChatHistoryMap(new Map([[newChatId, []]]))
                    setChatTitles(new Map([[newChatId, 'Untitled Chat']]))
                    setChatHistory([])
                }
            }
        }
        clearChatHistory()
        fetchChatHistories()
    }, [scriptId])

    return {
        chatHistory,
        clearChatHistory,
        setChatHistory,
        chatId,
        chatHistoryMap,
        setChatHistoryMap,
    }
}
