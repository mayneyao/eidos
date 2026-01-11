import { createContext, useContext, type ReactNode } from 'react'

/**
 * Base context interface shared by all extension types
 */
export interface BaseExtensionContext {
  space: string
}

/**
 * Context for ExtNode type extensions
 */
export interface ExtNodeContext extends BaseExtensionContext {
  type: 'extNode'
  nodeId: string
}

/**
 * Context for TableView type extensions
 */
export interface TableViewContext extends BaseExtensionContext {
  type: 'tableView'
  tableId: string
  viewId: string
}

/**
 * Context for FileHandler type extensions
 */
export interface FileHandlerContext extends BaseExtensionContext {
  type: 'fileHandler'
  filePath: string
}

/**
 * Union of all extension context types
 */
export type ExtensionContextType = ExtNodeContext | TableViewContext | FileHandlerContext

/**
 * React context for extension props (first-party extensions)
 */
export const ExtensionReactContext = createContext<ExtensionContextType | null>(null)

/**
 * Provider component for extension context
 * Used to wrap first-party extensions with their context
 */
export function ExtensionContextProvider<T extends ExtensionContextType>({
  context,
  children,
}: {
  context: T
  children: ReactNode
}) {
  return (
    <ExtensionReactContext.Provider value={context}>
      {children}
    </ExtensionReactContext.Provider>
  )
}

/**
 * Parse extension context from URL (for third-party iframe extensions)
 * URL patterns:
 * - ExtNode: /<nodeId>
 * - TableView: /<tableId>/<viewId>
 * - FileHandler: #<filePath>
 */
function parseContextFromLocation(): ExtensionContextType | null {
  if (typeof window === 'undefined') return null

  const pathname = window.location.pathname
  const hash = window.location.hash
  const hostname = window.location.hostname

  // Extract space from hostname: <extId>.block.<space>.eidos.localhost
  const hostMatch = hostname.match(/\.block\.(.+)\.eidos\.localhost/)
  const space = hostMatch?.[1] || ''

  // FileHandler: uses hash for file path
  if (hash) {
    return {
      type: 'fileHandler',
      space,
      filePath: decodeURIComponent(hash.slice(1)), // Remove leading #
    }
  }

  const parts = pathname.split('/').filter(Boolean)

  // TableView: /<tableId>/<viewId>
  if (parts.length === 2) {
    return {
      type: 'tableView',
      space,
      tableId: parts[0],
      viewId: parts[1],
    }
  }

  // ExtNode: /<nodeId>
  if (parts.length === 1) {
    return {
      type: 'extNode',
      space,
      nodeId: parts[0],
    }
  }

  return null
}

/**
 * Generic hook to get extension context with type inference
 * 
 * @example ExtNode extension
 * ```tsx
 * const ctx = useExtensionContext<ExtNodeContext>()
 * console.log(ctx.nodeId) // Type-safe!
 * ```
 * 
 * @example TableView extension
 * ```tsx
 * const ctx = useExtensionContext<TableViewContext>()
 * console.log(ctx.tableId, ctx.viewId) // Type-safe!
 * ```
 * 
 * @example FileHandler extension
 * ```tsx
 * const ctx = useExtensionContext<FileHandlerContext>()
 * console.log(ctx.filePath) // Type-safe!
 * ```
 */
export function useExtensionContext<T extends ExtensionContextType = ExtensionContextType>(): T {
  // 1. Try React Context first (first-party extensions)
  const reactContext = useContext(ExtensionReactContext)
  if (reactContext) {
    return reactContext as T
  }

  // 2. Fallback to URL parsing (third-party iframe extensions)
  const urlContext = parseContextFromLocation()
  if (urlContext) {
    return urlContext as T
  }

  throw new Error(
    'useExtensionContext: No context available. ' +
    'First-party extensions should be wrapped with ExtensionContextProvider. ' +
    'Third-party extensions should run in the correct URL structure.'
  )
}

/**
 * Type guard to check if context is ExtNodeContext
 */
export function isExtNodeContext(ctx: ExtensionContextType): ctx is ExtNodeContext {
  return ctx.type === 'extNode'
}

/**
 * Type guard to check if context is TableViewContext
 */
export function isTableViewContext(ctx: ExtensionContextType): ctx is TableViewContext {
  return ctx.type === 'tableView'
}

/**
 * Type guard to check if context is FileHandlerContext
 */
export function isFileHandlerContext(ctx: ExtensionContextType): ctx is FileHandlerContext {
  return ctx.type === 'fileHandler'
}
