import { create } from 'zustand'
import type { UIMessage } from 'ai'

type EditorTab = 'preview' | 'editor'

// Update layout mode type
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

    pendingVersionUpdateMap: Record<string, string | null>
    setPendingVersionUpdate: (id: string, version: string | null) => void

    // Track unsaved changes for each script
    unsavedChangesMap: Record<string, boolean>
    setUnsavedChanges: (id: string, hasUnsavedChanges: boolean) => void

    chatId: string
    setChatId: (id: string) => void
    chatHistory: Array<UIMessage>
    setChatHistory: (history: Array<UIMessage>) => void
    addChatMessage: (message: UIMessage) => void
    clearChatHistory: () => void

    isRemixMode: boolean
    setIsRemixMode: (mode: boolean) => void

    layoutMode: LayoutMode
    setLayoutMode: (mode: LayoutMode) => void

    chatHistoryMap: Map<string, UIMessage[]>
    setChatHistoryMap: (map: Map<string, UIMessage[]>) => void

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
    pendingVersionUpdateMap: {},
    setPendingVersionUpdate: (id, version) =>
        set((state) => ({
            pendingVersionUpdateMap: { ...state.pendingVersionUpdateMap, [id]: version },
        })),
    unsavedChangesMap: {},
    setUnsavedChanges: (id, hasUnsavedChanges) =>
        set((state) => ({
            unsavedChangesMap: { ...state.unsavedChangesMap, [id]: hasUnsavedChanges },
        })),
    chatHistory: [],
    setChatHistory: (history) => set((state) => {
        const newChatHistoryMap = new Map(state.chatHistoryMap)
        if (state.chatId) {
            newChatHistoryMap.set(state.chatId, history)
        }
        return {
            chatHistory: history,
            chatHistoryMap: newChatHistoryMap
        }
    }),
    addChatMessage: (message) => set((state) => {
        const newHistory = [...state.chatHistory, message]
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
