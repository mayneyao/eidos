/**
 * Built-in Extension Renderer
 *
 * Renders first-party extensions directly in React (no iframe)
 * with proper context injection via ExtensionContextProvider
 */

import { Suspense, type ReactNode } from "react"
import {
  builtInExtensions,
  getBuiltInExtension,
  isBuiltInExtension,
} from "@/extensions/builtin"
import {
  ExtensionContextProvider,
  type ExtNodeContext,
  type FileHandlerContext,
  type FolderHandlerContext,
  type SidebarBlockContext,
  type TableViewContext,
} from "@eidos.space/react"

interface BuiltInExtNodeRendererProps {
  extensionSlug: string
  space: string
  locale: string
  nodeId: string
  fallback?: ReactNode
}

interface BuiltInTableViewRendererProps {
  extensionSlug: string
  space: string
  locale: string
  tableId: string
  viewId: string
  fallback?: ReactNode
}

interface BuiltInFileHandlerRendererProps {
  extensionSlug: string
  space: string
  locale: string
  filePath: string
  fallback?: ReactNode
}

interface BuiltInFolderHandlerRendererProps {
  extensionSlug: string
  space: string
  locale: string
  folderPath: string
  fallback?: ReactNode
}

interface BuiltInSidebarBlockRendererProps {
  extensionSlug: string
  space: string
  currentDay: string
  locale: string
  syncEnabled?: boolean
  fallback?: ReactNode
}

/**
 * Renders a built-in ExtNode extension directly in React
 */
export function BuiltInExtNodeRenderer({
  extensionSlug,
  space,
  locale,
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
    locale,
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
  locale,
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
    locale,
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
  locale,
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
    locale,
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

/**
 * Renders a built-in FolderHandler extension directly in React
 */
export function BuiltInFolderHandlerRenderer({
  extensionSlug,
  space,
  locale,
  folderPath,
  fallback,
}: BuiltInFolderHandlerRendererProps) {
  const ext = getBuiltInExtension(extensionSlug)

  if (!ext) {
    console.warn(`Built-in extension not found: ${extensionSlug}`)
    return fallback || null
  }

  // Extract folder name from path
  const folderName = folderPath.split("/").filter(Boolean).pop() || ""

  const context: FolderHandlerContext = {
    type: "folderHandler",
    space,
    locale,
    folderPath,
    folderName,
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
 * Renders a built-in SidebarBlock extension directly in React
 */
export function BuiltInSidebarBlockRenderer({
  extensionSlug,
  space,
  currentDay,
  locale,
  syncEnabled,
  fallback,
}: BuiltInSidebarBlockRendererProps) {
  const ext = getBuiltInExtension(extensionSlug)

  if (!ext) {
    console.warn(`Built-in extension not found: ${extensionSlug}`)
    return fallback || null
  }

  const context: SidebarBlockContext = {
    type: "sidebarBlock",
    space,
    currentDay,
    locale,
    syncEnabled,
  }

  const Component = ext.component

  return (
    <Suspense fallback={fallback || <div></div>}>
      <ExtensionContextProvider context={context}>
        <Component />
      </ExtensionContextProvider>
    </Suspense>
  )
}

// Re-export utilities
export { builtInExtensions, getBuiltInExtension, isBuiltInExtension }
