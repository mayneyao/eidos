import { create } from 'zustand'
import type { Message } from 'ai'

type EditorTab = 'preview' | 'editor'

interface EditorStore {
    activeTab: EditorTab
    setActiveTab: (tab: EditorTab) => void
    disablePreview: boolean
    setDisablePreview: (disable: boolean) => void

    isRemixDone: boolean
    setIsRemixDone: (done: boolean) => void

    scriptCodeMap: Record<string, string>
    setScriptCodeMap: (id: string, code: string) => void

    chatHistory: Array<Message>
    setChatHistory: (history: Array<Message>) => void
    addChatMessage: (message: Message) => void
    clearChatHistory: () => void
}

export const useEditorStore = create<EditorStore>((set) => ({
    activeTab: 'preview',
    setActiveTab: (tab) => set({ activeTab: tab }),
    disablePreview: false,
    setDisablePreview: (disable) => set({ disablePreview: disable }),
    isRemixDone: false,
    setIsRemixDone: (done) => set({ isRemixDone: done }),
    scriptCodeMap: {},
    setScriptCodeMap: (id, code) =>
        set((state) => ({ scriptCodeMap: { ...state.scriptCodeMap, [id]: code } })),
    chatHistory: [],
    setChatHistory: (history) => set({ chatHistory: history }),
    addChatMessage: (message) => set((state) => ({
        chatHistory: [...state.chatHistory, message]
    })),
    clearChatHistory: () => set({ chatHistory: [] }),
}))
