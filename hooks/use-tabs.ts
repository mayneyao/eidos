import { create } from 'zustand';

interface TabState {
    currentTab: string | null;
    openTabs: Set<string>;
    openTab: (url: string) => void;
    closeTab: (url: string) => void;
    switchTab: (url: string) => void;
    setTabs: (tabs: Set<string>) => void;
    setCurrentTab: (tab: string) => void;
}

export const useTabStore = create<TabState>((set) => ({
    currentTab: null,
    openTabs: new Set(window.eidos?.openTabs || []),
    setTabs: (tabs: Set<string>) => set({ openTabs: tabs }),
    setCurrentTab: (tab: string) => set({ currentTab: tab }),

    openTab: (url: string) => set((state) => {
        const newOpenTabs = new Set(state.openTabs);
        newOpenTabs.add(url);
        return { openTabs: newOpenTabs, currentTab: url };
    }),

    closeTab: (url: string) => set((state) => {
        const newOpenTabs = new Set(state.openTabs);
        newOpenTabs.delete(url);
        const newCurrentTab = state.currentTab === url ? (newOpenTabs.size > 0 ? Array.from(newOpenTabs)[0] : null) : state.currentTab;
        return { openTabs: newOpenTabs, currentTab: newCurrentTab };
    }),

    switchTab: (url: string) => set((state) => {
        if (state.openTabs.has(url)) {
            return { currentTab: url };
        } else {
            console.error(`Tab with url ${url} is not open.`);
            return {};
        }
    }),
}));