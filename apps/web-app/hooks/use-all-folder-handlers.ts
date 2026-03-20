import { useMemo } from "react"
import { useExtensionSettings } from "@/apps/web-app/hooks/use-extension-settings"
import { getBuiltInFolderHandlers } from "@/extensions/builtin"
import type {
  IExtension,
  FolderHandlerMeta,
} from "@/packages/core/types/IExtension"
import { BlockExtensionType } from "@/packages/core/types/IExtension"

import {
  createExtensionStore,
  createUseSyncExtension,
  createUseAllExtensions,
} from "./use-extension-store-factory"
import { matchFolderPattern } from "./use-folder-handlers"

// Create store
const useFolderHandlerStore =
  createExtensionStore<IExtension<FolderHandlerMeta>>()

// Create sync hook
export const useSyncFolderHandlers = createUseSyncExtension(
  useFolderHandlerStore,
  {
    filterFn: (ext): ext is IExtension<FolderHandlerMeta> =>
      ext.meta?.type === BlockExtensionType.FolderHandler,
    metaTypeValue: BlockExtensionType.FolderHandler,
    fineGrainedUpdates: true,
  }
)

// Create all items hook with built-in handlers merge
export const useAllFolderHandlers = () => {
  const { isExtensionEnabled } = useExtensionSettings()

  const useAll = createUseAllExtensions(useFolderHandlerStore, {
    transform: (dbHandlers) => {
      const builtInHandlers = getBuiltInFolderHandlers().filter((h) =>
        isExtensionEnabled(h.slug)
      )

      // Convert built-in extensions to IExtension<FolderHandlerMeta> format
      const builtInAsExtensions: IExtension<FolderHandlerMeta>[] =
        builtInHandlers.map(
          (builtIn) =>
            ({
              id: builtIn.id,
              slug: builtIn.slug,
              name: builtIn.name,
              type: "block" as const,
              description:
                (builtIn.meta as any)?.folderHandler?.description || "",
              version: "1.0.0",
              code: "",
              meta: builtIn.meta as FolderHandlerMeta,
              enabled: true,
              _builtIn: true,
              _builtInComponent: builtIn.component,
            }) as IExtension<FolderHandlerMeta> & {
              _builtIn?: boolean
              _builtInComponent?: any
            }
        )

      // Built-in handlers first, then database handlers
      return [...builtInAsExtensions, ...dbHandlers]
    },
  })

  const { items: folderHandlers, loading, reload } = useAll()

  return {
    folderHandlers,
    loading,
    reload,
  }
}

/**
 * Hook to query folder handlers that support a specific folder path
 */
export const useFolderHandlers = (folderPath: string) => {
  const { folderHandlers, loading } = useAllFolderHandlers()

  // Filter handlers that match this folder path
  const handlers = useMemo(() => {
    if (!folderPath) return []

    const matched = folderHandlers.filter((handler) => {
      const meta = handler.meta as FolderHandlerMeta
      const patterns = meta.folderHandler?.patterns || []
      return patterns.some((pattern) => matchFolderPattern(folderPath, pattern))
    })

    // Sort by priority (higher first), default priority is 0
    return matched.sort((a, b) => {
      const priorityA =
        (a.meta as FolderHandlerMeta).folderHandler?.priority ?? 0
      const priorityB =
        (b.meta as FolderHandlerMeta).folderHandler?.priority ?? 0
      return priorityB - priorityA
    })
  }, [folderHandlers, folderPath])

  return { handlers, isLoading: loading }
}
