import { createContext, useContext, type RefObject } from "react"

interface TabContextValue {
  tabId: string
  containerRef: RefObject<HTMLElement> | null
  isActive: boolean
  isFocused: boolean
}

const TabContext = createContext<TabContextValue | null>(null)

export function useTabContext() {
  const context = useContext(TabContext)
  if (!context) {
    throw new Error("useTabContext must be used within a TabContainer")
  }
  return context
}

export const TabProvider = TabContext.Provider
