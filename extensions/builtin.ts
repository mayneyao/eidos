/**
 * Built-in Extensions Registry
 *
 * Direct imports for built-in extensions (first-party, trusted)
 * These extensions render directly in React without iframe sandbox
 */
import type { ComponentType } from "react"
import type { ExtensionMeta } from "@eidos.space/core/types/IExtension"

import * as AgentHistory from "./blocks/agent"
import * as FolderBrowser from "./blocks/folder-browser"
import * as Graft from "./blocks/graft"
import * as Journal from "./blocks/journal"
import * as MediaPreview from "./blocks/media-preview"
import * as MonacoEditor from "./blocks/monaco-editor"
// Register extension info for eject feature (avoids circular dependency)
import { registerExtensionInfo } from "./eject-extension"
// Initialize extension sources for eject feature
import { initializeExtensionSources } from "./source-registry"

export interface BuiltInExtension {
  id: string
  slug: string
  name: string
  type: "block" | "script"
  meta: ExtensionMeta
  icon?: string
  component: ComponentType<any>
  isBuiltIn: true
}

/**
 * Helper to register a built-in extension from its module
 */
function register(slug: string, module: any): BuiltInExtension {
  const meta = module.meta as ExtensionMeta
  const componentName = (meta as any).componentName as string
  const component = module[componentName] as ComponentType<any>
  const icon = (meta as any).icon as string | undefined

  if (!meta || !component) {
    throw new Error(
      `Invalid extension module for ${slug}. Check meta and componentName.`
    )
  }

  return {
    id: `builtin-${slug}`,
    slug,
    name:
      (meta as any).extNode?.title ||
      (meta as any).tableView?.title ||
      (meta as any).fileHandler?.title ||
      (meta as any).folderHandler?.title ||
      (meta as any).sidebarBlock?.title ||
      slug,
    type: "block",
    meta,
    icon,
    component,
    isBuiltIn: true,
  }
}

/**
 * Registry of all built-in extensions
 */
export const builtInExtensions: BuiltInExtension[] = [
  register("agent", AgentHistory),
  register("journal", Journal),
  register("graft", Graft),
  register("monaco-editor", MonacoEditor),
  register("media-preview", MediaPreview),
  register("folder-browser", FolderBrowser),
]

builtInExtensions.forEach((ext) => {
  registerExtensionInfo({
    slug: ext.slug,
    name: ext.name,
    type: ext.type,
    meta: ext.meta,
    icon: ext.icon,
  })
})

/**
 * Get a built-in extension by its slug
 */
export function getBuiltInExtension(
  slug: string
): BuiltInExtension | undefined {
  return builtInExtensions.find((ext) => ext.slug === slug)
}

/**
 * Get a built-in extension by its ID
 */
export function getBuiltInExtensionById(
  id: string
): BuiltInExtension | undefined {
  return builtInExtensions.find((ext) => ext.id === id)
}

/**
 * Check if an extension ID is a built-in extension
 */
export function isBuiltInExtension(idOrSlug: string): boolean {
  return builtInExtensions.some(
    (ext) => ext.id === idOrSlug || ext.slug === idOrSlug
  )
}

/**
 * Get a built-in FileHandler extension that can handle a specific file extension
 * @param fileExtension - File extension with the dot (e.g., '.js', '.ts', '.md')
 */
export function getBuiltInFileHandler(
  fileExtension: string
): BuiltInExtension | undefined {
  const ext = fileExtension.toLowerCase()
  return builtInExtensions.find((builtIn) => {
    const meta = builtIn.meta as any
    if (meta?.type !== "fileHandler" || !meta?.fileHandler?.extensions) {
      return false
    }
    return meta.fileHandler.extensions.includes(ext)
  })
}

/**
 * Get all built-in FileHandler extensions
 */
export function getBuiltInFileHandlers(): BuiltInExtension[] {
  return builtInExtensions.filter(
    (ext) => (ext.meta as any)?.type === "fileHandler"
  )
}

/**
 * Get all built-in FolderHandler extensions
 */
export function getBuiltInFolderHandlers(): BuiltInExtension[] {
  return builtInExtensions.filter(
    (ext) => (ext.meta as any)?.type === "folderHandler"
  )
}

initializeExtensionSources()

// Re-export eject functions and types
export {
  ejectBuiltInExtension,
  canEjectExtension,
  getEjectibleExtensionSlugs,
  type EjectResult,
  type EjectRecord,
} from "./eject-extension"

// Log loaded extensions in development
if (import.meta.env.DEV) {
  console.log(
    "[Extensions] Built-in Registry Loaded:",
    builtInExtensions.map((e) => e.slug)
  )
}
