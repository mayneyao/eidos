import { useMemo } from "react"
import { useExtensionSettings } from "@/apps/web-app/hooks/use-extension-settings"
import { getBuiltInFileHandlers } from "@/extensions/builtin"
import type {
  IExtension,
  FileHandlerMeta,
} from "@/packages/core/types/IExtension"
import { BlockExtensionType } from "@/packages/core/types/IExtension"

import {
  createExtensionStore,
  createUseSyncExtension,
  createUseAllExtensions,
} from "./use-extension-store-factory"

// Create store
const useFileHandlerStore = createExtensionStore<IExtension<FileHandlerMeta>>()

// Create sync hook
export const useSyncFileHandlers = createUseSyncExtension(useFileHandlerStore, {
  filterFn: (ext): ext is IExtension<FileHandlerMeta> =>
    ext.meta?.type === BlockExtensionType.FileHandler,
  metaTypeValue: BlockExtensionType.FileHandler,
  fineGrainedUpdates: true,
})

// Create all items hook with built-in handlers merge
export const useAllFileHandlers = () => {
  const { isExtensionEnabled } = useExtensionSettings()

  const useAll = createUseAllExtensions(useFileHandlerStore, {
    transform: (dbHandlers) => {
      const builtInHandlers = getBuiltInFileHandlers().filter((h) =>
        isExtensionEnabled(h.slug)
      )

      // Convert built-in extensions to IExtension<FileHandlerMeta> format
      const builtInAsExtensions: IExtension<FileHandlerMeta>[] =
        builtInHandlers.map(
          (builtIn) =>
            ({
              id: builtIn.id,
              slug: builtIn.slug,
              name: builtIn.name,
              type: "block" as const,
              description:
                (builtIn.meta as any)?.fileHandler?.description || "",
              version: "1.0.0",
              code: "",
              meta: builtIn.meta as FileHandlerMeta,
              enabled: true,
              _builtIn: true,
              _builtInComponent: builtIn.component,
            }) as IExtension<FileHandlerMeta> & {
              _builtIn?: boolean
              _builtInComponent?: any
            }
        )

      // Built-in handlers first, then database handlers
      return [...builtInAsExtensions, ...dbHandlers]
    },
  })

  const { items: fileHandlers, loading, reload } = useAll()

  return {
    fileHandlers,
    loading,
    reload,
  }
}
