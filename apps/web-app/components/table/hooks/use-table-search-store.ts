import { create } from 'zustand'

export interface SearchMatch {
    column: string
    snippet: string
}

export interface SearchResult {
    row: Record<string, any>
    matches: SearchMatch[]
    rowIndex: number
}

// Define a type for semantic search results (adjust as needed)
export interface SemanticSearchResultData extends Record<string, any> {
    _id: string // Or some unique identifier for the result item
    title: string
    _distance?: number
}

export interface SemanticSearchResult {
    meta: {
        page: number
        pageSize: number
        embeddingFieldId: string
    }
    results: SemanticSearchResultData[]
}

interface TableSearchState {
    searchQuery: string
    showSearch: boolean
    searchResults: SearchResult[]
    currentSearchIndex: number
    totalMatches: number
    searchTime: number
    currentPage: number
    totalPages: number
    isLoadingMore: boolean
    // Semantic Search State
    isSemanticSearchActive: boolean
    isSemanticSearching: boolean
    semanticSearchResult: SemanticSearchResult
    semanticSearchSelectedIndex: number
    setSearchQuery: (query: string) => void
    setShowSearch: (show: boolean) => void
    setSearchResults: (results: SearchResult[], startIndex: number) => void
    initializeSearchResults: (total: number) => void
    setCurrentSearchIndex: (value: number | ((prev: number) => number)) => void
    setTotalMatches: (total: number) => void
    setSearchTime: (time: number) => void
    setCurrentPage: (page: number) => void
    clearSearchResults: () => void
    clearSearch: () => void
    // Semantic Search Actions
    setIsSemanticSearchActive: (active: boolean) => void
    setIsSemanticSearching: (searching: boolean) => void
    setSemanticSearchResult: (results: SemanticSearchResult) => void
    setSemanticSearchSelectedIndex: (index: number | ((prev: number) => number)) => void
}

const emptySemanticSearchResult: SemanticSearchResult = {
    meta: {
        page: 1,
        pageSize: 10,
        embeddingFieldId: ''
    },
    results: []
}

// Store factory function
export const createTableSearchStore = () => create<TableSearchState>((set) => ({
    searchQuery: '',
    showSearch: false,
    searchResults: [],
    currentSearchIndex: 0,
    totalMatches: 0,
    searchTime: 0,
    currentPage: 1,
    totalPages: 0,
    isLoadingMore: false,
    // Semantic Search Initial State
    isSemanticSearchActive: false,
    isSemanticSearching: false,
    semanticSearchResult: emptySemanticSearchResult,
    semanticSearchSelectedIndex: -1,
    setSearchQuery: (query) => set({ searchQuery: query }),
    setShowSearch: (show) => set({ showSearch: show }),
    setSearchResults: (results, startIndex) => set((state) => {
        const newResults = state.searchResults.slice()
        newResults.splice(startIndex, results.length, ...results)
        return { searchResults: newResults }
    }),
    initializeSearchResults: (total) => set({
        searchResults: new Array(total)
    }),
    setCurrentSearchIndex: (value) => set((state) => ({
        currentSearchIndex: typeof value === 'function' ? value(state.currentSearchIndex) : value
    })),
    setTotalMatches: (total) => set({ totalMatches: total }),
    setSearchTime: (time) => set({ searchTime: time }),
    setCurrentPage: (page) => set({ currentPage: page }),
    clearSearchResults: () => set({
        searchResults: [],
        currentSearchIndex: 0,
        totalMatches: 0,
        searchTime: 0,
        currentPage: 1,
        semanticSearchResult: emptySemanticSearchResult,
        semanticSearchSelectedIndex: -1
    }),
    clearSearch: () => set({
        searchQuery: '',
        showSearch: false,
        searchResults: [],
        currentSearchIndex: 0,
        totalMatches: 0,
        searchTime: 0,
        currentPage: 1,
        // Clear semantic search state as well
        isSemanticSearchActive: false,
        isSemanticSearching: false,
        semanticSearchResult: emptySemanticSearchResult,
        semanticSearchSelectedIndex: -1
    }),
    // Semantic Search Setters
    setIsSemanticSearchActive: (active) => set({ isSemanticSearchActive: active }),
    setIsSemanticSearching: (searching) => set({ isSemanticSearching: searching }),
    setSemanticSearchResult: (result) => set({
        semanticSearchResult: result,
        semanticSearchSelectedIndex: -1
    }),
    setSemanticSearchSelectedIndex: (index) => set((state) => ({
        semanticSearchSelectedIndex: typeof index === 'function' ? index(state.semanticSearchSelectedIndex) : index
    })),
}))

// Export types for use in components
export type { TableSearchState } 