import type {
  IExtension,
  RelayHandlerMeta,
} from "@/packages/core/types/IExtension"
import { ScriptExtensionType } from "@/packages/core/types/IExtension"

import {
  createExtensionStore,
  createUseSyncExtension,
  createUseAllExtensions,
} from "./use-extension-store-factory"

// Create store
const useRelayHandlerStore =
  createExtensionStore<IExtension<RelayHandlerMeta>>()

// Create sync hook
export const useSyncRelayHandlers = createUseSyncExtension(
  useRelayHandlerStore,
  {
    filterFn: (ext): ext is IExtension<RelayHandlerMeta> =>
      ext.meta?.type === ScriptExtensionType.RelayHandler,
    metaTypeValue: ScriptExtensionType.RelayHandler,
    fineGrainedUpdates: true,
  }
)

// Create all items hook
const useAll = createUseAllExtensions(useRelayHandlerStore)

export const useAllRelayHandlers = () => {
  const { items: relayHandlers, loading, reload } = useAll()

  return {
    relayHandlers,
    loading,
    reload,
  }
}
