import { useSqlite } from "@/hooks/use-sqlite"
import { useEditorStore } from "../stores/editor-store"
import { useEffect } from "react"
import { DataSpace } from "@/worker/web-worker/DataSpace"
import { Message } from "ai"
import { uuidv7 } from "@/lib/utils"


const getChatId = async (sqlite: DataSpace, scriptId: string) => {
    const chat = await sqlite?.chat.list({ project_id: scriptId })
    if (!chat || chat.length === 0) return null
    return chat[0].id
}

const listChatHistory = async (sqlite: DataSpace, chatId: string) => {
    if (!chatId) return []
    const messages = await sqlite?.message.list({ chat_id: chatId })
    return messages.map((m) => ({
        id: m.id,
        content: m.content,
        createdAt: new Date(m.created_at!),
        role: m.role as Message["role"],
    }))
}

export function useExtensionChatHistory(scriptId: string) {
    const { sqlite } = useSqlite()
    const { chatHistory, clearChatHistory, setChatHistory, setChatId, chatId } = useEditorStore()
    useEffect(() => {
        async function fetchChatHistory() {
            if (scriptId && sqlite) {
                const chatId = await getChatId(sqlite, scriptId)
                if (chatId) {
                    setChatId(chatId)
                    const history = await listChatHistory(sqlite, chatId)
                    setChatHistory(history)
                } else {
                    setChatId(uuidv7())
                }
            }
        }
        clearChatHistory()
        fetchChatHistory()
    }, [scriptId])

    return {
        chatHistory,
        clearChatHistory,
        setChatHistory,
        chatId,
    }
}
