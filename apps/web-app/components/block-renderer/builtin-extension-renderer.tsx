/**
 * Built-in Extension Renderer
 *
 * Renders first-party extensions directly in React (no iframe)
 * with proper context injection via ExtensionContextProvider
 */
import {
  ExtensionContextProvider,
  type ExtNodeContext,
  type FileHandlerContext,
  type TableViewContext
} from "@eidos.space/react"
import { Suspense, type ReactNode } from "react"

import {
  builtInExtensions,
  getBuiltInExtension,
  isBuiltInExtension,
} from "@/extensions/builtin"

interface BuiltInExtNodeRendererProps {
  extensionSlug: string
  space: string
  nodeId: string
  fallback?: ReactNode
}

interface BuiltInTableViewRendererProps {
  extensionSlug: string
  space: string
  tableId: string
  viewId: string
  fallback?: ReactNode
}

interface BuiltInFileHandlerRendererProps {
  extensionSlug: string
  space: string
  filePath: string
  fallback?: ReactNode
}

/**
 * Renders a built-in ExtNode extension directly in React
 */
export function BuiltInExtNodeRenderer({
  extensionSlug,
  space,
  nodeId,
  fallback,
}: BuiltInExtNodeRendererProps) {
  const ext = getBuiltInExtension(extensionSlug)

  if (!ext) {
    console.warn(`Built-in extension not found: ${extensionSlug}`)
    return fallback || null
  }

  const context: ExtNodeContext = {
    type: "extNode",
    space,
    nodeId,
  }

  const Component = ext.component

  return (
    <Suspense fallback={fallback || <div>Loading...</div>}>
      <ExtensionContextProvider context={context}>
        <Component />
      </ExtensionContextProvider>
    </Suspense>
  )
}

/**
 * Renders a built-in TableView extension directly in React
 */
export function BuiltInTableViewRenderer({
  extensionSlug,
  space,
  tableId,
  viewId,
  fallback,
}: BuiltInTableViewRendererProps) {
  const ext = getBuiltInExtension(extensionSlug)

  if (!ext) {
    console.warn(`Built-in extension not found: ${extensionSlug}`)
    return fallback || null
  }

  const context: TableViewContext = {
    type: "tableView",
    space,
    tableId,
    viewId,
  }

  const Component = ext.component

  return (
    <Suspense fallback={fallback || <div>Loading...</div>}>
      <ExtensionContextProvider context={context}>
        <Component />
      </ExtensionContextProvider>
    </Suspense>
  )
}

/**
 * Renders a built-in FileHandler extension directly in React
 */
export function BuiltInFileHandlerRenderer({
  extensionSlug,
  space,
  filePath,
  fallback,
}: BuiltInFileHandlerRendererProps) {
  const ext = getBuiltInExtension(extensionSlug)

  if (!ext) {
    console.warn(`Built-in extension not found: ${extensionSlug}`)
    return fallback || null
  }

  const context: FileHandlerContext = {
    type: "fileHandler",
    space,
    filePath,
  }

  const Component = ext.component

  return (
    <Suspense fallback={fallback || <div>Loading...</div>}>
      <ExtensionContextProvider context={context}>
        <Component />
      </ExtensionContextProvider>
    </Suspense>
  )
}

// Re-export utilities
export { builtInExtensions, getBuiltInExtension, isBuiltInExtension }
