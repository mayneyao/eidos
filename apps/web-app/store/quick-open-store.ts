import { create } from "zustand"

export type QuickOpenContextItemKind = "eidos-file-table"

export interface QuickOpenContextItem {
  id: string
  kind: QuickOpenContextItemKind
  label: string
  detail?: string
  keywords?: string[]
  current?: boolean
  disabled?: boolean
  onSelect: () => void | Promise<void>
}

export interface QuickOpenContextSection {
  id: string
  heading: string
  inputHint?: string
  priority?: number
  items: QuickOpenContextItem[]
}

interface QuickOpenState {
  sectionsByTab: Record<string, Record<string, QuickOpenContextSection>>
  registerSection: (tabId: string, section: QuickOpenContextSection) => void
  unregisterSection: (tabId: string, sectionId: string) => void
}

export const useQuickOpenStore = create<QuickOpenState>()((set) => ({
  sectionsByTab: {},
  registerSection: (tabId, section) =>
    set((state) => ({
      sectionsByTab: {
        ...state.sectionsByTab,
        [tabId]: {
          ...state.sectionsByTab[tabId],
          [section.id]: section,
        },
      },
    })),
  unregisterSection: (tabId, sectionId) =>
    set((state) => {
      const tabSections = state.sectionsByTab[tabId]
      if (!tabSections?.[sectionId]) return state

      const { [sectionId]: _removed, ...remainingSections } = tabSections
      if (Object.keys(remainingSections).length > 0) {
        return {
          sectionsByTab: {
            ...state.sectionsByTab,
            [tabId]: remainingSections,
          },
        }
      }

      const { [tabId]: _removedTab, ...remainingTabs } = state.sectionsByTab
      return { sectionsByTab: remainingTabs }
    }),
}))

export function filterQuickOpenSections(
  sections: QuickOpenContextSection[],
  query: string
): QuickOpenContextSection[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)

  return [...sections]
    .sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0))
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (terms.length === 0) return true
        const searchable = [item.label, item.detail, ...(item.keywords ?? [])]
          .filter((value): value is string => Boolean(value))
          .join(" ")
          .toLocaleLowerCase()
        return terms.every((term) => searchable.includes(term))
      }),
    }))
    .filter((section) => section.items.length > 0)
}
