import { useCurrentChatProjectId, useCurrentNode } from "@/apps/web-app/hooks/use-current-node"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import type { Chat } from "@/packages/core/meta-table/chat"
import type { ChatMessage } from "@/packages/core/meta-table/message"
import { useCallback, useEffect, useMemo } from "react"
import { create } from "zustand"
import type { UIMessage } from "ai"
import { uuidv7 } from "@/lib/utils"

const useAIChatDataStore = create<{
    currentChatId: string
    currentChat: Chat & { messages: ChatMessage[] } | null
    chats: Chat[]
    setChats: (chats: Chat[]) => void
    setCurrentChatId: (chatId: string) => void
    setCurrentChat: (chat: Chat & { messages: ChatMessage[] }) => void
    removeChat: (chatId: string) => void
}>((set) => ({
    currentChatId: "",
    currentChat: null,
    chats: [],
    setChats: (chats) => set({ chats }),
    setCurrentChatId: (chatId) => set({ currentChatId: chatId }),
    setCurrentChat: (chat) => set({ currentChat: chat }),
    removeChat: (chatId) => set(state => ({
        chats: state.chats.filter(c => c.id !== chatId),
        currentChat: state.currentChat?.id === chatId ? null : state.currentChat
    }))
}))


export const useAIChatData = () => {
    const { currentChatId, currentChat, setCurrentChatId, setCurrentChat, setChats, chats, removeChat } =
        useAIChatDataStore()
    const { sqlite } = useSqlite()
    const chatProjectId = useCurrentChatProjectId()

    const reloadChats = useCallback(async (projectId?: string) => {
        if (!sqlite) return
        const chats = await sqlite.chat.getChatsByProjectId(projectId || chatProjectId)
        setChats(chats)
        return chats
    }, [sqlite, chatProjectId, setChats])

    useEffect(() => {
        if (!chatProjectId) return
        reloadChats(chatProjectId).then(chats => {
            if (chats && chats.length > 0) {
                setCurrentChatId(chats[0].id)
            }
        })
    }, [chatProjectId, reloadChats])

    const clearChatMessages = async (chatId: string) => {
        await sqlite?.message.clearMessages(chatId)
        if (chatId === currentChatId) {
            reloadChat()
        }
    }


    const reloadChat = async () => {
        if (!sqlite) return
        const chat = await sqlite.chat.getChatById(currentChatId)
        if (chat) {
            setCurrentChat(chat)
        }
    }

    const chatMessages = useMemo(() => {
        const messages = currentChat?.messages.map(m => ({
            id: m.id,
            content: m.content,
            role: m.role as UIMessage["role"],
            createdAt: new Date(m.created_at + 'Z'),
            chat_id: m.chat_id,
            parts: m.parts
        })) || []
        return messages as UIMessage[]
    }, [currentChat])


    const createNewChat = async () => {
        const newChatId = uuidv7()
        await sqlite?.chat.add({
            id: newChatId,
            project_id: chatProjectId
        })
        reloadChats()
        setCurrentChatId(newChatId)
        return newChatId
    }

    const switchChat = (id: string) => {
        setCurrentChatId(id)
    }

    const deleteChat = async (id: string) => {
        await sqlite?.chat.del(id)
        removeChat(id)
    }

    const sortedChats = useMemo(() => {
        return chats.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    }, [chats])

    useEffect(() => {
        reloadChat()
    }, [currentChatId])

    return {
        chatId: currentChatId,
        chatMessages,
        currentChat,
        setCurrentChatId,
        setCurrentChat,
        clearChatMessages,
        createNewChat,
        switchChat,
        deleteChat,
        chats: sortedChats
    }
}