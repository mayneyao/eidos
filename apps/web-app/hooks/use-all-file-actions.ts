import type {
  IExtension,
  FileActionMeta,
} from "@/packages/core/types/IExtension"
import { ScriptExtensionType } from "@/packages/core/types/IExtension"

import {
  createExtensionStore,
  createUseSyncExtension,
  createUseAllExtensions,
} from "./use-extension-store-factory"

// Create store
const useFileActionStore = createExtensionStore<IExtension<FileActionMeta>>()

// Create sync hook
export const useSyncFileActions = createUseSyncExtension(useFileActionStore, {
  filterFn: (ext): ext is IExtension<FileActionMeta> =>
    ext.meta?.type === ScriptExtensionType.FileAction,
  metaTypeValue: ScriptExtensionType.FileAction,
  fineGrainedUpdates: true,
})

// Create all items hook
const useAll = createUseAllExtensions(useFileActionStore)

export const useAllFileActions = () => {
  const { items: fileActions, loading, reload } = useAll()

  return {
    fileActions,
    loading,
    reload,
  }
}
