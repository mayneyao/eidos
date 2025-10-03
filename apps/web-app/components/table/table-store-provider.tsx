import React, { createContext, useContext, useMemo } from "react"

import { createTableStore } from "./store"
import { createTableSearchStore } from "./hooks/use-table-search-store"

// Context for the main store
const TableStoreContext = createContext<ReturnType<
  typeof createTableStore
> | null>(null)

// Context for the search store
const TableSearchStoreContext = createContext<ReturnType<
  typeof createTableSearchStore
> | null>(null)

// Provider component
export const TableStoreProvider = ({
  children,
}: {
  children: React.ReactNode
}) => {
  const store = useMemo(() => createTableStore(), [])
  const searchStore = useMemo(() => createTableSearchStore(), [])
  
  return (
    <TableStoreContext.Provider value={store}>
      <TableSearchStoreContext.Provider value={searchStore}>
        {children}
      </TableSearchStoreContext.Provider>
    </TableStoreContext.Provider>
  )
}

// Hook to use the main store
export const useTableStore = () => {
  const store = useContext(TableStoreContext)
  if (!store) {
    throw new Error("useTableStore must be used within a TableStoreProvider")
  }
  return store()
}

// Hook to use the search store
export const useTableSearchStore = () => {
  const store = useContext(TableSearchStoreContext)
  if (!store) {
    throw new Error("useTableSearchStore must be used within a TableStoreProvider")
  }
  return store()
}
