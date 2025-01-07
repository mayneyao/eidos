import { create } from 'zustand'
import type { Message } from 'ai'

type EditorTab = 'preview' | 'editor'

// 更新布局模式的类型
type LayoutMode = 'code' | 'preview'

interface EditorStore {
    activeTab: EditorTab
    setActiveTab: (tab: EditorTab) => void
    disablePreview: boolean
    setDisablePreview: (disable: boolean) => void

    isRemixDone: boolean
    setIsRemixDone: (done: boolean) => void

    scriptCodeMap: Record<string, string>
    setScriptCodeMap: (id: string, code: string) => void

    chatId: string
    setChatId: (id: string) => void
    chatHistory: Array<Message>
    setChatHistory: (history: Array<Message>) => void
    addChatMessage: (message: Message) => void
    clearChatHistory: () => void

    isRemixMode: boolean
    setIsRemixMode: (mode: boolean) => void

    layoutMode: LayoutMode
    setLayoutMode: (mode: LayoutMode) => void

    chatHistoryMap: Map<string, Message[]>
    setChatHistoryMap: (map: Map<string, Message[]>) => void

    chatTitles: Map<string, string>
    setChatTitles: (titles: Map<string, string>) => void
}

export const useEditorStore = create<EditorStore>((set) => ({
    activeTab: 'preview',
    setActiveTab: (tab) => set({ activeTab: tab }),
    chatId: '',
    setChatId: (id) => set({ chatId: id }),
    disablePreview: false,
    setDisablePreview: (disable) => set({ disablePreview: disable }),
    isRemixDone: false,
    setIsRemixDone: (done) => set({ isRemixDone: done }),
    scriptCodeMap: {},
    setScriptCodeMap: (id, code) =>
        set((state) => ({ scriptCodeMap: { ...state.scriptCodeMap, [id]: code } })),
    chatHistory: [],
    setChatHistory: (history) => set((state) => {
        const processedHistory = history.map(msg => ({
            ...msg,
            createdAt: msg.createdAt ? (msg.createdAt instanceof Date ? msg.createdAt : new Date(msg.createdAt)) : new Date()
        }))

        const newChatHistoryMap = new Map(state.chatHistoryMap)
        if (state.chatId) {
            newChatHistoryMap.set(state.chatId, processedHistory)
        }
        return {
            chatHistory: processedHistory,
            chatHistoryMap: newChatHistoryMap
        }
    }),
    addChatMessage: (message) => set((state) => {
        const processedMessage = {
            ...message,
            createdAt: message.createdAt ? (message.createdAt instanceof Date ? message.createdAt : new Date(message.createdAt)) : new Date()
        }
        
        const newHistory = [...state.chatHistory, processedMessage]
        const newChatHistoryMap = new Map(state.chatHistoryMap)
        if (state.chatId) {
            newChatHistoryMap.set(state.chatId, newHistory)
        }
        return {
            chatHistory: newHistory,
            chatHistoryMap: newChatHistoryMap
        }
    }),
    clearChatHistory: () => set((state) => {
        const newChatHistoryMap = new Map(state.chatHistoryMap)
        if (state.chatId) {
            newChatHistoryMap.delete(state.chatId)
        }
        return {
            chatHistory: [],
            chatHistoryMap: newChatHistoryMap
        }
    }),
    isRemixMode: false,
    setIsRemixMode: (mode) => set({ isRemixMode: mode }),
    layoutMode: 'code',
    setLayoutMode: (mode) => set({ layoutMode: mode }),
    chatHistoryMap: new Map(),
    setChatHistoryMap: (map) => set({ chatHistoryMap: map }),
    chatTitles: new Map(),
    setChatTitles: (titles) => set({ chatTitles: titles }),
}))
